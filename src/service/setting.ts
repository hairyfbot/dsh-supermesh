import type { RoleModel, RoleModels } from '@/service/role-model.types'
import type { Settings, SettingsPatch } from '@/service/setting.types'
import { storage } from '@/storage'
import { defineService } from '@/utils/service'

const defaults: Settings = {
  models: { main: null, manager: null, project: null, worker: null, supervisor: null },
  administrators: [],
  inferred: 'observe',
  maxWorkers: 10,
  backgroundLimitMinutes: 30,
  autoMerge: false,
  autoMergeMaxLines: 200,
  autoArchiveWorkers: false,
  deliveryMaxAttempts: 3,
  deliveryRetryCeilingSeconds: 60,
  updatedAt: '',
}
const limits = {
  maxWorkers: [1, 16],
  backgroundLimitMinutes: [1, 1440],
  autoMergeMaxLines: [1, 10000],
  deliveryMaxAttempts: [1, 20],
  deliveryRetryCeilingSeconds: [2, 3600],
} as const
const roles = ['main', 'manager', 'project', 'worker', 'supervisor'] as const
let writing: Promise<void> = Promise.resolve()

export const setting = defineService({
  async load(): Promise<Settings> {
    const value: unknown = await storage.getItem('setting.json')
    if (value === null)
      return { ...defaults, administrators: [] }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('invalid_stored_settings')
    const { updatedAt, ...patch } = value as Record<string, unknown>
    if ((updatedAt !== undefined && typeof updatedAt !== 'string') || !valid(patch, true))
      throw new Error('invalid_stored_settings')
    return { ...defaults, ...patch, administrators: normalizeAdministrators((patch.administrators ?? []) as string[]), models: normalizeModels(patch.models), ...(updatedAt === undefined ? {} : { updatedAt }) } as Settings
  },
  save(patch: SettingsPatch): Promise<Settings> {
    if (!valid(patch))
      return Promise.reject(new TypeError('invalid_config'))
    const updates = { ...patch, ...(patch.administrators === undefined ? {} : { administrators: normalizeAdministrators(patch.administrators) }), ...(patch.models === undefined ? {} : { models: normalizeModels(patch.models) }) }
    const operation = writing.then(async () => {
      const next = { ...await setting.load(), ...updates, updatedAt: new Date().toISOString() }
      await storage.setItem('setting.json', next)
      return next
    })
    writing = operation.then(() => undefined, () => undefined)
    return operation
  },
})

function valid(value: unknown, allowEmpty = false): value is SettingsPatch {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const entries = Object.entries(value)
  if (!allowEmpty && entries.length === 0)
    return false
  return entries.every(([key, entry]) => {
    if (key === 'administrators')
      return Array.isArray(entry) && entry.length <= 100 && entry.every(name => typeof name === 'string' && /^[a-z0-9][\w.-]{0,254}$/i.test(name.trim()))
    if (key === 'autoMerge' || key === 'autoArchiveWorkers')
      return typeof entry === 'boolean'
    if (key === 'inferred')
      return entry === 'off' || entry === 'observe' || entry === 'auto'
    if (key === 'models')
      return validModels(entry)
    if (!Object.hasOwn(limits, key))
      return false
    const [min, max] = limits[key as keyof typeof limits]
    return typeof entry === 'number' && Number.isInteger(entry) && entry >= min && entry <= max
  })
}

function validModels(value: unknown): value is RoleModels {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const entries = Object.entries(value)
  return entries.length > 0 && entries.every(([role, model]) => (roles as readonly string[]).includes(role) && validModel(model))
}

function validModel(value: unknown): value is RoleModel | null {
  if (value === null)
    return true
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  const { provider, model, reasoningEffort } = value as Record<string, unknown>
  return Object.keys(value).every(key => key === 'provider' || key === 'model' || key === 'reasoningEffort')
    && typeof provider === 'string' && provider.trim().length > 0
    && typeof model === 'string' && model.trim().length > 0
    && (reasoningEffort === undefined || (typeof reasoningEffort === 'string' && reasoningEffort.trim().length > 0))
}

function normalizeModels(value: unknown): RoleModels {
  const source = (value ?? {}) as Partial<Record<keyof RoleModels, RoleModel | null>>
  return Object.fromEntries(roles.map((role) => {
    const model = source[role]
    return [role, model ? { provider: model.provider, model: model.model, ...(model.reasoningEffort ? { reasoningEffort: model.reasoningEffort } : {}) } : null]
  })) as RoleModels
}

function normalizeAdministrators(names: string[]): string[] {
  const unique = new Map<string, string>()
  for (const entry of names) {
    const name = entry.trim()
    if (!unique.has(name.toLowerCase()))
      unique.set(name.toLowerCase(), name)
  }
  return [...unique.values()]
}
