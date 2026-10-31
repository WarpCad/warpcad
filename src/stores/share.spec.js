// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it } from 'vitest'

import { createDocument } from '../core/document.js'
import { parseNdjson } from '../core/ndjson.js'
import { serializeProject } from '../core/project.js'
import { useShareStore } from './share.js'

/**
 * `TODO/ui-091`: the Shared view holds the decoded project's description and offers it once per
 * link, as a popup — never for the owner's own link, never before the project is ready.
 */

const CUBE = { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }

/** @param {string} [description] */
function recordsWith(description = '') {
  const doc = createDocument({ mintProjectId: () => 'senderproject0001' })
  doc.append(CUBE, { origin: 'local' })
  if (description !== '') doc.setDescription(description, { origin: 'local' })
  return parseNdjson(serializeProject(doc)).records
}

/** @param {object[]} records */
const decoded = (records) => /** @type {any} */ ({ ok: true, records, name: 'Duct', note: '' })

beforeEach(() => setActivePinia(createPinia()))

describe('share store — the description popup (TODO/ui-091)', () => {
  it('exposes the decoded project’s description once ready, and nothing while opening or incomplete', () => {
    const share = useShareStore()
    const token = share.begin()
    expect(share.description).toBe('')
    expect(share.offerAbout(false)).toBe(false)
    expect(share.aboutOpen).toBe(false)
    share.fail(token, 'malformed')
    expect(share.offerAbout(false)).toBe(false)
    expect(share.aboutOpen).toBe(false)

    const next = share.begin()
    expect(share.show(next, decoded(recordsWith('Fan duct. **Print upright.**')))).toBe(true)
    expect(share.description).toBe('Fan duct. **Print upright.**')
  })

  it('opens once per link; reopening is by openAbout only', () => {
    const share = useShareStore()
    share.show(share.begin(), decoded(recordsWith('Fan duct')))
    expect(share.offerAbout(false)).toBe(true)
    expect(share.aboutOpen).toBe(true)
    share.closeAbout()
    expect(share.aboutOpen).toBe(false)
    expect(share.offerAbout(false)).toBe(false)
    expect(share.aboutOpen).toBe(false)
    share.openAbout()
    expect(share.aboutOpen).toBe(true)
  })

  it('does not open for the owner’s own link, but the About button still can', () => {
    const share = useShareStore()
    share.show(share.begin(), decoded(recordsWith('Fan duct')))
    expect(share.offerAbout(true)).toBe(false)
    expect(share.aboutOpen).toBe(false)
    share.openAbout()
    expect(share.aboutOpen).toBe(true)
  })

  it('does not open for a project with no description, and openAbout is a no-op for it', () => {
    const share = useShareStore()
    share.show(share.begin(), decoded(recordsWith()))
    expect(share.offerAbout(false)).toBe(false)
    share.openAbout()
    expect(share.aboutOpen).toBe(false)
  })

  it('a new link offers again; leaving clears the state', () => {
    const share = useShareStore()
    share.show(share.begin(), decoded(recordsWith('One')))
    share.offerAbout(false)
    share.closeAbout()
    share.show(share.begin(), decoded(recordsWith('Two')))
    expect(share.aboutOpen).toBe(false)
    expect(share.offerAbout(false)).toBe(true)
    share.leave()
    expect(share.aboutOpen).toBe(false)
    expect(share.description).toBe('')
  })
})
