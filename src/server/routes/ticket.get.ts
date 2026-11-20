import type { Selectable } from 'kysely'
import type { DB } from '@/database/types'
import { defineHandler, getQuery } from 'h3'
import { db } from '@/database'

export default defineHandler(async (event): Promise<{ data: Selectable<DB['ticket']>[], total: number, page: number, pageSize: number }> => {
  const query = getQuery<{ page?: string, pageSize?: string }>(event)
  const page = Math.max(1, Number(query.page) || 1)
  const pageSize = Math.max(1, Math.min(100, Number(query.pageSize) || 8))
  const result = await db.ticket.findManyPage(page, pageSize)
  return { ...result, page, pageSize }
})
