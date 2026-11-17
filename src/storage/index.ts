import { createStorage } from 'unstorage'
import fs from 'unstorage/drivers/fs'
import { DSH_PLUGIN_HOME } from '../config/paths'

export const storage = createStorage({
  driver: fs({
    atomic: true,
    base: `${DSH_PLUGIN_HOME}/storage.json`,
  }),
})
