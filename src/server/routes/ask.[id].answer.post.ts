import { defineHandler, getRouterParam, HTTPError, readBody } from 'h3'
import { db } from '../../database'
import { inbox } from '../../service/inbox'

interface AnswerBody {
  answer: string
}

export default defineHandler(async (event) => {
  const id = getRouterParam(event, 'id', { decode: true })
  const body = await readBody<AnswerBody>(event)
  if (!id?.trim() || !body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => key !== 'answer') || typeof body.answer !== 'string' || !body.answer.trim())
    throw new HTTPError({ status: 400, message: 'answer_required' })
  const current = await db.inbox.findById(id)
  if (!current)
    throw new HTTPError({ status: 404, message: 'not_found' })
  if (current.type !== 'user' || current.kind !== 'ask')
    throw new HTTPError({ status: 403, message: 'scope_denied' })
  if (!['worker', 'project', 'supervisor', 'main'].includes(current.origin))
    throw new HTTPError({ status: 409, message: 'unsupported_reply_target' })
  const answer = await db.inbox.answerByUser(id, body.answer.trim(), new Date().toISOString())
  if (!answer)
    throw new HTTPError({ status: 409, message: 'already_answered' })
  await inbox.deliverAnswers()
  return answer
})
