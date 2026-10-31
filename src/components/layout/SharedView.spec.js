// SPDX-License-Identifier: AGPL-3.0-or-later
// @vitest-environment jsdom
// @ts-nocheck — drives teleported DOM through `document.body` queries.
import { createPinia, setActivePinia } from 'pinia'
import { enableAutoUnmount, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { nextTick } from 'vue'

import { createDocument } from '../../core/document.js'
import { parseNdjson } from '../../core/ndjson.js'
import { serializeProject } from '../../core/project.js'
import { useShareStore } from '../../stores/share.js'
import SharedView from './SharedView.vue'

enableAutoUnmount(afterEach)

/** `TODO/ui-091` — the Shared view's About popup and header button. The viewport is stubbed (WebGL). */

const q = (id) => document.body.querySelector(`[data-testid="${id}"]`)

/** @param {string} description */
function records(description) {
  const doc = createDocument({ mintProjectId: () => 'senderproject0001' })
  doc.append({ id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [20, 20, 20], center: [0, 0, 10] } }, { origin: 'local' })
  if (description !== '') doc.setDescription(description, { origin: 'local' })
  return parseNdjson(serializeProject(doc)).records
}

function mountView() {
  return mount(SharedView, { attachTo: document.body, global: { stubs: { Viewport: true, ReplaceConfirmDialog: true } } })
}

/** @param {string} description @param {boolean} [own] */
function showLink(description, own = false) {
  const share = useShareStore()
  share.show(share.begin(), { ok: true, records: records(description), name: 'Duct', note: '' })
  share.offerAbout(own)
  return share
}

beforeEach(() => setActivePinia(createPinia()))

describe('SharedView — the About popup', () => {
  it('opens over the model with the description; View the model dismisses it; About brings it back', async () => {
    showLink('Fan duct. **Print upright.**')
    mountView()
    await nextTick()
    expect(q('shared-about')).not.toBeNull()
    expect(q('shared-about-text').textContent).toContain('Print upright.')
    q('shared-about-close').click()
    await nextTick()
    await nextTick()
    expect(q('shared-about')).toBeNull()
    expect(document.activeElement).toBe(q('shared-about-open'))
    q('shared-about-open').click()
    await nextTick()
    expect(q('shared-about')).not.toBeNull()
  })

  it('a project with no description has no popup and no About button', async () => {
    showLink('')
    mountView()
    await nextTick()
    expect(q('shared-about')).toBeNull()
    expect(q('shared-about-open')).toBeNull()
  })

  it('the owner’s own link has no popup but keeps the About button', async () => {
    showLink('Fan duct', true)
    mountView()
    await nextTick()
    expect(q('shared-about')).toBeNull()
    expect(q('shared-about-open')).not.toBeNull()
  })

  it('shows no popup or button while the link is still opening', async () => {
    useShareStore().begin()
    mountView()
    await nextTick()
    expect(q('shared-about')).toBeNull()
    expect(q('shared-about-open')).toBeNull()
  })
})
