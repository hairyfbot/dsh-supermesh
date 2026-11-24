import { describe, expect, it } from 'vitest'
import { parseGitRemote, parseRepositoryRemote, repositoryOf } from '@/utils/repository'

describe('repository remote parsing at the trusted boundary', () => {
  it.each(['https://github.com/Owner/Repository.git', 'git@github.com:Owner/Repository.git', 'ssh://git@github.com/Owner/Repository.git'])('normalizes %s to one webpage identity and workspace default', (remote) => {
    expect(parseRepositoryRemote(remote)).toMatchObject({ platform: 'github', host: 'github.com', owner: 'Owner', name: 'Repository', webUrl: 'https://github.com/Owner/Repository', defaultName: 'github/Repository' })
  })

  it('accepts GitLab nested groups only on the configured self-hosted site', () => {
    expect(parseRepositoryRemote('git@git.example.test:group/subgroup/repository.git', 'https://git.example.test')).toMatchObject({ platform: 'gitlab', owner: 'group/subgroup', name: 'repository', webUrl: 'https://git.example.test/group/subgroup/repository', defaultName: 'gitlab/repository' })
    expect(() => parseRepositoryRemote('https://git.example.test/group/repository')).toThrow('invalid_repository_remote')
    expect(() => parseRepositoryRemote('https://other.example.test/group/repository', 'https://git.example.test')).toThrow('invalid_repository_remote')
  })

  it('keeps the plain HTTP protocol of a self-hosted GitLab remote', () => {
    expect(parseRepositoryRemote('http://git.example.test/group/subgroup/repository.git', 'http://git.example.test')).toMatchObject({ platform: 'gitlab', host: 'git.example.test', owner: 'group/subgroup', name: 'repository', remoteUrl: 'http://git.example.test/group/subgroup/repository.git', webUrl: 'http://git.example.test/group/subgroup/repository' })
  })

  it('maps an ssh remote to the protocol of the configured site', () => {
    expect(parseGitRemote('git@git.example.test:group/repository.git', 'http://git.example.test').webUrl).toBe('http://git.example.test/group/repository')
    expect(parseGitRemote('git@git.example.test:group/repository.git', 'https://git.example.test').webUrl).toBe('https://git.example.test/group/repository')
    expect(parseGitRemote('git@git.example.test:group/repository.git', 'http://other.example.test').webUrl).toBe('https://git.example.test/group/repository')
  })

  it('accepts a self-hosted port but keeps GitHub on the default https port', () => {
    expect(parseGitRemote('https://git.example.test:8443/group/repository.git').webUrl).toBe('https://git.example.test:8443/group/repository')
    expect(() => parseGitRemote('https://github.com:444/org/repo')).toThrow('invalid_repository_remote')
  })

  it.each([
    ['https://github.com/Owner/Repository.git', 'owner/repository'],
    ['git@github.com:Owner/Repository.git', 'owner/repository'],
    ['https://github.com/Owner/Repository/issues/5', 'owner/repository'],
    ['https://github.com/Owner/Repository/pull/5#discussion_r1', 'owner/repository'],
    ['https://git.example.test/group/subgroup/repository/-/merge_requests/7', 'group/subgroup/repository'],
    ['https://git.example.test/group/subgroup/repository/issues/7', 'group/subgroup/repository'],
    ['https://github.com/Owner/Repository', 'owner/repository'],
    [null, null],
  ])('normalizes %j to one repository key', (value, expected) => {
    expect(repositoryOf(value)).toBe(expected)
  })

  it.each([
    '',
    'file:///tmp/repository',
    '/tmp/repository',
    'C:\\repository',
    '../repository',
    '--upload-pack=evil',
    'ext::command',
    'git://github.com/org/repo',
    'http://github.com/org/repo',
    'https://token@github.com/org/repo',
    'https://user:password@github.com/org/repo',
    'ssh://root@github.com/org/repo',
    'git@github.com:org/repo;command',
    'https://github.com/org/repo?token=secret',
    'https://github.com/org/repo#fragment',
    'https://github.com/org/../repo',
    'https://github.com/org/%2e%2e/repo',
    'https://github.com/org/repo/extra',
    'https://github.com.evil.test/org/repo',
    'https://github.com:444/org/repo',
    'https://github.com/org/repo\\extra',
    'https://github.com/org/repo\n',
    'git@github.com:-owner/repo',
  ])('rejects unsafe or unsupported remote %j', (remote) => {
    expect(() => parseRepositoryRemote(remote)).toThrow('invalid_repository_remote')
  })
})
