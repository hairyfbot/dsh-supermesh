import type { RoleModels } from '@/service/role-model.types'

export interface Settings {
  models: RoleModels
  administrators: string[]
  maxWorkers: number
  backgroundLimitMinutes: number
  autoMerge: boolean
  autoMergeMaxLines: number
  autoArchiveWorkers: boolean
  deliveryMaxAttempts: number
  deliveryRetryCeilingSeconds: number
  updatedAt: string
}

export type SettingsPatch = Partial<Omit<Settings, 'updatedAt'>>
