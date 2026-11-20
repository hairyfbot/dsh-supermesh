import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const srcDirectory = fileURLToPath(new URL('./src', import.meta.url)).replaceAll('\\', '/')

export default defineConfig({
  resolve: { alias: { '@': srcDirectory } },
  test: {
    projects: [
      './vitest.e2e.config.ts',
      {
        resolve: { alias: { '@': srcDirectory } },
        test: {
          name: 'unit',
          include: ['test/**/*.test.ts'],
          sequence: {
            groupOrder: 0,
          },
        },
      },
    ],
  },
})
