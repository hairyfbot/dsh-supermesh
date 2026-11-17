export interface RuntimeSettings {
  maxWorkers: number
  backgroundLimitMinutes: number
  autoMerge: boolean
  autoMergeMaxLines: number
  deliveryMaxAttempts: number
  deliveryRetryCeilingSeconds: number
}

export type Section = 'projects' | 'execution' | 'delivery'

export const GROUPS = {
  execution: ['maxWorkers', 'backgroundLimitMinutes', 'autoMerge', 'autoMergeMaxLines'],
  delivery: ['deliveryMaxAttempts', 'deliveryRetryCeilingSeconds'],
} as const

export const LIMITS = {
  maxWorkers: { min: 1, max: 16 },
  backgroundLimitMinutes: { min: 1, max: 1440 },
  autoMergeMaxLines: { min: 1, max: 10000 },
  deliveryMaxAttempts: { min: 1, max: 20 },
  deliveryRetryCeilingSeconds: { min: 2, max: 3600 },
} as const

export function validSettings(settings: RuntimeSettings): boolean {
  return typeof settings.autoMerge === 'boolean' && Object.entries(LIMITS).every(([key, limits]) => {
    const value = settings[key as keyof typeof LIMITS]
    return Number.isInteger(value) && value >= limits.min && value <= limits.max
  })
}
