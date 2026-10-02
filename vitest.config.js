// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'

// Default environment is plain Node: most of the current test suite lives in
// src/core/ (framework-free per CLAUDE.md) and never touches a DOM. A component
// test that needs one opts in per-file with `// @vitest-environment jsdom`.
export default defineConfig({
  plugins: [vue()],
  test: {
    environment: 'node',
    // build/ holds static-markup checks (e.g. the index.html first-paint guard,
    // TODO/build-002) that aren't part of src/ but still need to run as real tests.
    include: ['src/**/*.spec.js', 'build/**/*.spec.js'],
    // No spec files exist yet at scaffold time (core-001/core-002 add the
    // first ones) — without this, Vitest exits non-zero on an empty suite.
    passWithNoTests: true,
  },
})
