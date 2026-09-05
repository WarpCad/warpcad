import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Default environment is plain Node: most of the current test suite lives in
// src/core/ (framework-free per CLAUDE.md) and never touches a DOM. A component
// test that needs one opts in per-file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    include: ['src/**/*.spec.js'],
    // No spec files exist yet at scaffold time (core-001/core-002 add the
    // first ones) — without this, Vitest exits non-zero on an empty suite.
    passWithNoTests: true,
  },
})
