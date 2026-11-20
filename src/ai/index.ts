import { manager } from '@/ai/manager'
import { orchestrator } from '@/ai/orchestrator'
import { supervisor } from '@/ai/supervisor'
import { worker } from '@/ai/worker'

export const agents = {
  manager,
  orchestrator,
  supervisor,
  worker,
}
