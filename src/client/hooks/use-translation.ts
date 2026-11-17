import type { T } from '../locale'
import { useContext } from 'react'
import { PluginContext } from '../config/context'

export function useTranslation(): { t: T } {
  return { t: useContext(PluginContext).t }
}
