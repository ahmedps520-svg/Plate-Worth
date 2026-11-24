import { defineConfig } from 'vitest/config'

// Kept separate from vite.config.ts so tests don't load the PWA, HTTPS or
// dev-API plugins.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'shared/**/*.test.ts', 'server/**/*.test.ts'],
    restoreMocks: true,
  },
})
