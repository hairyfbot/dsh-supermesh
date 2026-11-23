import { describe, expect, it } from 'vitest'
import { resource as githubResource } from '@/channel/github/service/resource'
import { resource as gitlabResource } from '@/channel/gitlab/service/resource'

describe('gitHub 资源解析', () => {
  it('识别 https 与 ssh 两种远端，忽略大小写与 .git 后缀', () => {
    for (const remote of [
      'https://github.com/Owner/Repo.git',
      'https://github.com/owner/repo',
      'git@github.com:owner/repo.git',
      'ssh://git@github.com/owner/repo',
    ])
      expect(githubResource.of(remote)).toBe('owner/repo')
  })
  it('拒绝非 github.com 或带凭据的远端', () => {
    for (const remote of [null, '', 'https://gitlab.com/owner/repo', 'https://user:pass@github.com/owner/repo', 'https://github.com:8443/owner/repo', 'https://github.com/owner'])
      expect(githubResource.of(remote)).toBeNull()
  })
  it('短格式与网页地址解析成同一目标', () => {
    const short = githubResource.parse('github:owner/repo:pull:42')
    const web = githubResource.parse('https://github.com/owner/repo/pull/42')
    expect(short).toEqual(web)
    expect(short).toEqual({ repository: 'owner/repo', kind: 'pull', number: 42 })
  })
  it('拒绝非 https、非本域与编号为零的地址', () => {
    for (const value of ['https://gitlab.com/owner/repo/issues/1', 'http://github.com/owner/repo/issues/1', 'https://github.com/owner/repo/issues/0', 'https://github.com/owner/repo'])
      expect(() => githubResource.parse(value)).toThrow('invalid_resource')
  })
  it('改名或转移时返回新全名，未改名返回 null', () => {
    expect(githubResource.renamed('owner/old', 'owner/new')).toBe('owner/new')
    expect(githubResource.renamed('owner/old', 'Other/Old')).toBe('other/old')
    expect(githubResource.renamed('owner/repo', 'Owner/Repo')).toBeNull()
    expect(() => githubResource.renamed('owner/repo', 'not a repository')).toThrow('invalid_response')
  })
})

describe('gitLab 资源解析', () => {
  const site = 'https://gitlab.com'
  it('四种实际 URL 形态都归一到 11.3.5 旧形态', () => {
    const expected = 'https://gitlab.com/group/project/issues/7'
    for (const value of [
      'https://gitlab.com/group/project/issues/7',
      'https://gitlab.com/group/project/-/issues/7',
      'https://gitlab.com/group/project/-/work_items/7',
    ])
      expect(gitlabResource.url(gitlabResource.parse(value, site))).toBe(expected)
    expect(gitlabResource.url(gitlabResource.parse('https://gitlab.com/group/project/merge_requests/9', site))).toBe('https://gitlab.com/group/project/merge_requests/9')
  })
  it('短格式与 notes 锚点都能解析', () => {
    expect(gitlabResource.parse('gitlab:group/project:mr:9', site)).toEqual({ site, repository: 'group/project', kind: 'pull', number: 9 })
    expect(gitlabResource.parse('https://gitlab.com/group/project/issues/7#note_123', site).number).toBe(7)
  })
  it('拒绝跨站、非 https 与非法锚点', () => {
    for (const value of ['https://evil.example/group/project/issues/7', 'http://gitlab.com/group/project/issues/7', 'https://gitlab.com/group/project/issues/7#evil', 'https://gitlab.com/single/issues/7'])
      expect(() => gitlabResource.parse(value, site)).toThrow('invalid_resource')
  })
  it('纯 HTTP 自建站点按配置 origin 认远端与资源', () => {
    const http = 'http://git.example.test'
    expect(gitlabResource.remote('http://git.example.test/group/project.git', http)).toEqual({ site: http, repository: 'group/project' })
    expect(gitlabResource.remote('git@git.example.test:group/project.git', http)).toEqual({ site: http, repository: 'group/project' })
    expect(gitlabResource.remote('https://git.example.test/group/project.git', http)).toEqual({ site: http, repository: 'group/project' })
    expect(gitlabResource.remote('http://other.example.test/group/project.git', http)).toBeNull()
    expect(gitlabResource.url(gitlabResource.parse('http://git.example.test/group/project/-/issues/7', http))).toBe('http://git.example.test/group/project/issues/7')
    expect(() => gitlabResource.parse('https://git.example.test/group/project/issues/7', http)).toThrow('invalid_resource')
  })
  it('note 归属校验拦住跨话题与错类型', () => {
    const target = { site, repository: 'group/project', kind: 'issue' as const, number: 7 }
    expect(() => gitlabResource.validateNote({ id: 1, noteable_iid: 8 }, target)).toThrow('source_repository_mismatch')
    expect(() => gitlabResource.validateNote({ id: 1, noteable_type: 'MergeRequest' }, target)).toThrow('source_repository_mismatch')
    expect(() => gitlabResource.validateNote({ id: 1, noteable_iid: 7, noteable_type: 'Issue' }, target)).not.toThrow()
  })
})
