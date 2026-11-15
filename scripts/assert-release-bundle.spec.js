// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { PREVIEW_TRANSPORT_MARKER } from '../src/ai/bridge/previewTransport.js'
import { findBundledHelp, findDevOnlyMarkers, findPageCsp, findWebOnlyFiles } from './assert-release-bundle.mjs'

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

describe('findBundledHelp (TODO/ui-119)', () => {
  it('passes a build with no help/ folder', () => {
    expect(findBundledHelp(fixture({ 'app.js': 'ok' }))).toBe(false)
  })

  it('reports a build that still carries help/', () => {
    const dir = fixture({ 'app.js': 'ok' })
    mkdirSync(join(dir, 'help'))
    writeFileSync(join(dir, 'help', 'index.json'), '{}')
    expect(findBundledHelp(dir)).toBe(true)
  })
})

describe('findPageCsp (TODO/build-032)', () => {
  it('passes a native index.html with no policy meta tag', () => {
    const dir = fixture({ 'app.js': 'ok' })
    writeFileSync(join(dir, 'index.html'), '<html><head><meta charset="UTF-8" /></head></html>')
    expect(findPageCsp(dir)).toBe(false)
  })

  it('reports an index.html that still carries the web page policy', () => {
    const dir = fixture({ 'app.js': 'ok' })
    writeFileSync(
      join(dir, 'index.html'),
      '<meta\n http-equiv="Content-Security-Policy"\n content="default-src \'self\'" />',
    )
    expect(findPageCsp(dir)).toBe(true)
  })
})

describe('findWebOnlyFiles (TODO/build-032)', () => {
  it('lists the web-only files a native build still carries', () => {
    const dir = fixture({ 'app.js': 'ok' })
    writeFileSync(join(dir, 'CNAME'), 'app.warpcad.com')
    writeFileSync(join(dir, 'llms-full.txt'), 'x')
    writeFileSync(join(dir, 'index.html'), '')
    expect(findWebOnlyFiles(dir).sort()).toEqual(['CNAME', 'llms-full.txt'])
  })

  it('passes a clean build', () => {
    expect(findWebOnlyFiles(fixture({ 'app.js': 'ok' }))).toEqual([])
  })
})
