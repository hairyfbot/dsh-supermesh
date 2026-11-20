import type { T } from '@/client/locale'
import { useContext } from 'react'
import { PluginContext } from '@/client/config/context'

export function useTranslation(): { t: T } {
  return { t: useContext(PluginContext).t }
}
