import { defineHandler, HTTPError } from 'h3'
import { session } from '../../service/session'

export default defineHandler(async () => {
  try {
    return { sessionId: await session.create('main', {}) }
  }
  catch (error) {
    const message = error instanceof Error ? error.message : 'session_open_failed'
    throw new HTTPError({ status: message === 'ambiguous_main_session' ? 409 : message === 'runtime_stopping' ? 503 : 502, message })
  }
})
