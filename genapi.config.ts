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
        for (const method of scope.functions)
          method.body = method.body?.map(statement => statement.replace(/(["']?method["']?\s*:\s*["'])(get|head|post|put|patch|delete|options)(["'])/g, (_match, prefix: string, verb: string, suffix: string) => `${prefix}${verb.toUpperCase()}${suffix}`))
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
