import type { ChannelConfiguration } from '../service/channel.types'

export interface ChannelMetadata {
  commitName: string
  commitEmail: string
  expectedAccount?: string
}

export function validateConfiguration(patch: unknown): asserts patch is ChannelConfiguration {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch))
    throw new TypeError('invalid_channel_config')
}

export function readConfigurationMetadata(raw?: string): ChannelMetadata {
  if (!raw)
    return { commitName: '', commitEmail: '' }
  let value: unknown
  try {
    value = JSON.parse(raw)
  }
  catch {
    throw new Error('invalid_channel_metadata')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('invalid_channel_metadata')
  const record = value as Record<string, unknown>
  if (typeof record.commitName !== 'string' || typeof record.commitEmail !== 'string' || (record.expectedAccount !== undefined && typeof record.expectedAccount !== 'string'))
    throw new Error('invalid_channel_metadata')
  return { commitName: record.commitName, commitEmail: record.commitEmail, ...(typeof record.expectedAccount === 'string' && record.expectedAccount ? { expectedAccount: record.expectedAccount } : {}) }
}

export function observationBaseline(activation: string, projectCreatedAt: string): string {
  const start = new Date(activation)
  const project = new Date(projectCreatedAt)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(project.getTime()))
    throw new Error('invalid_observation_baseline')
  return new Date(Math.max(start.getTime(), project.getTime())).toISOString()
}
