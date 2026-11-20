import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { worker } from '@/service/worker'

export async function handleSessionEvent(source: Session, event: SessionEvent): Promise<void> {
  await worker.observe(source, event)
}
