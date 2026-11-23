import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hosts } from '@/channel/gitlab/service/hosts'
import { resource } from '@/channel/gitlab/service/resource'
import { db } from '@/database'

describe('gitLab 自建实例的网页 host 别名', () => {
  it('学到 external_url 域名后，web_url 形态按配置站点解析', async () => {
    const suffix = randomUUID().slice(0, 8)
    const site = `http://10.0.0.${suffix.length}`
    const webHost = `gitlab-${suffix}.corp.test`
    await db.channel.saveConfiguration('gitlab', 'GitLab', site, true, { commitName: '', commitEmail: '' })
    await hosts.ready()
    expect(hosts.allowed(site)).not.toContain(webHost)
    expect(() => resource.parse(`http://${webHost}/group/project/-/issues/7`, site)).toThrow('invalid_resource')
    expect(resource.remote(`http://${webHost}/group/project.git`, site)).toBeNull()

    await hosts.learn(site, `http://${webHost}/group/project`)

    expect(hosts.allowed(site)).toContain(webHost)
    expect(resource.parse(`http://${webHost}/group/project/-/issues/7`, site)).toEqual({ site, repository: 'group/project', kind: 'issue', number: 7 })
    expect(resource.parse(`http://${webHost}/group/project/issues/7#note_12`, site).number).toBe(7)
    expect(resource.remote(`http://${webHost}/group/project.git`, site)).toEqual({ site, repository: 'group/project' })
    expect(resource.remote(`git@${webHost}:group/project.git`, site)).toEqual({ site, repository: 'group/project' })
    expect(resource.remote(`http://other-${suffix}.corp.test/group/project.git`, site)).toBeNull()
  })

  it('配置站点变更后不再沿用旧站点的别名', async () => {
    const suffix = randomUUID().slice(0, 8)
    const site = `http://10.1.0.${suffix.length}`
    const webHost = `legacy-${suffix}.corp.test`
    await db.channel.saveConfiguration('gitlab', 'GitLab', site, true, { commitName: '', commitEmail: '' })
    await hosts.ready()
    await hosts.learn(site, `http://${webHost}/group/project`)
    expect(hosts.allowed(site)).toContain(webHost)

    const moved = `http://10.2.0.${suffix.length}`
    await db.channel.saveConfiguration('gitlab', 'GitLab', moved, true, { commitName: '', commitEmail: '' })
    expect(hosts.allowed(moved)).not.toContain(webHost)
    expect(() => resource.parse(`http://${webHost}/group/project/issues/7`, moved)).toThrow('invalid_resource')
  })

  it('来源键带站点，API 仓库路径只认 path_with_namespace', () => {
    const site = 'http://10.3.0.7'
    const remote = resource.remote('http://10.3.0.7/group/subgroup/project.git', site)!
    expect(remote.repository).toBe('group/subgroup/project')
    expect(resource.source(remote)).toBe('http://10.3.0.7/group/subgroup/project')
  })
})
