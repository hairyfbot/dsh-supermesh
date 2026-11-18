import { defineHandler } from 'h3'
import { setting } from '../../service/setting'

export default defineHandler(async () => setting.load())
