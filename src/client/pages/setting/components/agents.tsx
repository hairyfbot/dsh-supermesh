import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { GetApiNexusAgentsModelsResponse, PatchApiNexusAgentsModelsBody } from '../../../apis/index.type'
import type { DshNexusKey } from '../../../locale'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import { getApiNexusAgentsModels, patchApiNexusAgentsModels } from '../../../apis'
import { useStore } from '../../../hooks/use-store'
import { useTranslation } from '../../../hooks/use-translation'

type Role = PatchApiNexusAgentsModelsBody['role']
type Catalog = GetApiNexusAgentsModelsResponse['catalog']
type Models = GetApiNexusAgentsModelsResponse['models']
type ModelEntry = NonNullable<Models[Role]>
type CatalogModel = Catalog['groups'][number]['models'][number]

const roles: readonly { role: Role, label: DshNexusKey }[] = [
  { role: 'main', label: 'settingAgentsMain' },
  { role: 'manager', label: 'settingAgentsManager' },
  { role: 'project', label: 'settingAgentsProject' },
  { role: 'worker', label: 'settingAgentsWorker' },
  { role: 'supervisor', label: 'settingAgentsSupervisor' },
]

const INHERIT = 'inherit'

export function Agents(): ReactNode {
  const { t } = useTranslation()
  const ready = useStore(state => state.data.panel !== null)
  const [catalog, setCatalog] = useState<Catalog | null>(null)
  const [models, setModels] = useState<Models | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [open, setOpen] = useState<Role | null>(null)
  const [pending, setPending] = useState<Role | null>(null)
  const [failed, setFailed] = useState<Role | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    const load = async (): Promise<void> => {
      try {
        const value = await getApiNexusAgentsModels({ signal: controller.signal })
        if (controller.signal.aborted)
          return
        if (!value?.models || !value.catalog)
          throw new Error('invalid_agent_models')
        setModels(value.models)
        setCatalog(value.catalog)
      }
      catch (error) {
        if (!controller.signal.aborted)
          setLoadError(error instanceof Error ? error.message : String(error))
      }
      finally {
        if (!controller.signal.aborted)
          setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])
  async function submit(role: Role, change: { provider: string, model: string, reasoningEffort?: string }): Promise<void> {
    if (!ready || pending !== null)
      return
    const controller = new AbortController()
    setPending(role)
    setFailed(null)
    try {
      const result = await patchApiNexusAgentsModels({
        role,
        provider: change.provider,
        model: change.model,
        ...(change.reasoningEffort ? { reasoningEffort: change.reasoningEffort } : {}),
      }, { signal: controller.signal })
      if (controller.signal.aborted)
        return
      if (!result?.models)
        throw new Error('invalid_agent_models')
      setModels(result.models)
    }
    catch {
      if (!controller.signal.aborted)
        setFailed(role)
    }
    finally {
      if (!controller.signal.aborted)
        setPending(null)
    }
  }
  const currentModel = (role: Role): CatalogModel | undefined => {
    const entry = models?.[role]
    return entry
      ? catalog?.groups.find(group => group.id === entry.provider)?.models.find(model => model.id === entry.model)
      : undefined
  }
  const modelName = (entry: ModelEntry, role: Role): string => currentModel(role)?.name ?? entry.model
  const effortName = (role: Role): string => {
    const entry = models?.[role]
    if (!entry?.reasoningEffort)
      return t('settingAgentsEffortDefault')
    return currentModel(role)?.reasoning?.efforts.find(effort => effort.id === entry.reasoningEffort)?.name ?? entry.reasoningEffort
  }
  const triggerLabel = (role: Role): string => {
    const entry = models?.[role]
    return entry ? modelName(entry, role) : t('settingAgentsUnset')
  }
  const items = (role: Role): MenuEntry[] => {
    const entry = models?.[role]
    const reasoning = currentModel(role)?.reasoning
    return [
      { id: INHERIT, label: t('settingAgentsUnset') },
      ...(catalog?.groups.flatMap(group => [
        { type: 'label' as const, id: `group:${group.id}`, text: group.name },
        ...group.models.map(model => ({ id: `model:${group.id}/${model.id}`, label: model.name })),
      ]) ?? []),
      ...(entry && reasoning
        ? [
            { type: 'separator' as const, id: 'effort-separator' },
            { type: 'label' as const, id: 'effort-label', text: t('settingAgentsEffort') },
            ...effortChoices(reasoning, t),
          ]
        : []),
    ]
  }
  const selectedIds = (role: Role): string[] => {
    const entry = models?.[role]
    return entry ? [`model:${entry.provider}/${entry.model}`, `effort:${entry.reasoningEffort ?? ''}`] : [INHERIT]
  }
  if (loading)
    return <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingAgentsLoading')}</p>
  if (!catalog || !models)
    return <p role="alert" className="m-0 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAgentsCatalogError', { error: loadError ?? '' })}</p>
  const fallback = catalog.default
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]" aria-labelledby="nexus-agents">
      <header className="px-4 py-3">
        <h3 id="nexus-agents" className="m-0 text-sm font-medium">{t('settingAgents')}</h3>
        <p className="m-0 mt-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingAgentsHelp')}</p>
        <p className="m-0 mt-1.5 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">
          {fallback
            ? t('settingAgentsDefault', { model: `${fallback.provider} / ${fallback.model}${fallback.reasoningEffort ? ` · ${fallback.reasoningEffort}` : ''}` })
            : t('settingAgentsDefaultUnavailable')}
        </p>
        {catalog.groups.length === 0 && <p role="status" className="m-0 mt-1.5 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('settingAgentsEmpty')}</p>}
        {loadError && <p role="alert" className="m-0 mt-1.5 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAgentsCatalogError', { error: loadError })}</p>}
      </header>
      {roles.map(({ role, label }) => {
        const entry = models[role]
        return (
          <div key={role} className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--dsw-alias-border-l3)] px-4 py-3">
            <div className="min-w-0">
              <h4 className="m-0 text-xs font-medium">{t(label)}</h4>
              <p className="m-0 mt-1 font-mono text-[11px] text-[var(--dsw-alias-label-tertiary)]">{role}</p>
              {failed === role && <p role="alert" className="m-0 mt-1 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAgentsFailed')}</p>}
            </div>
            <Menu
              open={open === role}
              onClose={() => setOpen(null)}
              anchor={(
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!ready || pending !== null}
                  aria-haspopup="menu"
                  aria-expanded={open === role}
                  aria-label={`${t(label)} · ${t('settingAgentsSelect')}`}
                  onClick={() => setOpen(open === role ? null : role)}
                >
                  <span className="max-w-56 truncate">{pending === role ? t('channelSaving') : triggerLabel(role)}</span>
                  {entry?.reasoningEffort && <span className="ml-1.5 text-[11px] text-[var(--dsw-alias-label-tertiary)]">{effortName(role)}</span>}
                </Button>
              )}
              items={items(role)}
              selectedIds={selectedIds(role)}
              onSelect={(value) => {
                if (value === INHERIT) {
                  setOpen(null)
                  void submit(role, { provider: '', model: '' })
                  return
                }
                if (value.startsWith('effort:')) {
                  setOpen(null)
                  if (entry)
                    void submit(role, { provider: entry.provider, model: entry.model, reasoningEffort: value.slice('effort:'.length) })
                  return
                }
                const route = value.slice('model:'.length)
                const at = route.indexOf('/')
                setOpen(null)
                void submit(role, { provider: route.slice(0, at), model: route.slice(at + 1) })
              }}
              portal
              minWidthFromAnchor
              align="end"
              side="bottom"
            />
          </div>
        )
      })}
    </section>
  )
}

function effortChoices(reasoning: CatalogModel['reasoning'], t: (key: DshNexusKey, params?: Record<string, unknown>) => string): MenuEntry[] {
  if (!reasoning)
    return []
  return [
    ...(reasoning.defaultEffort === undefined ? [{ id: 'effort:', label: t('settingAgentsEffortDefault') }] : []),
    ...reasoning.efforts.map(effort => ({ id: `effort:${effort.id}`, label: effort.name })),
  ]
}
