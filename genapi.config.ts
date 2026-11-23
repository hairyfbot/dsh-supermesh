// genapi.config.ts
import { defineConfig } from '@genapi/core'
import pipeline from '@genapi/pipeline'
import { fetch } from '@genapi/presets'
import { original } from 'dsh-h3/genapi'

export default defineConfig({
  preset: pipeline(
    fetch.ts.config,
    original,
    async (config) => {
      const parsed = await fetch.ts.parser(config)
      for (const scope of Object.values(parsed.graphs.scopes)) {
        for (const method of scope.functions) {
          method.body = method.body?.map(statement => statement.replace(/(["']?method["']?\s*:\s*["'])(get|head|post|put|patch|delete|options)(["'])/g, (_match, prefix: string, verb: string, suffix: string) => `${prefix}${verb.toUpperCase()}${suffix}`))
          // 宿主半边没激活时路由返回纯文本 404，直接 response.json() 只会抛 JSON 解析错误，
          // 面板上看到的是 "Unexpected token 'o'"，看不出是插件没起来。
          method.body = method.body?.flatMap(statement => statement.startsWith('return response.json() as Promise<')
            ? ['if (!response.ok)\n      throw new Error(`HTTP ${response.status}: ${(await response.text()).slice(0, 200) || response.statusText}`)', statement]
            : [statement])
        }
      }
      return parsed
    },
    fetch.ts.compiler,
    fetch.ts.generate,
    fetch.ts.dest,
  ),
  input: './src/server/index.ts',
  output: {
    main: 'src/client/apis/index.ts',
    type: 'src/client/apis/index.type.ts',
  },
})
