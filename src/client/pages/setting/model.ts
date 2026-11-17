export interface RuntimeSettings {
  maxWorkers: number
  backgroundLimitMinutes: number
  autoMerge: boolean
  autoMergeMaxLines: number
  deliveryMaxAttempts: number
  deliveryRetryCeilingSeconds: number
}

export type Project = import('../../apis/index.type').GetApiNexusPanelResponse['projects'][number]

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

export interface SettingsState {
  section: Section
  projects: Project[]
  saved: RuntimeSettings
  draft: RuntimeSettings
  refreshedAt: string | null
  notice: 'saved' | 'refreshed' | 'project' | null
  invalid: boolean
}

export function initialSettings(): SettingsState {
  const saved: RuntimeSettings = { maxWorkers: 10, backgroundLimitMinutes: 30, autoMerge: false, autoMergeMaxLines: 200, deliveryMaxAttempts: 3, deliveryRetryCeilingSeconds: 60 }
  return {
    section: 'projects' as Section,
    projects: [],
    saved,
    draft: { ...saved },
    refreshedAt: null as string | null,
    notice: null as 'saved' | 'refreshed' | 'project' | null,
    invalid: false,
  }
}
