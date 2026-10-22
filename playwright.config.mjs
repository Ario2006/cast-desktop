import { defineConfig } from '@playwright/test'

// End-to-end tests drive the real, built app (run `npm run build` first, or use `npm run test:e2e`).
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.mjs',
  timeout: 40_000,
  workers: 1,
  reporter: [['list']],
  use: { trace: 'off' }
})
