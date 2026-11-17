import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ReactNode } from 'react'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useAsyncFn } from '@reause/core'
import { useId, useState } from 'react'
import { getApiNexusPanel, patchApiNexusProjectsId, postApiNexusProjects, postApiNexusProjectsIdOpenings, putApiNexusProjectsIdSession } from '../../../apis'
import { Empty } from '../../../components/empty'
import { useDshContext } from '../../../hooks/use-dsh-context'
import { useActions, useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

export function Projects(): ReactNode {
  const { t } = useTranslation()
  const ctx = useDshContext()
  const [opening, open] = useAsyncFn(async (action: 'session' | 'repository', projectId: string) => {
    const paths = { id: encodeURIComponent(projectId) }
    if (action === 'repository') {
      const result = await postApiNexusProjectsIdOpenings(paths)
      if (result?.opened !== true)
        throw new Error(result && 'message' in result && typeof result.message === 'string' ? result.message : '打开仓库失败')
      return
    }
    const navigation = ctx.layout.beginNavigation()
    const result = await putApiNexusProjectsIdSession(paths)
    if (!result || typeof result.sessionId !== 'string' || !result.sessionId.trim())
      throw new Error(result && 'message' in result && typeof result.message === 'string' ? result.message : '打开项目会话失败')
    if (!navigation.aborted)
      ctx.uiWorkspace.openSession(result.sessionId as SessionId)
  })
  const projects = useStore(state => state.data.panel?.projects ?? [])
  const refreshedAt = useStore(state => state.setting.refreshedAt)
  const { receiveProject, receivePanel } = useActions()
  const [saving, toggle] = useAsyncFn(async (projectId: string, enabled: boolean) => {
    const project = await patchApiNexusProjectsId({ id: encodeURIComponent(projectId) }, { enabled })
    if (!project || project.id !== projectId)
      throw new Error('项目设置保存失败')
    receiveProject(project)
  })
  const [refreshing, refresh] = useAsyncFn(async () => {
    const projects = await postApiNexusProjects()
    if (!Array.isArray(projects))
      throw new Error('项目发现失败')
    const panel = await getApiNexusPanel()
    if (!panel?.projects || !panel.settings)
      throw new Error('项目列表加载失败')
    receivePanel(panel)
  })
  const id = useId()
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const candidates = projects.filter(project => project.remoteUrl && project.available !== false)
  const visible = candidates.filter(project => !normalized || [project.name, project.directory].join(' ').toLocaleLowerCase().includes(normalized))
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
        <Button size="sm" variant="outline" disabled={refreshing.loading || saving.loading} onClick={() => void refresh()}>{t('settingRefresh')}</Button>
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
      {(saving.error || refreshing.error || opening.error) && <p role="alert" className="px-5">{saving.error?.message ?? refreshing.error?.message ?? opening.error?.message}</p>}
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
                        <p id={pathId} className="m-0 mt-1 truncate font-mono text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]" title={project.directory}>{project.directory}</p>
                      </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center gap-2">
                      <Button type="button" size="sm" variant="outline" disabled={opening.loading} onClick={() => void open('session', project.id)}>{t('settingOpenSession')}</Button>
                      <Button type="button" size="sm" variant="outline" disabled={opening.loading} onClick={() => void open('repository', project.id)}>{t('settingOpenRepository')}</Button>
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
