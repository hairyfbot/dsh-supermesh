import type { ClientContext } from '@/client/types/context'
import { useContext } from 'react'
import { PluginContext } from '@/client/config/context'

export function useDshContext(): ClientContext {
  return useContext(PluginContext).ctx
}
