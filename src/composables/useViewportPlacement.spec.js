// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { useViewportPlacement } from './useViewportPlacement.js'

function setup() {
  const pointer = vi.fn(() => ({ projectToWorkingPlane: vi.fn(() => null) }))
  const placement = useViewportPlacement({
    viewport: () => null,
    pointer,
    orbit: { getMmPerPixel: () => 1 },
    widthPx: () => 800,
    heightPx: () => 600,
    viewportRect: { left: 0, top: 0, width: 800, height: 600 },
    root: () => null,
    documentStore: { resolution: {}, version: 0, raw: { bodies: () => [] } },
    snapGuides: [],
    color: 0x888888,
    isPreviewing: () => false,
    isSketching: () => false,
    sketchCommands: {},
    selection: {},
    syncBodies: vi.fn(),
    scheduleRender: vi.fn(),
  })
  return { placement, pointer }
}

describe('useViewportPlacement', () => {
  it('starts un-snapped with a hidden ghost and builds both controllers', () => {
    const { placement } = setup()
    expect(placement.snapped.value).toBe(false)
    expect(placement.ghostVisible.value).toBe(false)
    expect(placement.placementGhost).toBeTruthy()
    expect(placement.dropTarget).toBeTruthy()
  })

  it('reaches the pointer only when asked (it is built after the placement)', () => {
    const { pointer } = setup()
    expect(pointer).not.toHaveBeenCalled()
  })
})
