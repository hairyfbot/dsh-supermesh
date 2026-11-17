import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { inbox } from '../service/inbox'
import { worker } from '../service/worker'

export async function handleSessionEvent(source: Session, event: SessionEvent): Promise<void> {
  await inbox.observe(source, event)
  await worker.observe(source, event)
}
