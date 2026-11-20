import type { TriggerKind } from '@/database/types'
import type { DeliveryStatus } from '@/service/topic'
import { defineHandler, getQuery } from 'h3'
import { topic } from '@/service/topic'

export default defineHandler(async (event) => {
  const query = getQuery<{ page?: string, pageSize?: string, query?: string, channel?: string, status?: string, kind?: string, mentionedOnly?: string }>(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 5))
  return topic.page({
    query: query.query,
    channel: query.channel,
    status: query.status as 'all' | DeliveryStatus | undefined,
    kind: query.kind as 'all' | TriggerKind | undefined,
    mentionedOnly: query.mentionedOnly === 'true',
  }, page, pageSize)
})
