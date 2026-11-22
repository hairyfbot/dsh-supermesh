import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
import { forge } from '@/service/forge'
import { worker } from '@/service/worker'

export async function handleSessionEvent(source: Session, event: SessionEvent): Promise<void> {
  // 挂票先于结单：Worker 报 ready 的那一轮结束时，票的去向要按已经挂上的 PR 决定。
  await forge.observe(source, event)
  await worker.observe(source, event)
}
