import path from 'node:path'
import { DSH_PLUGIN_HOME } from '../config/paths'
import { defineJsonScheduler } from '../utils/scheduler'

export const scheduler = defineJsonScheduler(path.join(DSH_PLUGIN_HOME, 'jobs.json'))

await scheduler.ready()
