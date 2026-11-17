// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi } from 'vitest'

import { createFrameContent } from './frameContent.js'

/** @param {Partial<Parameters<typeof createFrameContent>[0]>} [over] */
function setup(over = {}) {
  const orbit = { frameBounds: vi.fn() }
  const scheduleRender = vi.fn()
  const frame = createFrameContent({
    orbit,
    summaries: () => [],
    rawBodies: () => [],
    widthPx: () => 800,
    heightPx: () => 400,
    scheduleRender,
    ...over,
  })
  return { frame, orbit, scheduleRender }
}

describe('createFrameContent', () => {
  it('does nothing for an empty document', () => {
    const { frame, orbit, scheduleRender } = setup()
    frame()
    expect(orbit.frameBounds).not.toHaveBeenCalled()
    expect(scheduleRender).not.toHaveBeenCalled()
  })

  it('frames the union of every body at the viewport aspect', () => {
    const { frame, orbit, scheduleRender } = setup({
      summaries: () => [
        { bounds: [[0, 0, 0], [10, 10, 10]] },
        { bounds: [[-5, 2, 3], [4, 20, 6]] },
      ],
    })
    frame()
    expect(orbit.frameBounds).toHaveBeenCalledTimes(1)
    const [min, max, aspect] = orbit.frameBounds.mock.calls[0]
    expect(min).toEqual([-5, 0, 0])
    expect(max).toEqual([10, 20, 10])
    expect(aspect).toBeCloseTo(2, 9)
    expect(scheduleRender).toHaveBeenCalledTimes(1)
  })

  it('uses aspect 1 before the viewport has a height', () => {
    const { frame, orbit } = setup({
      heightPx: () => 0,
      summaries: () => [{ bounds: [[0, 0, 0], [1, 1, 1]] }],
    })
    frame()
    expect(orbit.frameBounds.mock.calls[0][2]).toBe(1)
  })

  it('frames only what is drawn when something is hidden', () => {
    const shown = {
      geometry: { polygons: [{ vertices: [[0, 0, 0], [2, 0, 0], [2, 3, 0]] }], transforms: new Float32Array(16) },
    }
    const { frame, orbit } = setup({
      summaries: () => [
        { bounds: [[0, 0, 0], [100, 100, 100]], viewHidden: true },
        { bounds: [[0, 0, 0], [2, 3, 0]] },
      ],
      rawBodies: () => [{ ...shown, viewHidden: true }, shown],
    })
    frame()
    expect(orbit.frameBounds).toHaveBeenCalledTimes(1)
    const [min, max] = orbit.frameBounds.mock.calls[0]
    expect(max[0]).toBeLessThan(100)
    expect(min[0]).toBeCloseTo(0, 9)
  })

  it('frames every body when everything is hidden', () => {
    const hidden = { geometry: { polygons: [] }, viewHidden: true }
    const { frame, orbit } = setup({
      summaries: () => [{ bounds: [[1, 1, 1], [9, 9, 9]], viewHidden: true }],
      rawBodies: () => [hidden],
    })
    frame()
    expect(orbit.frameBounds).toHaveBeenCalledWith([1, 1, 1], [9, 9, 9], 2)
  })
})
