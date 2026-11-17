import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      './vitest.e2e.config.ts',
      {
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
