export interface Settings {
  maxWorkers: number
  backgroundLimitMinutes: number
  autoMerge: boolean
  autoMergeMaxLines: number
  deliveryMaxAttempts: number
  deliveryRetryCeilingSeconds: number
  updatedAt: string
}

export type SettingsPatch = Partial<Omit<Settings, 'updatedAt'>>
