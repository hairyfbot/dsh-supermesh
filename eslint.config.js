// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    rules: {
      'pnpm/yaml-enforce-settings': 'off',
      'ts/explicit-function-return-type': 'off',
      'antfu/no-top-level-await': 'off',
    },
    ignores: [
      'soruce/**',
      'temp/**',
      '.temp/**',
      'dist/**',
      'docs/specs/**',
      'src/client/apis',
      'src/database/migrations.ts',
      'src/database/types.ts',
    ],
  },
)
