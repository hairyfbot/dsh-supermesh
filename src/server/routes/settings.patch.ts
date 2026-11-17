import type { SettingsPatch } from '../../service/setting.types'
import { defineHandler, HTTPError, readBody } from 'h3'
import { setting } from '../../service/setting'

export const patchSettings = defineHandler(async (event) => {
  const body = await readBody<SettingsPatch>(event)
  if (!body)
    throw new HTTPError({ status: 400, message: 'invalid_config' })
  try {
    return await setting.save(body)
  }
  catch (error) {
    if (error instanceof TypeError && error.message === 'invalid_config')
      throw new HTTPError({ status: 400, message: 'invalid_config' })
    throw error
  }
})
