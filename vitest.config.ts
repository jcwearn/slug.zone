import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts, matching the other repos: test
// config out of the build config keeps the conflict surface small on branches
// that touch rollupOptions.input, which every new game entry does.
//
// `environment: 'node'` and no jsdom. Everything worth testing here is pure --
// collision, level parsing, weapon state, the seeded RNG -- and save/scores.ts
// takes an injected storage adapter precisely so a Map-backed fake covers it
// without emulating a DOM.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
  },
})
