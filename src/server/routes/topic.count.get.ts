import type { TriggerKind } from '@/database/types'
import { defineHandler, getQuery } from 'h3'
import { topic } from '@/service/topic'

export default defineHandler(async (event) => {
  const query = getQuery<{ query?: string, channel?: string, kind?: string, mentionedOnly?: string }>(event)
  return topic.count({
    query: query.query || undefined,
    channel: query.channel || undefined,
    kind: query.kind as 'all' | TriggerKind | undefined,
    mentionedOnly: query.mentionedOnly === 'true',
  })
})
