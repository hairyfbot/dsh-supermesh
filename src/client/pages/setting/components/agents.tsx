import type { MenuEntry } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ReactNode } from 'react'
import type { GetApiSupermeshAgentModelCatalogResponse, GetApiSupermeshAgentModelResponse, PatchApiSupermeshAgentModelBody } from '../../../apis/index.type'
import type { DshSupermeshKey } from '../../../locale'
import { Button, Menu } from '@deepseek-ai/dsh-client-ui-primitives'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { getApiSupermeshAgentModel, getApiSupermeshAgentModelCatalog, patchApiSupermeshAgentModel } from '../../../apis'
import { keys } from '../../../config/query-keys'
import { useTranslation } from '../../../hooks/use-translation'

type Role = PatchApiSupermeshAgentModelBody['role']
type Catalog = GetApiSupermeshAgentModelCatalogResponse
type Models = GetApiSupermeshAgentModelResponse
type ModelEntry = NonNullable<Models[Role]>
type CatalogModel = Catalog['groups'][number]['models'][number]

const roles: readonly { role: Role, label: DshSupermeshKey }[] = [
  { role: 'main', label: 'settingAgentsMain' },
  { role: 'manager', label: 'settingAgentsManager' },
  { role: 'project', label: 'settingAgentsProject' },
  { role: 'worker', label: 'settingAgentsWorker' },
  { role: 'supervisor', label: 'settingAgentsSupervisor' },
]

const INHERIT = 'inherit'

export function Agents(): ReactNode {
  const { t } = useTranslation()
  const client = useQueryClient()
  const models = useQuery({ queryKey: keys.agentModel, queryFn: () => getApiSupermeshAgentModel() })
  const catalog = useQuery({ queryKey: keys.agentModelCatalog, queryFn: () => getApiSupermeshAgentModelCatalog() })
  const saveAgentModel = useMutation({
    mutationFn: (input: PatchApiSupermeshAgentModelBody) => patchApiSupermeshAgentModel(input),
    onSettled: () => client.invalidateQueries({ queryKey: keys.agentModel }),
  })
  const [open, setOpen] = useState<Role | null>(null)
  const [pending, setPending] = useState<Role | null>(null)
  const [failed, setFailed] = useState<Role | null>(null)
  const submit = async (role: Role, change: { provider: string, model: string, reasoningEffort?: string }): Promise<void> => {
    if (pending !== null)
      return
    setPending(role)
    setFailed(null)
    try {
      await saveAgentModel.mutateAsync({
        role,
        provider: change.provider,
        model: change.model,
        ...(change.reasoningEffort ? { reasoningEffort: change.reasoningEffort } : {}),
      })
    }
    catch {
      setFailed(role)
    }
    finally {
      setPending(null)
    }
  }
  const currentModel = (role: Role): CatalogModel | undefined => {
    const entry = models.data?.[role]
    return entry
      ? catalog.data?.groups.find(group => group.id === entry.provider)?.models.find(model => model.id === entry.model)
      : undefined
  }
  const modelName = (entry: ModelEntry, role: Role): string => currentModel(role)?.name ?? entry.model
  const effortName = (role: Role): string => {
    const entry = models.data?.[role]
    if (!entry?.reasoningEffort)
      return t('settingAgentsEffortDefault')
    return currentModel(role)?.reasoning?.efforts.find(effort => effort.id === entry.reasoningEffort)?.name ?? entry.reasoningEffort
  }
  const triggerLabel = (role: Role): string => {
    const entry = models.data?.[role]
    return entry ? modelName(entry, role) : t('settingAgentsUnset')
  }
  const items = (role: Role, catalogue: Catalog): MenuEntry[] => {
    const entry = models.data?.[role]
    const reasoning = currentModel(role)?.reasoning
    return [
      { id: INHERIT, label: t('settingAgentsUnset') },
      ...catalogue.groups.flatMap(group => [
        { type: 'label' as const, id: `group:${group.id}`, text: group.name },
        ...group.models.map(model => ({ id: `model:${group.id}/${model.id}`, label: model.name })),
      ]),
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
    const entry = models.data?.[role]
    return entry ? [`model:${entry.provider}/${entry.model}`, `effort:${entry.reasoningEffort ?? ''}`] : [INHERIT]
  }
  const failedMessage = models.error?.message ?? catalog.error?.message
  const loading = models.isLoading || catalog.isLoading
  if (loading && !failedMessage)
    return <p role="status" className="m-0 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingAgentsLoading')}</p>
  if (!models.data || !catalog.data)
    return <p role="alert" className="m-0 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAgentsCatalogError', { error: failedMessage ?? '' })}</p>
  const catalogue = catalog.data
  const current = models.data
  const fallback = catalogue.default
  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--dsw-alias-border-l3)] bg-[var(--dsw-alias-bg-layer-1)]" aria-labelledby="supermesh-agents">
      <header className="px-4 py-3">
        <h3 id="supermesh-agents" className="m-0 text-sm font-medium">{t('settingAgents')}</h3>
        <p className="m-0 mt-1.5 text-xs leading-5 text-[var(--dsw-alias-label-secondary)]">{t('settingAgentsHelp')}</p>
        <p className="m-0 mt-1.5 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">
          {fallback
            ? t('settingAgentsDefault', { model: `${fallback.provider} / ${fallback.model}${fallback.reasoningEffort ? ` · ${fallback.reasoningEffort}` : ''}` })
            : t('settingAgentsDefaultUnavailable')}
        </p>
        {catalogue.groups.length === 0 && <p role="status" className="m-0 mt-1.5 text-[11px] leading-5 text-[var(--dsw-alias-label-tertiary)]">{t('settingAgentsEmpty')}</p>}
        {catalog.error && <p role="alert" className="m-0 mt-1.5 text-xs text-[var(--dsw-alias-state-error-primary)]">{t('settingAgentsCatalogError', { error: catalog.error.message })}</p>}
      </header>
      {roles.map(({ role, label }) => {
        const entry = current[role]
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
                  disabled={pending !== null}
                  aria-haspopup="menu"
                  aria-expanded={open === role}
                  aria-label={`${t(label)} · ${t('settingAgentsSelect')}`}
                  onClick={() => setOpen(open === role ? null : role)}
                >
                  <span className="max-w-56 truncate">{pending === role ? t('channelSaving') : triggerLabel(role)}</span>
                  {entry?.reasoningEffort && <span className="ml-1.5 text-[11px] text-[var(--dsw-alias-label-tertiary)]">{effortName(role)}</span>}
                </Button>
              )}
              items={items(role, catalogue)}
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

function effortChoices(reasoning: CatalogModel['reasoning'], t: (key: DshSupermeshKey, params?: Record<string, unknown>) => string): MenuEntry[] {
  if (!reasoning)
    return []
  return [
    ...(reasoning.defaultEffort === undefined ? [{ id: 'effort:', label: t('settingAgentsEffortDefault') }] : []),
    ...reasoning.efforts.map(effort => ({ id: `effort:${effort.id}`, label: effort.name })),
  ]
}
