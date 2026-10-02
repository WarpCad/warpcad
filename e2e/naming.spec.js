// SPDX-License-Identifier: AGPL-3.0-or-later
import { test, expect } from '@playwright/test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const STORYBOOK_IFRAME_PATTERN = /:6006|iframe\.html/

function collectE2eFiles(dir) {
  const results = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      results.push(...collectE2eFiles(full))
    } else if (entry.endsWith('.e2e.js')) {
      results.push(full)
    }
  }
  return results
}

test('no *.e2e.js spec (excluding *.story.e2e.js) points at a Storybook iframe URL', () => {
  const e2eDir = fileURLToPath(new URL('.', import.meta.url))
  const files = collectE2eFiles(e2eDir).filter((file) => !file.endsWith('.story.e2e.js'))

  const offenders = files.filter((file) => STORYBOOK_IFRAME_PATTERN.test(readFileSync(file, 'utf-8')))

  expect(
    offenders,
    `*.e2e.js spec(s) navigating to a Storybook iframe instead of the real app: ${offenders.join(', ')}`,
  ).toEqual([])
})
