import { defineHandler } from 'h3'
import { channel } from '@/service/channel'

export default defineHandler(async () => channel.list())
