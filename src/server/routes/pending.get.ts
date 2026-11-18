import { defineHandler } from 'h3'
import { db } from '../../database'

export default defineHandler(async () => {
  const [pending, openTickets] = await Promise.all([db.inbox.listPending('user'), db.ticket.listOpen()])
  return pending.filter(message => !message.ticketId || openTickets.some(ticket => ticket.id === message.ticketId))
})
