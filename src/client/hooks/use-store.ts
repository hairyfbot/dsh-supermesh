import type { AppStore, AppStoreState } from '../config/context'
import { useContext } from 'react'
import { PluginContext } from '../config/context'

export function useStore<S>(select: (state: AppStoreState) => S): S {
  return useContext(PluginContext).useStore!(select)
}

export function useActions(): AppStore['actions'] {
  return useContext(PluginContext).actions!
}
