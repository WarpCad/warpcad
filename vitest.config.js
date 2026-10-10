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
    // 'agent' prints failures only (no per-file/per-test lines) to keep token use low.
    // Override on the CLI with --reporter=default for the full human view.
    reporter: ['agent'],
    // build/ holds static-markup checks (e.g. the index.html first-paint guard,
    // TODO/build-002) that aren't part of src/ but still need to run as real tests.
    include: ['src/**/*.spec.js', 'build/**/*.spec.js', 'scripts/**/*.spec.js', 'mcp/**/*.spec.js'],
    // mcp/ has its own package.json (`docs/decisions/ai-partner.md` decision 3); its
    // node_modules is never a test root.
    exclude: ['**/node_modules/**'],
    // No spec files exist yet at scaffold time (core-001/core-002 add the
    // first ones) — without this, Vitest exits non-zero on an empty suite.
    passWithNoTests: true,
  },
})
