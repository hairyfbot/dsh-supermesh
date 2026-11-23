import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { mergeRequestUrls, pushedBranches, shellEvidence } from '@/service/forge.evidence'

function call(callId: string, name: string, command: string): SessionEvent {
  return { type: 'tool/call', seq: 1, time: 0, data: { turn: 1, step: 1, callId, name, arguments: JSON.stringify({ command }) } } as unknown as SessionEvent
}

function result(callId: string, text: string, isError = false): SessionEvent {
  return { type: 'tool/result', seq: 2, time: 0, data: { turn: 1, step: 1, message: { toolCallId: callId, isError, content: [{ type: 'text', text }] } } } as unknown as SessionEvent
}

function dispatch(rootCallId: string, name: string, command: string): SessionEvent {
  return { type: 'tool/ptc-dispatch', seq: 1, time: 0, data: { rootCallId, parentCallId: rootCallId, subCallId: `${rootCallId}:ptc:1`, name, arguments: { command } } } as unknown as SessionEvent
}

const turnEnd = { type: 'turn/end', seq: 3, time: 0, data: { reason: { kind: 'completed' } } } as unknown as SessionEvent

describe('pushedBranches', () => {
  it('reads the branches a push reported under each remote', () => {
    const output = [
      'To https://github.com/owner/repo.git',
      '   4f8b2c1..9a7d3e5  feat/self-made -> feat/self-made',
      ' + 1a2b3c4...5d6e7f8 main -> main (forced update)',
    ].join('\n')
    expect(pushedBranches(output)).toEqual([
      { remote: 'https://github.com/owner/repo.git', branch: 'feat/self-made' },
      { remote: 'https://github.com/owner/repo.git', branch: 'main' },
    ])
  })

  it('skips rejected refs, deleted refs, and new tags', () => {
    const output = [
      'To https://github.com/owner/repo.git',
      ' ! [rejected]        feat/foo -> feat/foo (non-fast-forward)',
      ' - [deleted]         feat/gone',
      ' * [new tag]         v1.0.0 -> v1.0.0',
      ' * [new branch]      feat/kept -> feat/kept',
    ].join('\n')
    expect(pushedBranches(output)).toEqual([{ remote: 'https://github.com/owner/repo.git', branch: 'feat/kept' }])
  })

  it('ignores ref lines that belong to no remote', () => {
    expect(pushedBranches('   4f8b2c1..9a7d3e5  feat/foo -> feat/foo')).toEqual([])
  })
})

describe('mergeRequestUrls', () => {
  it('finds merge request links in either URL shape', () => {
    const output = [
      'Creating merge request for feat/foo into main in owner/repo',
      '',
      'https://gitlab.com/owner/repo/-/merge_requests/12',
      'https://gitlab.com/owner/repo/merge_requests/13',
    ].join('\n')
    expect(mergeRequestUrls(output)).toEqual([
      'https://gitlab.com/owner/repo/-/merge_requests/12',
      'https://gitlab.com/owner/repo/merge_requests/13',
    ])
  })
})

describe('shellEvidence', () => {
  it('pairs a create call with its result', () => {
    const evidence = shellEvidence([
      call('a', 'bash', 'glab mr create --fill --yes'),
      result('a', 'https://gitlab.com/owner/repo/-/merge_requests/12'),
    ])
    expect(evidence.urls).toEqual(['https://gitlab.com/owner/repo/-/merge_requests/12'])
    expect(evidence.branches).toEqual([])
  })

  it('pairs a push call with the branches it reported', () => {
    const evidence = shellEvidence([
      call('b', 'pwsh', 'git push -u origin feat/self-made'),
      result('b', 'To https://gitlab.com/owner/repo.git\n * [new branch]      feat/self-made -> feat/self-made'),
    ])
    expect(evidence.branches).toEqual([{ remote: 'https://gitlab.com/owner/repo.git', branch: 'feat/self-made' }])
  })

  it('ignores failed results, other tools, and unrelated commands', () => {
    const evidence = shellEvidence([
      call('c', 'bash', 'glab mr create --fill'),
      result('c', 'boom', true),
      call('d', 'read', 'glab mr create --fill'),
      result('d', 'https://gitlab.com/owner/repo/-/merge_requests/12'),
      call('e', 'bash', 'git status'),
      result('e', 'To https://gitlab.com/owner/repo.git\n * [new branch]      x -> x'),
    ])
    expect(evidence).toEqual({ urls: [], branches: [] })
  })

  it('drops a call whose turn ended without a result', () => {
    const evidence = shellEvidence([
      call('f', 'bash', 'glab mr create --fill'),
      turnEnd,
      result('f', 'https://gitlab.com/owner/repo/-/merge_requests/12'),
    ])
    expect(evidence.urls).toEqual([])
  })

  it('reads shell calls dispatched from run_code', () => {
    const evidence = shellEvidence([
      dispatch('root', 'pwsh', 'git push -u origin feat/self-made'),
      result('root', 'To https://gitlab.com/owner/repo.git\n * [new branch]      feat/self-made -> feat/self-made'),
      dispatch('root2', 'pwsh', 'glab mr create --fill --yes'),
      result('root2', 'https://gitlab.com/owner/repo/-/merge_requests/12'),
    ])
    expect(evidence.branches).toEqual([{ remote: 'https://gitlab.com/owner/repo.git', branch: 'feat/self-made' }])
    expect(evidence.urls).toEqual(['https://gitlab.com/owner/repo/-/merge_requests/12'])
  })

  it('keeps both evidence kinds when one run_code dispatches push and create', () => {
    const evidence = shellEvidence([
      dispatch('root3', 'pwsh', 'git push -u origin feat/x'),
      dispatch('root3', 'pwsh', 'glab mr create --fill'),
      result('root3', [
        'To https://gitlab.com/owner/repo.git',
        ' * [new branch]      feat/x -> feat/x',
        'https://gitlab.com/owner/repo/-/merge_requests/21',
      ].join('\n')),
    ])
    expect(evidence.branches).toEqual([{ remote: 'https://gitlab.com/owner/repo.git', branch: 'feat/x' }])
    expect(evidence.urls).toEqual(['https://gitlab.com/owner/repo/-/merge_requests/21'])
  })

  it('ignores run_code dispatches that are not shell tools', () => {
    const evidence = shellEvidence([
      dispatch('root4', 'read_channel', 'glab mr create --fill'),
      result('root4', 'https://gitlab.com/owner/repo/-/merge_requests/12'),
    ])
    expect(evidence).toEqual({ urls: [], branches: [] })
  })

  it('keeps both the direct and the run_code call shapes in one session', () => {
    const evidence = shellEvidence([
      call('direct', 'pwsh', 'git push -u origin feat/direct'),
      result('direct', 'To https://gitlab.com/owner/repo.git\n * [new branch]      feat/direct -> feat/direct'),
      dispatch('root5', 'pwsh', 'glab mr create --fill'),
      result('root5', 'https://gitlab.com/owner/repo/-/merge_requests/31'),
      dispatch('root6', 'pwsh', 'git push -u origin feat/program'),
      result('root6', 'To https://gitlab.com/owner/repo.git\n * [new branch]      feat/program -> feat/program'),
    ])
    expect(evidence.branches).toEqual([
      { remote: 'https://gitlab.com/owner/repo.git', branch: 'feat/direct' },
      { remote: 'https://gitlab.com/owner/repo.git', branch: 'feat/program' },
    ])
    expect(evidence.urls).toEqual(['https://gitlab.com/owner/repo/-/merge_requests/31'])
  })
})
