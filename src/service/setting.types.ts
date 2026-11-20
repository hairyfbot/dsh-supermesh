import type { RoleModels } from '@/service/role-model.types'
import type { InferredMode } from '@/types/admission'

export interface Settings {
  models: RoleModels
  administrators: string[]
  inferred: InferredMode
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
