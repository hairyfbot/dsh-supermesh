import { defineHandler } from 'h3'
import { db } from '../../database'

export default defineHandler(async () => db.trigger.listRecent())
