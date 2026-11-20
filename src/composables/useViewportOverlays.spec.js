// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'
import { isReactive } from 'vue'

import { useViewportOverlays } from './useViewportOverlays.js'

describe('useViewportOverlays', () => {
  it('returns every overlay structure the viewport template reads, all reactive', () => {
    const o = useViewportOverlays()
    expect(Object.keys(o).sort()).toEqual(
      [
        'overlay',
        'gizmoAnnotation',
        'dialAnnotation',
        'rulerAnnotation',
        'dimensionAnnotations',
        'cutPlaneAnnotation',
        'marqueeRect',
        'snapGuides',
        'sketchPaths',
        'sketchDraftPath',
        'sketchAxis',
        'sketchChain',
        'sketchHandles',
        'sketchSnap',
      ].sort(),
    )
    for (const value of Object.values(o)) expect(isReactive(value)).toBe(true)
  })

  it('starts with the camera mirror at its documented defaults', () => {
    const { overlay } = useViewportOverlays()
    expect(overlay).toEqual({
      azimuthDeg: 0,
      elevationDeg: 0,
      distanceMm: 0,
      target: '0,0,0',
      mmPerPixel: 0,
      minorMm: 10,
      majorMm: 50,
    })
  })

  it('allocates three dimension annotations and empty sketch structures', () => {
    const o = useViewportOverlays()
    expect(o.dimensionAnnotations).toHaveLength(3)
    expect(o.sketchPaths).toHaveLength(0)
    expect(o.sketchAxis).toEqual({ visible: false, d: '' })
    expect(o.sketchChain.visible).toBe(false)
    expect(o.sketchHandles.vertices).toHaveLength(0)
    expect(o.sketchHandles.midpoints).toHaveLength(0)
    expect(o.sketchSnap.visible).toBe(false)
  })

  it('gives each call its own structures, and mutation in place sticks', () => {
    const a = useViewportOverlays()
    const b = useViewportOverlays()
    expect(a.overlay).not.toBe(b.overlay)
    const ref = a.overlay
    a.overlay.azimuthDeg = 42
    expect(ref.azimuthDeg).toBe(42)
    expect(b.overlay.azimuthDeg).toBe(0)
  })
})
