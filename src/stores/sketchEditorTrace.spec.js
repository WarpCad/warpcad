// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — test doubles.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

/** The worker boundary (CLAUDE.md: mock at the boundary): each call waits for the spec. */
const calls = []
vi.mock('../sketch/imageClient.js', () => ({
  traceImage: vi.fn(
    (record, seedPx, options) =>
      new Promise((resolve) => {
        calls.push({ record, seedPx, options, resolve })
      }),
  ),
  importImageFile: vi.fn(),
  rememberAssetBitmap: vi.fn(),
  decodeAssetBitmap: vi.fn(),
  releaseAssetBitmaps: vi.fn(),
}))

const { useSketchEditorStore } = await import('./sketchEditor.js')
const { emptySketchParams, signedAreaMm2 } = await import('../sketch/profile.js')

const FRAME = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
const record = () => ({ id: 'img-0123456789abcdef01234567', op: 'asset.image', params: { mime: 'image/png', widthPx: 1400, heightPx: 1000, dataBase64: 'AAAA' } })

/** A traced result in image px: a 100 × 60 px solid and two 20 px holes (y down). */
const traced = (threshold = 120) => ({
  ok: true,
  threshold,
  tolerancePx: 5,
  pointCount: 12,
  outlines: [
    { role: 'solid', pointsPx: [[600, 470], [600, 530], [700, 530], [700, 470]] },
    { role: 'hole', pointsPx: [[610, 490], [630, 490], [630, 510], [610, 510]] },
    { role: 'hole', pointsPx: [[660, 490], [680, 490], [680, 510], [660, 510]] },
  ],
})

/** Let the store's `await` resume. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('sketch editor store — Auto-trace (TODO/sketch-004)', () => {
  /** @type {ReturnType<typeof useSketchEditorStore>} */
  let editor
  beforeEach(() => {
    calls.length = 0
    setActivePinia(createPinia())
    editor = useSketchEditorStore()
    editor.open({ bodyId: null, params: emptySketchParams(), frame: FRAME })
  })

  it('arms only with a shown photo on the active slice, and stands down with the tool or the slice', () => {
    editor.armTrace()
    expect(editor.imageTool).toBe('')
    editor.addImageAsset(record())
    editor.armTrace()
    expect(editor.imageTool).toBe('trace')
    editor.setTool('rect')
    expect(editor.imageTool).toBe('')
    editor.armTrace()
    editor.addSliceAbove()
    expect(editor.imageTool).toBe('')
  })

  it('a tap traces at the Tolerance converted to photo px — 0.5 mm at the provisional 0.1 mm/px is 5 px — with Otsu by default', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    expect(editor.traceRunning).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].seedPx).toEqual([650, 500])
    expect(calls[0].options.tolerancePx).toBeCloseTo(5, 12)
    expect(calls[0].options.threshold).toBeNull()
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    expect(editor.traceRunning).toBe(false)
  })

  it('adds 1 Solid + 2 Hole closed outlines at the photo’s scale, selects the Solid, and says what it made', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    const profiles = editor.draft.slices[0].profiles
    expect(profiles.map((p) => [p.kind, p.role, p.closed])).toEqual([
      ['polyline', 'solid', true],
      ['polyline', 'hole', true],
      ['polyline', 'hole', true],
    ])
    // 100 px at the provisional 0.1 mm/px is 10 mm; counter-clockwise in mm.
    const xs = profiles[0].pointsMm.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 9)
    for (const profile of profiles) expect(signedAreaMm2(profile.pointsMm)).toBeGreaterThan(0)
    expect(editor.selectedProfileId).toBe(profiles[0].id)
    expect(editor.traceMessage).toMatch(/^Traced 1 outline and 2 holes — 12 points/)
    // Not calibrated: it says so rather than passing the provisional scale off as real.
    expect(editor.traceMessage).toMatch(/Not to scale yet/)
    expect(editor.traceMessageKind).toBe('warn')
    expect(editor.traceThresholdUsed).toBe(120)
  })

  it('on a calibrated photo the Tolerance is converted at the real scale, and the message has no warning', async () => {
    editor.addImageAsset(record())
    editor.armScale()
    editor.setScaleLine([200, 915], [700, 915])
    editor.applyScale(100, 'mm', false)
    editor.armTrace()
    const pending = editor.traceAt([400, 300])
    expect(calls[0].options.tolerancePx).toBeCloseTo(2.5, 9)
    calls[0].resolve({ superseded: false, result: { ...traced(), outlines: traced().outlines.slice(0, 1), pointCount: 4 } })
    await pending
    expect(editor.traceMessage).toBe('Traced 1 outline — 4 points')
    expect(editor.traceMessageKind).toBe('ok')
    const xs = editor.draft.slices[0].profiles[0].pointsMm.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(20, 6) // 100 px at 0.2 mm/px
  })

  it('a tap on the background adds nothing and prints why', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([5, 5])
    calls[0].resolve({ superseded: false, result: { ok: false, code: 'edge', reason: 'That region runs off the edge of the photo — tap inside the part' } })
    await pending
    expect(editor.draft.slices[0].profiles).toEqual([])
    expect(editor.traceMessage).toBe('That region runs off the edge of the photo — tap inside the part')
    expect(editor.traceMessageKind).toBe('error')
    expect(editor.imageTool).toBe('trace') // still armed: tap again
  })

  it('a newer tap supersedes an older one: only the newest result lands', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const first = editor.traceAt([650, 500])
    const second = editor.traceAt([660, 500])
    calls[1].resolve({ superseded: false, result: traced() })
    calls[0].resolve({ superseded: false, result: traced() }) // late: ignored
    await Promise.all([first, second])
    expect(editor.draft.slices[0].profiles).toHaveLength(3)
    expect(editor.traceRunning).toBe(false)
  })

  it('a result that lands after the tool stood down is dropped', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    editor.finishTrace()
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    expect(editor.draft.slices[0].profiles).toEqual([])
    expect(editor.traceRunning).toBe(false)
  })

  it('moving the Tolerance or Threshold re-traces the last tap, replacing its outlines rather than adding more', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    const before = editor.draft.slices[0].profiles.map((p) => p.id)
    editor.setTraceTolerance(1)
    expect(calls).toHaveLength(2)
    expect(calls[1].seedPx).toEqual([650, 500])
    expect(calls[1].options.tolerancePx).toBeCloseTo(10, 9)
    calls[1].resolve({ superseded: false, result: traced() })
    await settle()
    const after = editor.draft.slices[0].profiles.map((p) => p.id)
    expect(after).toHaveLength(3)
    expect(after.some((id) => before.includes(id))).toBe(false)

    editor.setTraceThreshold(90)
    expect(calls[2].options.threshold).toBe(90)
    calls[2].resolve({ superseded: false, result: traced(90) })
    await settle()
    expect(editor.draft.slices[0].profiles).toHaveLength(3)
    editor.setTraceThreshold(null) // back to automatic
    expect(calls[3].options.threshold).toBeNull()
  })

  it('a bad Tolerance is refused without tracing', () => {
    editor.addImageAsset(record())
    editor.armTrace()
    editor.setTraceTolerance(-1)
    editor.setTraceTolerance(Number.NaN)
    expect(editor.traceToleranceMm).toBe(0.5)
    expect(calls).toHaveLength(0)
  })

  it('Finish stands the tool down and switches to Select with the traced outline picked, so its points can be cleaned up', async () => {
    editor.addImageAsset(record())
    editor.setTool('circle')
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    const solid = editor.draft.slices[0].profiles[0].id
    editor.finishTrace()
    expect(editor.imageTool).toBe('')
    expect(editor.tool).toBe('select')
    expect(editor.selectedProfileId).toBe(solid)
  })

  it('Finish with nothing traced leaves the tool alone (a plain Cancel)', () => {
    editor.addImageAsset(record())
    editor.setTool('circle')
    editor.armTrace()
    editor.finishTrace()
    expect(editor.imageTool).toBe('')
    expect(editor.tool).toBe('circle')
  })

  it('the traced outlines are draft edits: Cancel (closing without Done) leaves the document untouched', async () => {
    editor.addImageAsset(record())
    editor.armTrace()
    const pending = editor.traceAt([650, 500])
    calls[0].resolve({ superseded: false, result: traced() })
    await pending
    expect(editor.changed).toBe(true)
    editor.close()
    expect(editor.active).toBe(false)
  })
})
