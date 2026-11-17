import type { Settings, SettingsPatch } from './setting.types'
import { storage } from '../storage'
import { defineService } from '../utils/service'

const defaults: Settings = {
  maxWorkers: 10,
  backgroundLimitMinutes: 30,
  autoMerge: false,
  autoMergeMaxLines: 200,
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
let writing: Promise<void> = Promise.resolve()

export const setting = defineService({
  async load(): Promise<Settings> {
    const value: unknown = await storage.getItem('setting')
    if (value === null)
      return { ...defaults }
    if (!value || typeof value !== 'object' || Array.isArray(value))
      throw new Error('invalid_stored_settings')
    const { updatedAt, ...patch } = value as Record<string, unknown>
    if ((updatedAt !== undefined && typeof updatedAt !== 'string') || !valid(patch, true))
      throw new Error('invalid_stored_settings')
    return { ...defaults, ...patch, ...(updatedAt === undefined ? {} : { updatedAt }) } as Settings
  },
  save(patch: SettingsPatch): Promise<Settings> {
    if (!valid(patch))
      return Promise.reject(new TypeError('invalid_config'))
    const updates = { ...patch }
    const operation = writing.then(async () => {
      const next = { ...await setting.load(), ...updates, updatedAt: new Date().toISOString() }
      await storage.setItem('setting', next)
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
    if (key === 'autoMerge')
      return typeof entry === 'boolean'
    if (!Object.hasOwn(limits, key))
      return false
    const [min, max] = limits[key as keyof typeof limits]
    return typeof entry === 'number' && Number.isInteger(entry) && entry >= min && entry <= max
  })
}
