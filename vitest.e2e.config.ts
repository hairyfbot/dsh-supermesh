import { fileURLToPath } from 'node:url'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import { closeDsh, getDshErrors, launchDsh, openDshPage, openSupermeshMainSession, supermeshRequest } from './test/__setup__/commands'

const srcDirectory = fileURLToPath(new URL('./src', import.meta.url)).replaceAll('\\', '/')

export default defineConfig({
  resolve: { alias: { '@': srcDirectory } },
  test: {
    name: 'e2e',
    include: [
      'test/e2e/**/*.test.ts',
      'test/e2e/**/*.spec.ts',
      'test/e2e/**/*.test.tsx',
      'test/e2e/**/*.spec.tsx',
    ],
    testTimeout: 180_000,
    hookTimeout: 300_000,
    fileParallelism: false,
    maxConcurrency: 1,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      commands: {
        launchDsh,
        openDshPage,
        getDshErrors,
        closeDsh,
        supermeshRequest,
        openSupermeshMainSession,
      },
    },
    sequence: {
      groupOrder: 1,
    },
  },
})
