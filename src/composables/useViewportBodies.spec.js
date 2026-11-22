// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { useViewportBodies } from './useViewportBodies.js'

function setup() {
  return useViewportBodies({
    bodies: () => [],
    isHiddenShown: () => false,
    isSketched: () => false,
    selection: /** @type {any} */ ({ has: () => false, ids: [] }),
    alignReference: /** @type {any} */ ({ originOnly: false }),
    hoverHighlight: /** @type {any} */ ({ target: null, many: null }),
    repeatSession: /** @type {any} */ ({ seed: null, outlined: [] }),
    colorPreview: /** @type {any} */ ({ bodyId: null, color: 0, subPart: undefined }),
    scheduleRender: vi.fn(),
  })
}

describe('useViewportBodies', () => {
  it('aliases the controller group and map, and owns a reactive counts object', () => {
    const v = setup()
    expect(v.bodiesGroup).toBe(v.bodyScene.group)
    expect(v.bodyMeshes).toBe(v.bodyScene.meshes)
    expect(v.bodyCounts.xrayTwins).toBe(0)
    expect(v.bodyCounts.hoverTwins).toBe(0)
  })

  it('syncs an empty document to no meshes', () => {
    const v = setup()
    v.bodyScene.syncBodies()
    expect(v.bodyMeshes.size).toBe(0)
  })
})
