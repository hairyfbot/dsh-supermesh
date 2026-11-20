import type { ChannelRow } from '@/channel/_shared/types'
import { createHash } from 'node:crypto'
import { ChannelError } from '@/channel/_shared/error'

export function record(value: unknown): ChannelRow {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new ChannelError('invalid_response')
  return value as ChannelRow
}

export function array(value: unknown): unknown[] {
  if (!Array.isArray(value))
    throw new ChannelError('invalid_response')
  return value
}

export function text(value: unknown): string {
  if (typeof value !== 'string' || !value)
    throw new ChannelError('invalid_response')
  return value
}

export function number(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1)
    throw new ChannelError('invalid_response')
  return value
}

export function identity(value: unknown): string {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0)
    return String(value)
  if (typeof value === 'string' && value)
    return value
  throw new ChannelError('invalid_response')
}

export function timestamp(value: unknown): string {
  const date = new Date(text(value))
  if (!Number.isFinite(date.getTime()))
    throw new ChannelError('invalid_response')
  return date.toISOString()
}

export function now(): string {
  return new Date().toISOString()
}

export function digest(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 游标回退 5 秒，靠确定性 id 去重，避免远程迟到的事件被漏掉（官方 cursorAt）。 */
export function cursorAt(started: string): string {
  return new Date(Date.parse(started) - 5000).toISOString()
}
