import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { describe, expect, it } from 'vitest'
import { changeRequestUrls, githubEvidence, pushedBranches, shellEvidence } from '@/service/forge.evidence'

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

describe('changeRequestUrls', () => {
  it('finds merge request links in either URL shape', () => {
    const output = [
      'Creating merge request for feat/foo into main in owner/repo',
      '',
      'https://gitlab.com/owner/repo/-/merge_requests/12',
      'https://gitlab.com/owner/repo/merge_requests/13',
    ].join('\n')
    expect(changeRequestUrls(output)).toEqual([
      'https://gitlab.com/owner/repo/-/merge_requests/12',
      'https://gitlab.com/owner/repo/merge_requests/13',
    ])
  })

  it('finds pull request links and skips the compare page a push prints', () => {
    const output = [
      'remote: Create a pull request for \'dsh/T-046\' on GitHub by visiting:',
      'remote:      https://github.com/owner/repo/pull/new/dsh/T-046',
      'https://github.com/owner/repo/pull/1635',
    ].join('\n')
    expect(changeRequestUrls(output)).toEqual(['https://github.com/owner/repo/pull/1635'])
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

const repository = 'dsh-tauri/deepseek-harness-desktop'
const pushOutput = [
  'remote: ',
  'remote: Create a pull request for \'dsh/T-046\' on GitHub by visiting:',
  'remote:      https://github.com/dsh-tauri/deepseek-harness-desktop/pull/new/dsh/T-046',
  'remote: ',
  'To https://github.com/dsh-tauri/deepseek-harness-desktop.git',
  ' * [new branch]        dsh/T-046 -> dsh/T-046',
  'branch \'dsh/T-046\' set up to track \'origin/dsh/T-046\'.',
].join('\n')

describe('githubEvidence', () => {
  it('reads the pull request a run_code dispatch created', () => {
    const evidence = githubEvidence([
      dispatch('call_c2a204fb699a4c52be1bba98', 'pwsh', 'gh pr create --draft --repo dsh-tauri/deepseek-harness-desktop --base main --head dsh/T-046 --title "fix(desktop): 核心页管理远端核心" --body-file .temp/pr-body.md 2>&1 | Select-Object -Last 5'),
      result('call_c2a204fb699a4c52be1bba98', 'https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1635'),
    ], repository)
    expect(evidence.urls).toEqual(['https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1635'])
    expect(evidence.branches).toEqual([])
  })

  it('reads the pull request a channel wrapper created', () => {
    const evidence = githubEvidence([
      dispatch('call_wrapper', 'pwsh', 'gh-default pr create --repo dsh-tauri/deepseek-harness-desktop --base main --head dsh/T-050 --title "x" --body "y"'),
      result('call_wrapper', 'exit=0\nhttps://github.com/dsh-tauri/deepseek-harness-desktop/pull/1640\n'),
    ], repository)
    expect(evidence.urls).toEqual(['https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1640'])
  })

  it('reads the pull request a direct pwsh call created', () => {
    const evidence = githubEvidence([
      call('call_direct', 'pwsh', 'gh pr create --fill --base main'),
      result('call_direct', 'https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1640'),
    ], repository)
    expect(evidence.urls).toEqual(['https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1640'])
  })

  it('ignores a create whose result failed', () => {
    const evidence = githubEvidence([
      dispatch('call_failed', 'pwsh', 'gh pr create --draft --fill'),
      result('call_failed', 'https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1636', true),
    ], repository)
    expect(evidence).toEqual({ urls: [], branches: [], forks: [] })
  })

  it('drops pull requests of another repository but keeps its pushes as fork heads', () => {
    const evidence = githubEvidence([
      dispatch('call_other', 'pwsh', 'gh pr create --draft --fill'),
      result('call_other', 'https://github.com/dsh-tauri/dsh-pet-component/pull/12'),
      dispatch('call_push_other', 'pwsh', 'git push -u origin dsh/T-047'),
      result('call_push_other', 'To https://github.com/dsh-tauri/dsh-pet-component.git\n * [new branch]        dsh/T-047 -> dsh/T-047'),
    ], repository)
    expect(evidence.urls).toEqual([])
    expect(evidence.branches).toEqual([])
    expect(evidence.forks).toEqual([{ remote: 'https://github.com/dsh-tauri/dsh-pet-component.git', branch: 'dsh/T-047' }])
  })

  it('reads the branch a push reported to this repository', () => {
    const evidence = githubEvidence([
      dispatch('call_8f181b1c175b4666b2b4faa9', 'pwsh', 'git push -u origin dsh/T-046 2>&1 | Select-Object -Last 10'),
      result('call_8f181b1c175b4666b2b4faa9', pushOutput),
    ], repository)
    expect(evidence.branches).toEqual([{ remote: 'https://github.com/dsh-tauri/deepseek-harness-desktop.git', branch: 'dsh/T-046' }])
    expect(evidence.urls).toEqual([])
  })

  it('reads a push and a create from the same run_code dispatch', () => {
    const evidence = githubEvidence([
      dispatch('call_both', 'pwsh', 'git push -u origin dsh/T-046'),
      dispatch('call_both', 'pwsh', 'gh pr create --draft --fill'),
      result('call_both', `${pushOutput}\nhttps://github.com/dsh-tauri/deepseek-harness-desktop/pull/1635`),
    ], repository)
    expect(evidence.branches).toEqual([{ remote: 'https://github.com/dsh-tauri/deepseek-harness-desktop.git', branch: 'dsh/T-046' }])
    expect(evidence.urls).toEqual(['https://github.com/dsh-tauri/deepseek-harness-desktop/pull/1635'])
  })
})
