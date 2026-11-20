import { describe, expect, it } from 'vitest'
import { parseRepositoryRemote } from '@/utils/repository'

describe('repository remote parsing at the trusted boundary', () => {
  it.each(['https://github.com/Owner/Repository.git', 'git@github.com:Owner/Repository.git', 'ssh://git@github.com/Owner/Repository.git'])('normalizes %s to one webpage identity and workspace default', (remote) => {
    expect(parseRepositoryRemote(remote)).toMatchObject({ platform: 'github', host: 'github.com', owner: 'Owner', name: 'Repository', webUrl: 'https://github.com/Owner/Repository', defaultName: 'github/Repository' })
  })

  it('accepts GitLab nested groups only on the configured self-hosted site', () => {
    expect(parseRepositoryRemote('git@git.example.test:group/subgroup/repository.git', 'https://git.example.test')).toMatchObject({ platform: 'gitlab', owner: 'group/subgroup', name: 'repository', webUrl: 'https://git.example.test/group/subgroup/repository', defaultName: 'gitlab/repository' })
    expect(() => parseRepositoryRemote('https://git.example.test/group/repository')).toThrow('invalid_repository_remote')
    expect(() => parseRepositoryRemote('https://other.example.test/group/repository', 'https://git.example.test')).toThrow('invalid_repository_remote')
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
