import type { Filters } from '@/client/pages/trigger/model'
import type { RuntimeSettings, Section } from '@/client/store/setting'
import type { OverviewChannelKind, OverviewView } from '@/client/types'
import { defineStore } from '@deepseek-ai/dsh-client-store'
import { AGENT_GRAPH } from '@/client/config/constants'
import { GROUPS, validSettings } from '@/client/store/setting'

export type TabKind = 'overview' | 'ticket' | 'trigger' | 'channel' | 'setting'
export type Page = TabKind | 'channel/detail' | 'ticket/detail' | 'trigger/detail'

export const store = defineStore({
  init: () => {
    const saved: RuntimeSettings = { administrators: [], maxWorkers: 10, backgroundLimitMinutes: 30, autoMerge: false, autoMergeMaxLines: 200, autoArchiveWorkers: false, deliveryMaxAttempts: 3, deliveryRetryCeilingSeconds: 60 }
    return ({
      navigation: { page: 'overview' as Page, ticketId: null as string | null, returnTo: 'overview' as 'overview' | 'ticket' | 'trigger' | 'trigger/detail' },
      channel: { selected: null as OverviewChannelKind | null },
      overview: { view: 'recent' as OverviewView },
      setting: { section: 'general' as Section, saved, draft: { ...saved }, notice: null as 'saved' | 'reset' | null, invalid: false },
      trigger: { selectedId: null as string | null, openFilter: null as 'channel' | 'kind' | 'status' | null, filters: { query: '', channel: 'all', status: 'all', kind: 'all', mentionedOnly: false } as Filters },
      graph: { zoom: 1, x: 0, y: 0, selectedId: null as string | null },
    })
  },
  actions: {
    receiveGeneralSettings: (draft, administrators: string[]) => {
      draft.setting.saved.administrators = [...administrators]
      draft.setting.draft.administrators = [...administrators]
      draft.setting.invalid = false
      draft.setting.notice = 'saved'
    },
    receiveSettings: (draft, value: RuntimeSettings, section: 'execution' | 'delivery') => {
      draft.setting.saved = value
      for (const key of GROUPS[section])
        Object.assign(draft.setting.draft, { [key]: value[key] })
      draft.setting.draft.administrators = [...value.administrators]
      draft.setting.invalid = false
      draft.setting.notice = 'saved'
    },
    go: (draft, page: Page) => {
      draft.navigation.page = page
      draft.trigger.openFilter = null
      if (page !== 'ticket/detail')
        draft.navigation.ticketId = null
      if (page !== 'channel/detail')
        draft.channel.selected = null
    },
    openChannel: (draft, kind: OverviewChannelKind) => {
      draft.channel.selected = kind
      draft.navigation.ticketId = null
      draft.navigation.page = 'channel/detail'
    },
    openTicket: (draft, id: string) => {
      if (draft.navigation.page !== 'ticket/detail')
        draft.navigation.returnTo = draft.navigation.page === 'overview' || draft.navigation.page === 'trigger' || draft.navigation.page === 'trigger/detail' ? draft.navigation.page : 'ticket'
      draft.navigation.ticketId = id
      draft.channel.selected = null
      draft.navigation.page = 'ticket/detail'
    },
    openThread: (draft, id: string) => {
      draft.trigger.selectedId = id
      draft.navigation.ticketId = null
      draft.channel.selected = null
      draft.navigation.page = 'trigger/detail'
    },
    setTriggerFilterMenu: (draft, filter: 'channel' | 'kind' | 'status' | null) => {
      draft.trigger.openFilter = filter
    },
    setTriggerFilters: (draft, filters: Partial<Filters>) => {
      Object.assign(draft.trigger.filters, filters)
      draft.trigger.openFilter = null
    },
    resetTriggerFilters: (draft) => {
      draft.trigger.openFilter = null
      draft.trigger.filters = { query: '', channel: 'all', status: 'all', kind: 'all', mentionedOnly: false }
    },
    clearSettingNotice: (draft) => {
      draft.setting.notice = null
    },
    setSettingSection: (draft, section: Section) => {
      draft.setting.section = section
      draft.setting.invalid = false
      draft.setting.notice = null
    },
    editSettings: (draft, patch: Partial<RuntimeSettings>) => {
      Object.assign(draft.setting.draft, patch)
      if (patch.autoMerge === false && !validSettings({ ...draft.setting.saved, autoMergeMaxLines: draft.setting.draft.autoMergeMaxLines }))
        draft.setting.draft.autoMergeMaxLines = draft.setting.saved.autoMergeMaxLines
      draft.setting.invalid = false
      draft.setting.notice = null
    },
    resetSettings: (draft, section: 'execution' | 'delivery') => {
      for (const key of GROUPS[section])
        Object.assign(draft.setting.draft, { [key]: draft.setting.saved[key] })
      draft.setting.invalid = false
      draft.setting.notice = null
    },
    setOverviewView: (draft, view: OverviewView) => {
      draft.overview.view = view
    },
    zoomGraph: (draft, delta: number) => {
      draft.graph.zoom = Math.max(AGENT_GRAPH.zoomMin, Math.min(AGENT_GRAPH.zoomMax, draft.graph.zoom + delta))
    },
    panGraph: (draft, x: number, y: number) => {
      draft.graph.x += x
      draft.graph.y += y
    },
    resetGraph: (draft) => {
      draft.graph.zoom = 1
      draft.graph.x = 0
      draft.graph.y = 0
    },
    selectAgent: (draft, id: string | null) => {
      draft.graph.selectedId = id
    },
  },
})
