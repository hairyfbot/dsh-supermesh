import type { ReactNode } from 'react'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsyncFn } from '@reause/core'
import { useEffect, useId, useRef, useState } from 'react'
import { parseRepositoryRemote } from '../../../../utils/repository'
import { getApiNexusPanel, patchApiNexusProjectsId, postApiNexusProjects } from '../../../apis'
import { Empty } from '../../../components/empty'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'
import { AddRepository } from './add-repository'

export function Projects(): ReactNode {
  const { t } = useTranslation()
  const lifetime = useRef(new AbortController())
  // keep:effect Abort project requests when the settings section is disposed.
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  const projects = useStore(state => state.data.panel?.projects ?? [])
  const gitlabHost = useStore(state => state.data.panel?.channels.find(channel => channel.id === 'gitlab')?.host ?? 'https://gitlab.com')
  const refreshedAt = useStore(state => state.setting.refreshedAt)
  const { receiveProject, receivePanel, clearSettingNotice } = useActions()
  const [saving, toggle] = useAsyncFn(async (projectId: string, enabled: boolean) => {
    clearSettingNotice()
    const project = await patchApiNexusProjectsId({ id: encodeURIComponent(projectId) }, { enabled }, { signal: lifetime.current.signal })
    if (lifetime.current.signal.aborted)
      return
    if (!project || project.id !== projectId)
      throw new Error(project && 'message' in project && typeof project.message === 'string' ? project.message : '项目设置保存失败')
    receiveProject(project)
  })
  const [refreshing, refresh] = useAsyncFn(async () => {
    clearSettingNotice()
    const projects = await postApiNexusProjects({ signal: lifetime.current.signal })
    if (lifetime.current.signal.aborted)
      return
    if (!Array.isArray(projects))
      throw new Error('项目发现失败')
    const panel = await getApiNexusPanel({ signal: lifetime.current.signal })
    if (lifetime.current.signal.aborted)
      return
    if (!panel?.projects || !panel.settings)
      throw new Error('项目列表加载失败')
    receivePanel(panel)
  })
  const id = useId()
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const candidates = projects.filter(project => project.remoteUrl && project.available !== false).map((project) => {
    let repository: ReturnType<typeof parseRepositoryRemote> | null = null
    try {
      repository = parseRepositoryRemote(project.remoteUrl!, gitlabHost)
    }
    catch {}
    return { ...project, repository }
  }).filter(project => project.repository)
  const visible = candidates.filter(project => !normalized || [project.name, project.repository!.platform, project.repository!.owner, project.repository!.name].join(' ').toLocaleLowerCase().includes(normalized))
  const enabled = candidates.filter(project => Boolean(project.enabled)).length
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]" aria-labelledby={id}>
      <header className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={id} className="m-0 text-sm font-medium">{t('settingProjects')}</h3>
            <Tag tone="quiet">{t('settingEnabledCount', { enabled, total: candidates.length })}</Tag>
          </div>
          <p className="m-0 mt-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingProjectsDescription')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddRepository />
          <Button size="sm" variant="outline" disabled={refreshing.loading || saving.loading} onClick={() => void refresh()}>{t('settingRefresh')}</Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
        <Input type="search" aria-label={t('settingSearchProjects')} placeholder={t('settingSearchProjects')} value={query} onChange={event => setQuery(event.currentTarget.value)} className="min-w-40 flex-1 !text-xs @min-[620px]:max-w-xs" />
        {refreshedAt && (
          <time dateTime={refreshedAt} title={refreshedAt} className="text-[11px] text-[var(--dsw-alias-label-tertiary)]">
            {t('settingLastSynced')}
            {' '}
            {new Date(refreshedAt).toLocaleTimeString()}
          </time>
        )}
      </div>
      {(saving.error || refreshing.error) && <p role="alert" className="px-5">{saving.error?.message ?? refreshing.error?.message}</p>}
      {visible.length
        ? (
            <ul className="m-0 list-none p-0">
              {visible.map((project) => {
                const pathId = `${id}-path-${project.id}`
                return (
                  <li key={project.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-[var(--dsw-alias-border-l3)] px-5 py-4">
                    <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
                      <label className="flex size-6 shrink-0 cursor-pointer items-center justify-center">
                        <input type="checkbox" disabled={saving.loading || refreshing.loading || (!project.remoteUrl && !project.enabled)} checked={Boolean(project.enabled)} aria-label={t('settingSelectProject', { name: project.name })} aria-describedby={pathId} onChange={event => void toggle(project.id, event.currentTarget.checked)} className="size-3 cursor-pointer accent-[var(--dsw-alias-state-business-primary)]" />
                      </label>
                      <div className="min-w-0 pt-0.5">
                        <div className="truncate text-[13px] leading-5 font-medium text-[var(--dsw-alias-label-primary)]">{project.name}</div>
                        <p id={pathId} className="m-0 mt-1 truncate font-mono text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]" title={project.repository!.webUrl}>{`${project.repository!.platform}:${project.repository!.owner}/${project.repository!.name}`}</p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <a href={project.repository!.webUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center rounded-lg border border-[var(--dsw-alias-border-l3)] px-3 text-xs text-[var(--dsw-alias-label-primary)] no-underline hover:bg-[var(--dsw-alias-card-fill)] focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)]">{t('settingOpenRepository')}</a>
                    </div>
                  </li>
                )
              })}
            </ul>
          )
        : (
            <Empty compact className="items-center !gap-2 border-t border-[var(--dsw-alias-border-l3)] px-4 py-7 !text-center [&>p:first-of-type]:text-xs [&>p:first-of-type]:leading-4 [&>p:first-of-type]:font-medium [&>p:first-of-type]:text-[var(--dsw-alias-label-primary)] [&>p:nth-of-type(2)]:text-[var(--dsw-alias-label-secondary)]" title={t(normalized ? 'settingNoMatchingProjects' : 'settingNoProjects')} description={t(normalized ? 'settingNoMatchingProjectsHelp' : 'settingNoProjectsHelp')}>
              {normalized && <Button size="sm" variant="ghost" onClick={() => setQuery('')}>{t('settingClearSearch')}</Button>}
            </Empty>
          )}
    </section>
  )
}
