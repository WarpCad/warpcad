// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PREVIEW_TRANSPORT_MARKER } from '../src/ai/bridge/previewTransport.js'
import { findDevOnlyMarkers } from './assert-release-bundle.mjs'

/** @type {string[]} */
const dirs = []
/**
 * @param {Record<string, string>} files asset name to contents
 * @returns {string} the fixture's build folder
 */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'release-bundle-'))
  dirs.push(dir)
  mkdirSync(join(dir, 'assets'))
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'assets', name), text)
  return dir
}
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('findDevOnlyMarkers', () => {
  it('passes a bundle without either marker', () => {
    expect(findDevOnlyMarkers(fixture({ 'app.js': 'console.log(1)' }))).toEqual([])
  })

  it('reports the e2e import hook', () => {
    const found = findDevOnlyMarkers(fixture({ 'app.js': 'window.__e2eImport=1' }))
    expect(found).toEqual([{ file: 'app.js', marker: '__e2eImport' }])
  })

  it('reports the preview transport marker', () => {
    const found = findDevOnlyMarkers(fixture({ 'a.js': 'ok', 'b.js': `x="${PREVIEW_TRANSPORT_MARKER}"` }))
    expect(found).toEqual([{ file: 'b.js', marker: PREVIEW_TRANSPORT_MARKER }])
  })

  it('ignores non-js files', () => {
    expect(findDevOnlyMarkers(fixture({ 'a.css': '__e2eImport' }))).toEqual([])
  })
})
