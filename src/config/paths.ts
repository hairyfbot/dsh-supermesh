import { homedir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')

export const DSH_PLUGIN_HOME = `${DSH_HOME}/.supermesh`

/** 代理工作区：角色会话的 cwd 与官方工作区条目都只指向这里，插件状态留在上一层。 */
export const DSH_WORKSPACE_HOME = join(DSH_PLUGIN_HOME, 'workspace')
