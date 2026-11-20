import type { ReactNode } from 'react'
import type { SettingNotice } from '@/client/pages/setting/page'
import { Button, Input, Tag } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useId, useState } from 'react'
import { getApiSupermeshChannel, getApiSupermeshProject, patchApiSupermeshProjectId, postApiSupermeshProject } from '@/client/apis'
import { Empty } from '@/client/components/empty'
import { keys } from '@/client/config/query-keys'
import { useTranslation } from '@/client/hooks/use-translation'
import { AddRepository } from '@/client/pages/setting/components/add-repository'
import { parseRepositoryRemote } from '@/utils/repository'

export function Projects({ onNotice }: { onNotice: (notice: SettingNotice | null) => void }): ReactNode {
  const { t } = useTranslation()
  const client = useQueryClient()
  const projects = useQuery({ queryKey: keys.project, queryFn: () => getApiSupermeshProject() })
  const channels = useQuery({ queryKey: keys.channel, queryFn: () => getApiSupermeshChannel() })
  const toggleProject = useMutation({
    mutationFn: (input: { id: string, enabled: boolean }) => patchApiSupermeshProjectId({ id: encodeURIComponent(input.id) }, { enabled: input.enabled }),
    onSettled: () => client.invalidateQueries({ queryKey: keys.project }),
  })
  const refreshProject = useMutation({
    mutationFn: () => postApiSupermeshProject(),
    onSettled: () => client.invalidateQueries({ queryKey: keys.project }),
  })
  const gitlabHost = channels.data?.find(channel => channel.id === 'gitlab')?.host ?? 'https://gitlab.com'
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const saving = toggleProject.isPending
  const refreshing = refreshProject.isPending
  const toggle = async (projectId: string, enabled: boolean): Promise<void> => {
    onNotice(null)
    setError('')
    try {
      const updated = await toggleProject.mutateAsync({ id: projectId, enabled })
      if (!updated || updated.id !== projectId)
        throw new Error(updated && 'message' in updated && typeof updated.message === 'string' ? updated.message : '项目设置保存失败')
      onNotice('project')
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目设置保存失败')
    }
  }
  const refresh = async (): Promise<void> => {
    onNotice(null)
    setError('')
    try {
      await refreshProject.mutateAsync()
      setRefreshedAt(new Date().toISOString())
      onNotice('refreshed')
    }
    catch (reason) {
      setError(reason instanceof Error ? reason.message : '项目发现失败')
    }
  }
  const id = useId()
  const [query, setQuery] = useState('')
  const normalized = query.trim().toLocaleLowerCase()
  const candidates = (projects.data ?? []).filter(project => project.remoteUrl && project.available !== false).map((project) => {
    let repository: ReturnType<typeof parseRepositoryRemote> | null = null
    try {
      repository = parseRepositoryRemote(project.remoteUrl!, gitlabHost)
    }
    catch {}
    return { ...project, repository }
  }).filter(project => project.repository)
  const visible = candidates.filter(project => !normalized || [project.name, project.repository!.platform, project.repository!.owner, project.repository!.name].join(' ').toLocaleLowerCase().includes(normalized))
  const enabled = candidates.filter(project => Boolean(project.enabled)).length
  const loadError = projects.error ?? channels.error
  return (
    <section className="overflow-hidden rounded-2xl border border-(--dsw-alias-border-l3) bg-(--dsw-alias-bg-layer-1)" aria-labelledby={id}>
      <header className="flex flex-wrap items-start justify-between gap-3 p-5 pb-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 id={id} className="m-0 text-sm font-medium">{t('settingProjects')}</h3>
            <Tag tone="quiet">{t('settingEnabledCount', { enabled, total: candidates.length })}</Tag>
          </div>
          <p className="m-0 mt-1.5 text-xs leading-5 text-(--dsw-alias-label-secondary)">{t('settingProjectsDescription')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AddRepository />
          <Button size="sm" variant="outline" disabled={refreshing || saving} onClick={() => void refresh()}>{t('settingRefresh')}</Button>
        </div>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4">
        <Input type="search" aria-label={t('settingSearchProjects')} placeholder={t('settingSearchProjects')} value={query} onChange={event => setQuery(event.currentTarget.value)} className="min-w-40 flex-1 !text-xs @min-[620px]:max-w-xs" />
        {refreshedAt && (
          <time dateTime={refreshedAt} title={refreshedAt} className="text-[11px] text-(--dsw-alias-label-tertiary)">
            {t('settingLastSynced')}
            {' '}
            {new Date(refreshedAt).toLocaleTimeString()}
          </time>
        )}
      </div>
      {(error || loadError) && <p role="alert" className="px-5">{error || loadError?.message}</p>}
      {projects.isLoading
        ? <p role="status" className="px-5 pb-4 text-xs leading-5 text-(--dsw-alias-label-secondary)">正在载入项目列表…</p>
        : visible.length
          ? (
              <ul className="m-0 list-none p-0">
                {visible.map((project) => {
                  const pathId = `${id}-path-${project.id}`
                  return (
                    <li key={project.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-(--dsw-alias-border-l3) px-5 py-4">
                      <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
                        <label className="flex size-6 shrink-0 cursor-pointer items-center justify-center">
                          <input type="checkbox" disabled={saving || refreshing || (!project.remoteUrl && !project.enabled)} checked={Boolean(project.enabled)} aria-label={t('settingSelectProject', { name: project.name })} aria-describedby={pathId} onChange={event => void toggle(project.id, event.currentTarget.checked)} className="size-3 cursor-pointer accent-(--dsw-alias-state-business-primary)" />
                        </label>
                        <div className="min-w-0 pt-0.5">
                          <div className="truncate text-[13px] leading-5 font-medium text-(--dsw-alias-label-primary)">{project.name}</div>
                          <p id={pathId} className="m-0 mt-1 truncate font-mono text-[11px] leading-5 text-(--dsw-alias-label-tertiary)" title={project.repository!.webUrl}>{`${project.repository!.platform}:${project.repository!.owner}/${project.repository!.name}`}</p>
                        </div>
                      </div>
                      <div className="ml-auto flex shrink-0 items-center gap-2">
                        <a href={project.repository!.webUrl} target="_blank" rel="noopener noreferrer" className="inline-flex h-7 items-center rounded-lg border border-(--dsw-alias-border-l3) px-3 text-xs text-(--dsw-alias-label-primary) no-underline hover:bg-(--dsw-alias-card-fill) focus-visible:outline-2 focus-visible:outline-(--dsw-alias-state-business-primary)">{t('settingOpenRepository')}</a>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
          : (
              <Empty compact className="items-center !gap-2 border-t border-(--dsw-alias-border-l3) px-4 py-7 !text-center [&>p:first-of-type]:text-xs [&>p:first-of-type]:leading-4 [&>p:first-of-type]:font-medium [&>p:first-of-type]:text-(--dsw-alias-label-primary) [&>p:nth-of-type(2)]:text-(--dsw-alias-label-secondary)" title={t(normalized ? 'settingNoMatchingProjects' : 'settingNoProjects')} description={t(normalized ? 'settingNoMatchingProjectsHelp' : 'settingNoProjectsHelp')}>
                {normalized && <Button size="sm" variant="ghost" onClick={() => setQuery('')}>{t('settingClearSearch')}</Button>}
              </Empty>
            )}
    </section>
  )
}
