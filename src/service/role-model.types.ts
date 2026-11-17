/** Per-role default models, mirroring the official policy shape: a route plus an optional adapter-owned effort. */
export interface RoleModel {
  provider: string
  model: string
  reasoningEffort?: string
}

export type RoleName = 'main' | 'manager' | 'project' | 'worker' | 'supervisor'

export type RoleModels = Record<RoleName, RoleModel | null>
