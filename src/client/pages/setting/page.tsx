import type { ReactNode } from 'react'
import type { PatchApiSupermeshSettingBody } from '../../apis/index.type'
import type { RuntimeSettings } from '../../store/setting'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import { Case, Switch } from 'react-if-lite'
import { getApiSupermeshSetting, patchApiSupermeshSetting } from '../../apis'
import { ActivityIcon, AgentIcon, GitBranchIcon, TasksIcon } from '../../components/icons'
import { keys } from '../../config/query-keys'
import { useActions, useStore } from '../../hooks/use-store'
import { useTranslation } from '../../hooks/use-translation'
import { administratorSignature, GROUPS, LIMITS } from '../../store/setting'
import { Agents } from './components/agents'
import { General } from './components/general'
import { Projects } from './components/projects'
import { Runtime } from './components/runtime'

export type SettingNotice = 'saved' | 'refreshed' | 'project'
type Failed = 'general' | 'execution' | 'delivery'

const NUMERIC = ['maxWorkers', 'backgroundLimitMinutes', 'autoMerge', 'autoMergeMaxLines', 'autoArchiveWorkers', 'deliveryMaxAttempts', 'deliveryRetryCeilingSeconds'] as const

function toRuntime(value: { administrators: string[], maxWorkers: number, backgroundLimitMinutes: number, autoMerge: boolean, autoMergeMaxLines: number, autoArchiveWorkers: boolean, deliveryMaxAttempts: number, deliveryRetryCeilingSeconds: number }): RuntimeSettings {
  const { administrators, maxWorkers, backgroundLimitMinutes, autoMerge, autoMergeMaxLines, autoArchiveWorkers, deliveryMaxAttempts, deliveryRetryCeilingSeconds } = value
  return { administrators, maxWorkers, backgroundLimitMinutes, autoMerge, autoMergeMaxLines, autoArchiveWorkers, deliveryMaxAttempts, deliveryRetryCeilingSeconds }
}

function sameSettings(left: RuntimeSettings, right: RuntimeSettings): boolean {
  return administratorSignature(left.administrators) === administratorSignature(right.administrators)
    && NUMERIC.every(key => left[key] === right[key])
}

function numbersValid(value: RuntimeSettings): boolean {
  return Object.entries(LIMITS).every(([key, limits]) => {
    const current = value[key as keyof typeof LIMITS]
    return Number.isInteger(current) && current >= limits.min && current <= limits.max
  })
}

export function Setting(): ReactNode {
  const { t } = useTranslation()
  const activeSection = useStore(state => state.setting.section)
  const { setSettingSection } = useActions()
  const setting = useQuery({ queryKey: keys.setting, queryFn: () => getApiSupermeshSetting() })
  const client = useQueryClient()
  const saveSetting = useMutation({
    mutationFn: (input: PatchApiSupermeshSettingBody) => patchApiSupermeshSetting(input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.setting }),
  })
  const baseline = setting.data ? toRuntime(setting.data) : null
  const [draft, setDraft] = useState<RuntimeSettings | null>(null)
  const [notice, setNotice] = useState<SettingNotice | null>(null)
  const [failed, setFailed] = useState<Failed | null>(null)
  const previous = useRef<RuntimeSettings | null>(null)
  // keep:effect Follow the refreshed server baseline while the local draft is untouched.
  useEffect(() => {
    if (!baseline)
      return
    const before = previous.current
    previous.current = baseline
    setDraft(current => current === null || before === null || sameSettings(current, before) ? { ...baseline } : current)
  }, [baseline])
  // keep:effect Clear the transient notice when the section changes.
  useEffect(() => {
    setNotice(null)
    setFailed(null)
  }, [activeSection])
  const change = (patch: Partial<RuntimeSettings>): void => {
    setDraft(current => current && { ...current, ...patch, ...(patch.autoMerge === false && !numbersValid({ ...current, ...patch, autoMergeMaxLines: current.autoMergeMaxLines }) ? { autoMergeMaxLines: baseline?.autoMergeMaxLines ?? current.autoMergeMaxLines } : {}) })
    setNotice(null)
    setFailed(null)
  }
  const discard = (section: 'general' | 'execution' | 'delivery'): void => {
    if (!baseline)
      return
    setDraft(current => current && (section === 'general'
      ? { ...current, administrators: [...baseline.administrators], autoArchiveWorkers: baseline.autoArchiveWorkers }
      : { ...current, ...Object.fromEntries(GROUPS[section].map(key => [key, baseline[key]])) }))
    setNotice(null)
    setFailed(null)
  }
  const save = async (patch: PatchApiSupermeshSettingBody, section: Failed): Promise<void> => {
    setNotice(null)
    setFailed(null)
    try {
      await saveSetting.mutateAsync(patch)
      setNotice('saved')
    }
    catch {
      setFailed(section)
    }
  }
  const dirtyOf = (scope: 'execution' | 'delivery'): boolean => draft !== null && baseline !== null && GROUPS[scope].some(key => draft[key] !== baseline[key])
  const generalDirty = draft !== null && baseline !== null && (administratorSignature(draft.administrators) !== administratorSignature(baseline.administrators) || draft.autoArchiveWorkers !== baseline.autoArchiveWorkers)
  const executionDirty = dirtyOf('execution')
  const deliveryDirty = dirtyOf('delivery')
  const invalid = draft !== null && !numbersValid(draft)
  const id = useId()
  const notices = { saved: 'settingSaved', refreshed: 'settingRefreshed', project: 'settingProjectSaved' } as const
  const sections = [
    { value: 'general', label: 'settingGeneral', icon: TasksIcon },
    { value: 'projects', label: 'settingProjects', icon: GitBranchIcon },
    { value: 'agents', label: 'settingAgents', icon: AgentIcon },
    { value: 'execution', label: 'settingExecution', icon: TasksIcon },
    { value: 'delivery', label: 'settingDelivery', icon: ActivityIcon },
  ] as const
  const dirty = { general: generalDirty, projects: false, agents: false, execution: executionDirty, delivery: deliveryDirty }
  let content: ReactNode
  if (setting.error) {
    content = <p role="alert" className="m-0 text-xs leading-5 text-[var(--dsw-alias-state-error-primary)]">{setting.error.message || '设置加载失败'}</p>
  }
  else if (!draft || !baseline) {
    content = <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">正在载入设置…</p>
  }
  else {
    content = (
      <Switch value={activeSection}>
        <Case cond="general"><General value={draft} baseline={baseline} pending={saveSetting.isPending} failed={failed === 'general'} onChange={change} onDiscard={() => discard('general')} onSave={patch => save(patch, 'general')} /></Case>
        <Case cond="projects"><Projects onNotice={setNotice} /></Case>
        <Case cond="agents"><Agents /></Case>
        <Case cond="execution"><Runtime key="execution" section="execution" value={draft} baseline={baseline} pending={saveSetting.isPending} failed={failed === 'execution'} onChange={change} onDiscard={() => discard('execution')} onSave={patch => save(patch, 'execution')} /></Case>
        <Case cond="delivery"><Runtime key="delivery" section="delivery" value={draft} baseline={baseline} pending={saveSetting.isPending} failed={failed === 'delivery'} onChange={change} onDiscard={() => discard('delivery')} onSave={patch => save(patch, 'delivery')} /></Case>
      </Switch>
    )
  }
  return (
    <section className="@container flex min-w-0 flex-col gap-4 pb-8" aria-label={t('tabSettings')}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="m-0 text-base font-medium">{t('tabSettings')}</h2>
          <p className="m-0 mt-1.5 text-[13px] leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingDescription')}</p>
        </div>
      </header>
      <div className="grid min-w-0 gap-4 @min-[740px]:grid-cols-[160px_minmax(0,1fr)] @min-[940px]:gap-5">
        <aside className="self-start @min-[740px]:sticky @min-[740px]:top-4">
          <nav aria-label={t('settingNavigation')} className="flex flex-wrap gap-1 rounded-xl bg-[var(--dsw-alias-card-fill)] p-1 @min-[740px]:flex-col @min-[740px]:bg-transparent @min-[740px]:p-0">
            {sections.map(section => (
              <button key={section.value} id={`${id}-${section.value}`} type="button" aria-current={activeSection === section.value ? 'page' : undefined} aria-controls={`${id}-content`} onClick={() => setSettingSection(section.value)} className={`flex cursor-pointer items-center gap-2.5 rounded-lg border-0 px-3 py-2.5 text-left font-[inherit] text-xs outline-none transition-colors focus-visible:outline-2 focus-visible:outline-[var(--dsw-alias-state-business-primary)] ${activeSection === section.value ? 'bg-[var(--dsw-alias-card-fill)] font-medium text-[var(--dsw-alias-label-primary)]' : 'bg-transparent text-[var(--dsw-alias-label-secondary)] hover:bg-[var(--dsw-alias-card-fill)]'}`}>
                <section.icon width={16} height={16} />
                <span>{t(section.label)}</span>
                {dirty[section.value] && <span className="ml-auto size-1.5 rounded-full bg-[var(--dsw-alias-state-business-primary)]" aria-label={t('settingUnsaved')} />}
              </button>
            ))}
          </nav>
        </aside>
        <div id={`${id}-content`} role="region" aria-labelledby={`${id}-${activeSection}`} className="flex min-w-0 flex-col gap-4">
          {content}
          {invalid ? <p role="alert" className="m-0 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingInvalid')}</p> : notice && !failed && <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t(notices[notice])}</p>}
          <p className="m-0 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">
            {t('settingPreview')}
            {(generalDirty || executionDirty || deliveryDirty) && <span className="ml-1">{t('settingUnsaved')}</span>}
          </p>
        </div>
      </div>
    </section>
  )
}
