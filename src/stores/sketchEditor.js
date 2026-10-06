// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The open sketch editor — UI state, never document state (`TODO/sketch-001`).
 *
 * The editor works on a **draft**: a copy of a sketch body's params (or a fresh empty one
 * for a sketch just dropped from the Library). Every stroke, role change and slice edit
 * replaces the draft here; nothing touches the document until **Done**, which appends
 * exactly one record (or makes one in-place revision), so one editing session is one
 * undo step and the document never holds a half-drawn sketch. **Cancel** throws the draft
 * away. Per CLAUDE.md, this is UI state: it is never persisted, and it lives only while
 * the editor is open.
 *
 * The draft is replaced, never mutated in place: `src/sketch/profile.js`'s edits are pure
 * and return a new params object, and `shallowRef` means Vue never walks it — a sketch
 * can hold thousands of polyline points.
 *
 * Selection *inside* the editor (which outline is picked, and which of its points —
 * `TODO/sketch-002`) is held here too, deliberately
 * not in `src/stores/selection.js`: that store selects bodies, and ui-020's second
 * `sketchId` there had to be kept mutually exclusive with body selection by every path
 * that touched either. An editor-local selection needs no such rule.
 *
 * @module stores/sketchEditor
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef, toRaw } from 'vue'

import { formatMmValue } from '../core/units.js'
import { defaultPlacement, formatScale } from '../sketch/calibration.js'
import { addTracedOutlines, applyCalibration, sliceImageOf, tracedProfiles, withSliceImage } from '../sketch/referenceImage.js'
import { traceImage } from '../sketch/imageClient.js'
import { useDocumentStore } from './document.js'

import { simplifyPoints } from '../sketch/simplify.js'
import {
  EXTRUSION_METHODS,
  addProfile,
  appendVertex,
  convertToOutline,
  popVertex,
  deleteVertex as deleteVertexOf,
  deleteVertexProblem,
  insertVertex as insertVertexOf,
  moveVertex as moveVertexOf,
  isClosed,
  addSlice,
  emptySketchParams,
  methodProblem,
  removeProfile,
  removeSlice,
  replaceProfile,
  setRole,
  setSliceZ,
  sketchProblem,
  withExtrusionParam,
  withMethod,
} from '../sketch/profile.js'

/** @typedef {import('../sketch/profile.js').SketchParams} SketchParams */
/** @typedef {import('../sketch/profile.js').Profile} Profile */
/** @typedef {'select' | 'line' | 'rect' | 'circle' | 'polygon'} SketchTool */
/** @typedef {'' | 'slices' | 'extrude'} SketchPanel */
/** @typedef {import('../sketch/imageAsset.js').ImageAssetRecord} ImageAssetRecord */
/** @typedef {import('../sketch/calibration.js').ImagePlacement} ImagePlacement */
/** @typedef {import('../sketch/calibration.js').LengthUnit} LengthUnit */

/**
 * What a slice's reference image is, for the Slices panel and the viewport
 * (`TODO/sketch-003`): none; shown (with or without a calibrated scale); or **removed** —
 * the slice names a photo the document does not hold, because a load dropped it as unsafe.
 *
 * @typedef {object} SliceImageView
 * @property {'none' | 'ok' | 'removed'} state
 * @property {ImagePlacement | null} placement
 * @property {ImageAssetRecord | null} asset
 * @property {string} badge `Not to scale`, `1 px = 0.199 mm`, or `''`.
 * @property {'' | 'unsafe' | 'off'} [removedBecause] Why a `removed` photo is missing: a load
 *   dropped it as unsafe, or its History row is suppressed or past the rollback marker.
 */

/** @type {SliceImageView} */
const NO_IMAGE = Object.freeze({ state: 'none', placement: null, asset: null, badge: '' })

/**
 * The tools, in toolbar order. Hardcoded on purpose — see `SketchToolbar.vue`.
 *
 * `select` is the one that never draws (`TODO/sketch-005`): a press on an outline picks it,
 * a press on empty canvas clears, and a drag does nothing. The other four draw.
 */
export const SKETCH_TOOLS = /** @type {readonly SketchTool[]} */ (Object.freeze(['select', 'line', 'rect', 'circle', 'polygon']))

const IDENTITY_FRAME = Object.freeze([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

export const useSketchEditorStore = defineStore('sketchEditor', () => {
  /** Whether the editor is open. Writable so a spec can stand it up without a drop. */
  const active = ref(false)
  /** The body being edited, or `null` for a brand-new sketch. */
  const bodyId = ref(/** @type {string | null} */ (null))
  /** Where a new sketch's origin will be — the drop point. */
  const originMm = ref(/** @type {[number, number, number]} */ ([0, 0, 0]))
  /** Sketch-local mm → world mm: where the sketch plane is drawn and picked. */
  const frame = shallowRef(/** @type {readonly number[]} */ (IDENTITY_FRAME))
  /** The draft params. Replaced on every edit, never mutated. */
  const draft = shallowRef(/** @type {SketchParams} */ (emptySketchParams()))
  /** The params the session started from — what Cancel restores (by not committing). */
  const baseline = shallowRef(/** @type {SketchParams} */ (emptySketchParams()))
  const activeSlice = ref(0)
  const selectedProfileId = ref('')
  /** The outline under the mouse while Select is armed — a highlight only, never a selection. */
  const hoverProfileId = ref('')
  /**
   * The picked point of the selected outline, by index into its `pointsMm`, or `-1`
   * (`TODO/sketch-002`). Only a polyline has points to pick; every change of outline,
   * slice or session clears it.
   */
  const selectedVertex = ref(-1)
  /** The point under the mouse — a highlight only, never a selection. */
  const hoverVertex = ref(-1)
  const tool = ref(/** @type {SketchTool} */ ('circle'))
  const polygonSides = ref(6)
  /**
   * Whether a draw gesture snaps to the outlines already on the slice (`TODO/sketch-007`). On by
   * default; the toolbar's **Snap** toggle turns it off, and it stays off for the rest of the
   * session — `open`/`close` deliberately leave it alone. Shift held while drawing turns it
   * off for that one gesture without touching this.
   */
  const snapEnabled = ref(true)
  /** Which of the Slices / Extrude panels is open — one at a time. */
  const panel = ref(/** @type {SketchPanel} */ (''))
  /** The open Line chain being extended, or `''` (it has at least one segment). */
  const chainId = ref('')
  /**
   * The Line chain's first vertex while it has no segment yet (`TODO/sketch-006`), or `null`.
   * A polyline needs two points, so a lone start point lives here, not in the draft.
   */
  const chainStartMm = ref(/** @type {[number, number] | null} */ (null))
  /** The chain just ended by Esc/Finish, so a second Esc right after can cancel it. */
  let finishedChain = { id: '', at: 0 }
  /** The worker preview's state: what the Done gate reads besides the static checks. */
  const previewStatus = ref(/** @type {'idle' | 'building' | 'ok' | 'error'} */ ('idle'))
  const previewError = ref('')
  /** Why the last Done was refused by the document, shown until the next edit. */
  const commitError = ref('')
  let profileCounter = 0
  let sliceCounter = 0

  // --- the reference image (TODO/sketch-003) ---------------------------------
  //
  // A photo added in this session is an `asset.image` record the document does not hold
  // yet: it waits here, with the draft, and Done appends it in the same undo step as the
  // sketch. Not reactive — a record holds up to 1.5 MB of base64, and Vue must never walk
  // it; `assetsVersion` is what views track instead.
  /** @type {Map<string, ImageAssetRecord>} */
  const pendingAssets = new Map()
  const assetsVersion = ref(0)
  /** Add/Replace image is re-encoding a photo in the worker. */
  const imageImporting = ref(false)
  /** Why the last Add image was refused, shown in the Reference image group until the next try. */
  const imageError = ref('')
  /**
   * The armed image tool: `'scale'` while Set scale is waiting for its line, `'trace'` while
   * Auto-trace is waiting for a tap (`TODO/sketch-004`), else `''`.
   */
  const imageTool = ref(/** @type {'' | 'scale' | 'trace'} */ (''))
  /** Set scale's two points, in image px, as they are fixed. */
  const scaleAPx = shallowRef(/** @type {[number, number] | null} */ (null))
  const scaleBPx = shallowRef(/** @type {[number, number] | null} */ (null))
  const documentStore = useDocumentStore()

  // --- Auto-trace (TODO/sketch-004) ------------------------------------------
  /** How closely a traced outline follows the pixels, in mm. Kept for the session. */
  const traceToleranceMm = ref(0.5)
  /** A manual threshold (0..255), or `null` for automatic (Otsu). Kept for the session. */
  const traceThreshold = ref(/** @type {number | null} */ (null))
  /** The threshold the last trace actually used — what the slider shows while on Auto. */
  const traceThresholdUsed = ref(/** @type {number | null} */ (null))
  /** A trace is running in the worker. */
  const traceRunning = ref(false)
  /** What the last tap made, or why it made nothing. */
  const traceMessage = ref('')
  const traceMessageKind = ref(/** @type {'' | 'ok' | 'warn' | 'error'} */ (''))
  /** How many taps traced something since Auto-trace was armed — Cancel vs Finish. */
  const tracedThisArming = ref(0)
  /** The last successful tap and the outlines it made, so a slider change can re-trace it. */
  let lastTrace = /** @type {{ seedPx: [number, number], ids: string[] } | null} */ (null)
  /** Bumped by every tap and every stand-down: only the newest tap's answer may land. */
  let traceToken = 0

  /** Whether a Line chain is live — a start point is fixed or a segment is being extended. */
  const chainLive = computed(() => chainStartMm.value !== null || chainId.value !== '')

  const slice = computed(() => draft.value.slices[activeSlice.value] ?? draft.value.slices[0])
  /** How many vertices the live Line chain has fixed so far — `0` with no chain. */
  const chainPointCount = computed(() => {
    if (chainStartMm.value) return 1
    if (!chainId.value) return 0
    const profile = slice.value?.profiles.find((candidate) => candidate.id === chainId.value)
    return profile && profile.kind === 'polyline' && !profile.closed ? profile.pointsMm.length : 0
  })
  const selectedProfile = computed(
    () => slice.value?.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )

  /** The picked point's `[x, y]` mm, or `null`. */
  const selectedVertexMm = computed(() => {
    const profile = selectedProfile.value
    if (!profile || profile.kind !== 'polyline') return null
    return profile.pointsMm[selectedVertex.value] ?? null
  })

  /**
   * What Delete (the toolbar's trash, Delete/Backspace) acts on: the picked **point** when
   * there is one, else the picked outline, else nothing (`TODO/sketch-002` reconciling
   * `TODO/sketch-005`). A refused point delete never falls through to the outline.
   */
  const deleteTarget = computed(() => (!selectedProfile.value ? '' : selectedVertexMm.value ? 'vertex' : 'outline'))

  /** Why Delete is refused right now, or `''` — "An outline needs at least 3 points". */
  const deleteProblem = computed(() => {
    if (deleteTarget.value !== 'vertex' || !selectedProfile.value) return ''
    return deleteVertexProblem(selectedProfile.value) ?? ''
  })

  /**
   * One line naming the selected outline — `Circle, Hole — 15 mm radius` — or `''` with
   * none selected. The feedback a person gets when the Inspector sheet is closed, which
   * is always at phone width (`TODO/sketch-005`).
   */
  const selectionStatus = computed(() => {
    const profile = selectedProfile.value
    if (!profile) return ''
    const role = profile.role === 'hole' ? 'Hole' : 'Solid'
    const mm = formatMmValue
    if (profile.kind === 'circle') return `Circle, ${role} — ${mm(profile.radiusMm)} mm radius`
    if (profile.kind === 'rect') return `Rectangle, ${role} — ${mm(profile.widthMm)} × ${mm(profile.heightMm)} mm`
    if (profile.kind === 'polygon') return `Polygon, ${role} — ${profile.sides} sides, ${mm(profile.radiusMm)} mm radius`
    const count = profile.pointsMm.length
    const point = selectedVertexMm.value ? ` · point ${selectedVertex.value + 1} selected` : ''
    return `${isClosed(profile) ? 'Closed' : 'Open'} outline, ${role} — ${count} point${count === 1 ? '' : 's'}${point}`
  })

  /** Why Done is disabled, or `''`. Static checks first, then the kernel's own answer. */
  const doneProblem = computed(() => {
    const problem = sketchProblem(draft.value)
    if (problem) return problem
    if (previewStatus.value === 'error') return previewError.value
    return ''
  })

  /** Why each method button is disabled, by method — `''` when it is available. */
  const methodProblems = computed(() =>
    Object.fromEntries(EXTRUSION_METHODS.map((method) => [method, methodProblem(draft.value, method) ?? ''])),
  )

  /**
   * An `asset.image` record by id: one added in this session, else the document's own.
   *
   * @param {string} id
   * @returns {ImageAssetRecord | null}
   */
  function assetOf(id) {
    return pendingAssets.get(id) ?? /** @type {any} */ (toRaw(documentStore.raw).assets().get(id)) ?? null
  }

  /**
   * @param {import('../sketch/profile.js').Slice | undefined} entry
   * @returns {SliceImageView}
   */
  function imageViewOf(entry) {
    if (!entry || entry.image === undefined) return NO_IMAGE
    const placement = sliceImageOf(entry)
    const asset = placement ? assetOf(placement.assetId) : null
    if (!placement || !asset) {
      // Still in the log, just not folded (suppressed, or past the rollback marker): that is
      // the user's own History choice, not an unsafe image, and the message must say so.
      const inLog = placement !== null && toRaw(documentStore.raw).entries.some((entry) => entry.record.id === placement.assetId)
      return { state: 'removed', placement, asset: null, badge: '', removedBecause: inLog ? 'off' : 'unsafe' }
    }
    return { state: 'ok', placement, asset, badge: placement.calibration ? formatScale(placement.mmPerPx) : 'Not to scale' }
  }

  /** Every slice's image, index-aligned with the draft's slices. */
  const sliceImages = computed(() => {
    void assetsVersion.value
    void documentStore.version
    return draft.value.slices.map(imageViewOf)
  })

  /** The active slice's image. */
  const activeImage = computed(() => sliceImages.value[activeSlice.value] ?? NO_IMAGE)

  /** Which Set scale step is next: the first point, the second, or the length. `''` when not armed. */
  const scaleStep = computed(() => {
    if (imageTool.value !== 'scale') return ''
    if (!scaleAPx.value) return 'first'
    if (!scaleBPx.value) return 'second'
    return 'length'
  })

  /** Whether the draft differs from what the session started with. */
  const changed = computed(() => JSON.stringify(draft.value) !== JSON.stringify(baseline.value))

  /**
   * Open the editor.
   *
   * @param {{ bodyId: string | null, params: SketchParams, frame: readonly number[], originMm?: [number, number, number] }} session
   */
  function open(session) {
    /** @type {SketchParams} */
    const params = JSON.parse(JSON.stringify({ slices: session.params.slices, extrusion: session.params.extrusion }))
    bodyId.value = session.bodyId
    originMm.value = session.originMm ?? [0, 0, 0]
    frame.value = session.frame
    draft.value = params
    baseline.value = params
    activeSlice.value = 0
    selectedProfileId.value = ''
    hoverProfileId.value = ''
    selectedVertex.value = -1
    hoverVertex.value = -1
    panel.value = ''
    chainId.value = ''
    chainStartMm.value = null
    previewStatus.value = 'idle'
    previewError.value = ''
    commitError.value = ''
    resetImageSession()
    profileCounter = Math.max(0, ...params.slices.flatMap((entry) => entry.profiles.map((profile) => Number(/^p(\d+)$/.exec(profile.id)?.[1] ?? 0))))
    sliceCounter = Math.max(0, ...params.slices.map((entry) => Number(/^s(\d+)$/.exec(entry.id)?.[1] ?? 0)))
    active.value = true
  }

  function close() {
    resetImageSession()
    active.value = false
    bodyId.value = null
    selectedProfileId.value = ''
    hoverProfileId.value = ''
    selectedVertex.value = -1
    hoverVertex.value = -1
    panel.value = ''
    chainId.value = ''
    chainStartMm.value = null
    previewStatus.value = 'idle'
    previewError.value = ''
    commitError.value = ''
  }

  function resetImageSession() {
    pendingAssets.clear()
    assetsVersion.value += 1
    imageImporting.value = false
    imageError.value = ''
    cancelScale()
  }

  // --- the reference image (TODO/sketch-003) ---------------------------------

  /**
   * **Add image…** / **Replace image…** finished: the active slice now shows this photo,
   * centred on the origin at the provisional scale. A replaced photo's opacity carries over;
   * its scale does not — a new photo is a new measurement.
   *
   * @param {ImageAssetRecord} record Already sanitized by the import.
   */
  function addImageAsset(record) {
    pendingAssets.set(record.id, record)
    assetsVersion.value += 1
    const previous = sliceImageOf(slice.value)
    setDraft(withSliceImage(draft.value, activeSlice.value, { ...defaultPlacement(record.id), opacity: previous?.opacity ?? 0.5 }))
    imageError.value = ''
    cancelScale()
  }

  /**
   * Change the active slice's image placement: opacity, X/Y offset, rotation.
   *
   * @param {Partial<Pick<ImagePlacement, 'opacity' | 'offsetMm' | 'rotationDeg'>>} change
   */
  function updateImage(change) {
    const placement = sliceImageOf(slice.value)
    if (!placement) return
    setDraft(withSliceImage(draft.value, activeSlice.value, { ...placement, ...change }))
  }

  /** **Remove image** — also what clears a slice whose photo a load removed as unsafe. */
  function removeImage() {
    if (!slice.value || slice.value.image === undefined) return
    setDraft(withSliceImage(draft.value, activeSlice.value, null))
    cancelScale()
  }

  /** **Set scale**: arm the two-point tool. Needs a shown image on the active slice. */
  function armScale() {
    if (activeImage.value.state !== 'ok') return
    endChain()
    cancelScale()
    imageTool.value = 'scale'
    scaleAPx.value = null
    scaleBPx.value = null
  }

  /**
   * Stand the armed image tool down — Set scale or Auto-trace (the name predates the second).
   * Every path that changes tool, slice, photo or session comes through here, so a trace
   * still running in the worker can never land on a slice the user has left.
   */
  function cancelScale() {
    imageTool.value = ''
    scaleAPx.value = null
    scaleBPx.value = null
    traceToken += 1
    traceRunning.value = false
    lastTrace = null
  }

  // --- Auto-trace (TODO/sketch-004) ------------------------------------------

  /** **Auto-trace**: arm the tap tool. Needs a shown image on the active slice. */
  function armTrace() {
    if (activeImage.value.state !== 'ok') return
    endChain()
    cancelScale()
    imageTool.value = 'trace'
    traceMessage.value = ''
    traceMessageKind.value = ''
    tracedThisArming.value = 0
  }

  /**
   * One tap while Auto-trace is armed: trace the region under it in the worker, then add the
   * outline (Solid) and its enclosed holes (Hole) to the active slice at the photo's scale.
   * A newer tap supersedes this one. With `replace`, the outlines a previous trace of the
   * same tap made are swapped for the new ones (a slider changed).
   *
   * @param {readonly number[]} px Image px.
   * @param {readonly string[]} [replace]
   * @returns {Promise<void>}
   */
  async function traceAt(px, replace = []) {
    if (imageTool.value !== 'trace') return
    const view = activeImage.value
    if (view.state !== 'ok' || !view.placement || !view.asset) return
    const token = (traceToken += 1)
    const placement = view.placement
    const asset = view.asset
    const sliceIndex = activeSlice.value
    /** @type {[number, number]} */
    const seedPx = [px[0], px[1]]
    traceRunning.value = true
    const outcome = await traceImage(asset, seedPx, {
      tolerancePx: traceToleranceMm.value / placement.mmPerPx,
      threshold: traceThreshold.value,
    })
    if (token !== traceToken) return
    traceRunning.value = false
    if (outcome.superseded || imageTool.value !== 'trace') return
    const result = outcome.result
    if (typeof result.threshold === 'number') traceThresholdUsed.value = result.threshold
    if (!result.ok) {
      traceMessage.value = result.reason
      traceMessageKind.value = 'error'
      return
    }
    const size = { widthPx: asset.params.widthPx, heightPx: asset.params.heightPx }
    const profiles = tracedProfiles(result.outlines, placement, size, nextProfileId)
    try {
      setDraft(addTracedOutlines(draft.value, sliceIndex, profiles, replace))
    } catch (error) {
      traceMessage.value = error instanceof Error ? error.message : String(error)
      traceMessageKind.value = 'error'
      return
    }
    lastTrace = { seedPx, ids: profiles.map((profile) => profile.id) }
    tracedThisArming.value += 1
    selectProfile(profiles[0].id)
    const holes = profiles.length - 1
    const made = `Traced 1 outline${holes > 0 ? ` and ${holes} hole${holes === 1 ? '' : 's'}` : ''} — ${result.pointCount} points`
    if (placement.calibration) {
      traceMessage.value = made
      traceMessageKind.value = 'ok'
    } else {
      // Never pass the provisional 1 px = 0.1 mm off as a real size.
      traceMessage.value = `${made}. Not to scale yet — Set scale, then answer Yes to resize them`
      traceMessageKind.value = 'warn'
    }
  }

  /** Re-trace the last tap with the current Tolerance and Threshold, replacing its outlines. */
  function retrace() {
    if (imageTool.value !== 'trace' || !lastTrace) return
    const present = new Set(slice.value?.profiles.map((profile) => profile.id) ?? [])
    if (!lastTrace.ids.every((id) => present.has(id))) return
    traceAt(lastTrace.seedPx, lastTrace.ids)
  }

  /**
   * The **Tolerance** slider, in mm: re-traces the last tap.
   *
   * @param {number} mm
   */
  function setTraceTolerance(mm) {
    if (!(Number.isFinite(mm) && mm > 0)) return
    traceToleranceMm.value = mm
    retrace()
  }

  /**
   * The **Threshold**: a gray level 0..255, or `null` for automatic. Re-traces the last tap.
   *
   * @param {number | null} value
   */
  function setTraceThreshold(value) {
    if (value !== null && !Number.isFinite(value)) return
    traceThreshold.value = value === null ? null : Math.min(255, Math.max(0, Math.round(value)))
    retrace()
  }

  /**
   * **Finish** (or **Cancel**, before anything was traced; or Esc): stand Auto-trace down.
   * If it traced something, Select is armed with the traced outline picked, so its points
   * show and can be dragged, added and deleted straight away.
   */
  function finishTrace() {
    const traced = tracedThisArming.value > 0
    const picked = selectedProfileId.value
    cancelScale()
    tracedThisArming.value = 0
    if (!traced) return
    setTool('select')
    if (picked) selectProfile(picked)
  }

  /**
   * Fix the next Set scale point (a tap): the first, then the second.
   *
   * @param {readonly number[]} px Image px.
   */
  function addScalePoint(px) {
    if (imageTool.value !== 'scale' || !Number.isFinite(px[0]) || !Number.isFinite(px[1])) return
    if (!scaleAPx.value) scaleAPx.value = [px[0], px[1]]
    else if (!scaleBPx.value) scaleBPx.value = [px[0], px[1]]
  }

  /**
   * Set both points at once (a press-and-drag along the ruler).
   *
   * @param {readonly number[]} aPx
   * @param {readonly number[]} bPx
   */
  function setScaleLine(aPx, bPx) {
    if (imageTool.value !== 'scale') return
    scaleAPx.value = [aPx[0], aPx[1]]
    scaleBPx.value = [bPx[0], bPx[1]]
  }

  /**
   * **Apply**: the photo takes the scale the line measures. With `rescaleOutlines`, the
   * slice's outlines scale with it (the confirm's Yes).
   *
   * @param {number} length
   * @param {LengthUnit} unit
   * @param {boolean} rescaleOutlines
   * @returns {string} Why it was refused, or `''` when applied.
   */
  function applyScale(length, unit, rescaleOutlines) {
    const view = activeImage.value
    if (view.state !== 'ok' || !view.asset || !scaleAPx.value || !scaleBPx.value) return 'Draw the line along the ruler first'
    try {
      const size = { widthPx: view.asset.params.widthPx, heightPx: view.asset.params.heightPx }
      setDraft(applyCalibration(draft.value, activeSlice.value, size, { aPx: scaleAPx.value, bPx: scaleBPx.value, length, unit }, rescaleOutlines))
    } catch (error) {
      return error instanceof Error ? error.message : String(error)
    }
    cancelScale()
    return ''
  }

  /**
   * The photos Done must append: added this session, still named by a slice, and not
   * already in the document (the id is a content hash, so re-adding a photo reuses it).
   *
   * @returns {ImageAssetRecord[]}
   */
  function assetsToCommit() {
    const named = new Set(draft.value.slices.map((entry) => sliceImageOf(entry)?.assetId).filter(Boolean))
    const held = toRaw(documentStore.raw).assets()
    return [...pendingAssets.values()].filter((record) => named.has(record.id) && !held.has(record.id))
  }

  /** @param {SketchParams} next */
  function setDraft(next) {
    draft.value = next
    commitError.value = ''
  }

  /** A fresh profile id, unique within the draft. */
  function nextProfileId() {
    profileCounter += 1
    return `p${profileCounter}`
  }

  /** @param {Profile} profile */
  function addToActiveSlice(profile) {
    setDraft(addProfile(draft.value, activeSlice.value, profile))
  }

  /** @param {Profile} profile */
  function replaceInActiveSlice(profile) {
    setDraft(replaceProfile(draft.value, activeSlice.value, profile))
  }

  /** @param {'solid' | 'hole'} role */
  function setSelectedRole(role) {
    if (!selectedProfileId.value) return
    setDraft(setRole(draft.value, activeSlice.value, selectedProfileId.value, role))
  }

  function deleteSelected() {
    if (!selectedProfileId.value) return
    if (chainId.value === selectedProfileId.value) endChain()
    setDraft(removeProfile(draft.value, activeSlice.value, selectedProfileId.value))
    selectedProfileId.value = ''
    selectedVertex.value = -1
    hoverVertex.value = -1
  }

  /** @param {string} id */
  function selectProfile(id) {
    selectedProfileId.value = id
    selectedVertex.value = -1
    hoverVertex.value = -1
  }

  // --- points of the selected outline (TODO/sketch-002) ----------------------

  /** The selected outline if it is a polyline — the only kind with points to edit. */
  function selectedPolyline() {
    const profile = selectedProfile.value
    return profile && profile.kind === 'polyline' ? profile : null
  }

  /**
   * Pick a point of the selected outline, or clear with `-1`. Ignored (cleared) without a
   * selected polyline or for an index it does not have.
   *
   * @param {number} index
   */
  function selectVertex(index) {
    const profile = selectedPolyline()
    selectedVertex.value = profile && Number.isInteger(index) && index >= 0 && index < profile.pointsMm.length ? index : -1
  }

  /** @param {number} index @param {readonly number[]} pointMm */
  function moveVertex(index, pointMm) {
    const profile = selectedPolyline()
    if (!profile) return
    replaceInActiveSlice(moveVertexOf(profile, index, pointMm))
  }

  /**
   * Insert a point on one segment of the selected outline (its midpoint, unless `pointMm`
   * says where) and pick it.
   *
   * @param {number} segmentIndex
   * @param {readonly number[]} [pointMm]
   * @returns {number} The new point's index, or `-1` when nothing was inserted.
   */
  function insertVertexOn(segmentIndex, pointMm) {
    const profile = selectedPolyline()
    if (!profile) return -1
    replaceInActiveSlice(insertVertexOf(profile, segmentIndex, pointMm))
    selectedVertex.value = segmentIndex + 1
    return segmentIndex + 1
  }

  /** Remove the picked point — refused, doing nothing, below 3 points (2 for a line). */
  function deleteSelectedVertex() {
    const profile = selectedPolyline()
    if (!profile || !selectedVertexMm.value || deleteProblem.value) return
    replaceInActiveSlice(deleteVertexOf(profile, selectedVertex.value))
    selectedVertex.value = -1
    hoverVertex.value = -1
  }

  /**
   * The one Delete: the toolbar's trash and Delete/Backspace both call this. A picked point
   * goes first; with no point picked, the outline goes.
   */
  function deleteSelection() {
    if (deleteTarget.value === 'vertex') deleteSelectedVertex()
    else if (deleteTarget.value === 'outline') deleteSelected()
  }

  /** **Convert to outline**: the selected rectangle, circle or polygon becomes a polyline. */
  function convertSelectedToOutline() {
    const profile = selectedProfile.value
    if (!profile || profile.kind === 'polyline') return
    replaceInActiveSlice(convertToOutline(profile))
    selectedVertex.value = -1
    if (chainId.value === profile.id) endChain()
  }

  /**
   * **Simplify** the selected outline at a tolerance in mm.
   *
   * @param {number} toleranceMm
   * @returns {string} Why nothing changed, or `''` when it was applied.
   */
  function simplifySelected(toleranceMm) {
    const profile = selectedPolyline()
    if (!profile) return 'Pick an outline with points first'
    if (!Number.isFinite(toleranceMm) || toleranceMm < 0) return 'The tolerance must be 0 mm or more'
    const pointsMm = simplifyPoints(profile.pointsMm, toleranceMm, profile.closed)
    if (!pointsMm) return `That would leave fewer than ${profile.closed ? 3 : 2} points — try a smaller tolerance`
    replaceInActiveSlice({ ...profile, pointsMm })
    selectedVertex.value = -1
    hoverVertex.value = -1
    return ''
  }

  // --- the continuous Line chain (TODO/sketch-006) ---------------------------

  /** Forget the live chain without touching the draft. */
  function endChain() {
    chainId.value = ''
    chainStartMm.value = null
  }

  /** The live chain's polyline, or `null` (it may have been deleted or its slice left). */
  function liveChain() {
    if (!chainId.value) return null
    const profile = slice.value?.profiles.find((candidate) => candidate.id === chainId.value)
    return profile && profile.kind === 'polyline' && !profile.closed ? profile : null
  }

  /**
   * **The** vertex-fix step of the Line tool: every click, tap and drag-release funnels the
   * point it fixes through here — one function, so `TODO/sketch-007`'s snapping wraps it by
   * adjusting `pointMm` first and nothing else changes.
   *
   * - No chain yet: the point becomes its first vertex (`'started'`).
   * - Only a start point: a segment to it makes the outline (`'added'`).
   * - A live chain: the point is appended, closes the outline on the first vertex with 3 or
   *   more vertices (`'closed'`, which ends the chain), or is ignored when degenerate.
   *
   * A finished chain is never selected (ui-020 finding #3).
   *
   * @param {readonly number[]} pointMm Sketch-local millimetres.
   * @param {{ closeToleranceMm: number, minLengthMm: number }} options
   * @returns {'started' | 'added' | 'closed' | 'ignored'}
   */
  function fixChainVertex(pointMm, options) {
    if (!Number.isFinite(pointMm[0]) || !Number.isFinite(pointMm[1])) return 'ignored'
    finishedChain = { id: '', at: 0 }
    const chain = liveChain()
    if (chain) {
      const { profile, outcome } = appendVertex(chain, pointMm, options)
      if (outcome === 'ignored') return 'ignored'
      replaceInActiveSlice(profile)
      if (outcome === 'closed') endChain()
      return outcome
    }
    if (chainId.value) chainId.value = ''
    const start = chainStartMm.value
    if (!start) {
      chainStartMm.value = [pointMm[0], pointMm[1]]
      return 'started'
    }
    if (Math.hypot(pointMm[0] - start[0], pointMm[1] - start[1]) <= options.minLengthMm) return 'ignored'
    const id = nextProfileId()
    addToActiveSlice({ id, kind: 'polyline', role: 'solid', closed: false, pointsMm: [start, [pointMm[0], pointMm[1]]] })
    chainStartMm.value = null
    chainId.value = id
    return 'added'
  }

  /**
   * End the chain, leaving it in the draft as an open outline (a lone start point is simply
   * dropped). **Finish**, Esc, Enter, a double-tap and switching tool all land here.
   *
   * @param {number} [now] Clock for the Esc-twice window; a spec passes its own.
   */
  function finishChain(now = Date.now()) {
    if (chainId.value) finishedChain = { id: chainId.value, at: now }
    endChain()
  }

  /** Remove the last vertex and keep the chain live; the only segment discards the chain. */
  function undoPoint() {
    const chain = liveChain()
    if (!chain) {
      endChain()
      return
    }
    const shorter = popVertex(chain)
    if (shorter) replaceInActiveSlice(shorter)
    else {
      setDraft(removeProfile(draft.value, activeSlice.value, chain.id))
      endChain()
    }
  }

  /** Remove the whole unfinished chain from the draft (a lone start point just goes). */
  function cancelChain() {
    const id = chainId.value
    endChain()
    if (id) setDraft(removeProfile(draft.value, activeSlice.value, id))
  }

  /**
   * Esc: finish a live chain; pressed again within `windowMs` of that, cancel the chain it
   * just finished (the "Esc twice" of the Interaction model).
   *
   * @param {number} [now]
   * @param {number} [windowMs]
   * @returns {'finished' | 'cancelled' | 'none'}
   */
  function escapeChain(now = Date.now(), windowMs = 900) {
    if (chainLive.value) {
      finishChain(now)
      return 'finished'
    }
    if (finishedChain.id && now - finishedChain.at <= windowMs) {
      const id = finishedChain.id
      finishedChain = { id: '', at: 0 }
      if (slice.value?.profiles.some((profile) => profile.id === id)) {
        setDraft(removeProfile(draft.value, activeSlice.value, id))
        return 'cancelled'
      }
    }
    return 'none'
  }

  /** @param {SketchTool} next */
  function setTool(next) {
    // Leaving Line ends its chain: an open one stays in the draft, a lone start point goes.
    endChain()
    // Picking a tool means drawing, not measuring: an armed Set scale stands down.
    cancelScale()
    tool.value = next
    // Point dots are a Select-tool affordance (`TODO/sketch-002`): a drawing tool's press always
    // draws, so a point picked under Select would otherwise be invisible and still be what
    // Delete removes.
    if (next !== 'select') {
      selectedVertex.value = -1
      hoverVertex.value = -1
    }
  }

  function addSliceAbove() {
    cancelScale()
    sliceCounter += 1
    setDraft(addSlice(draft.value, `s${sliceCounter}`))
    activeSlice.value = draft.value.slices.length - 1
    selectedProfileId.value = ''
    selectedVertex.value = -1
    endChain()
  }

  function deleteActiveSlice() {
    if (draft.value.slices.length <= 1) return
    cancelScale()
    setDraft(removeSlice(draft.value, activeSlice.value))
    activeSlice.value = Math.max(0, activeSlice.value - 1)
    selectedProfileId.value = ''
    selectedVertex.value = -1
    endChain()
  }

  /** @param {number} index */
  function setActiveSlice(index) {
    if (index < 0 || index >= draft.value.slices.length) return
    if (index !== activeSlice.value) cancelScale()
    activeSlice.value = index
    selectedProfileId.value = ''
    selectedVertex.value = -1
    endChain()
  }

  /** @param {number} index @param {number} zMm */
  function setSliceOffset(index, zMm) {
    setDraft(setSliceZ(draft.value, index, zMm))
  }

  /** @param {import('../sketch/profile.js').ExtrusionMethod} method */
  function setMethod(method) {
    setDraft(withMethod(draft.value, method))
  }

  /** @param {string} key @param {number} value */
  function setExtrusionParam(key, value) {
    setDraft(withExtrusionParam(draft.value, key, value))
  }

  /** The toolbar's **Snap** toggle. */
  function toggleSnap() {
    snapEnabled.value = !snapEnabled.value
  }

  /** @param {SketchPanel} next */
  function togglePanel(next) {
    panel.value = panel.value === next ? '' : next
  }

  return {
    active,
    bodyId,
    originMm,
    frame,
    draft,
    activeSlice,
    selectedProfileId,
    hoverProfileId,
    selectedVertex,
    hoverVertex,
    tool,
    polygonSides,
    snapEnabled,
    panel,
    chainId,
    chainStartMm,
    chainLive,
    chainPointCount,
    previewStatus,
    previewError,
    commitError,
    slice,
    selectedProfile,
    selectedVertexMm,
    deleteTarget,
    deleteProblem,
    selectionStatus,
    doneProblem,
    methodProblems,
    changed,
    open,
    close,
    setDraft,
    nextProfileId,
    addToActiveSlice,
    replaceInActiveSlice,
    setSelectedRole,
    deleteSelected,
    selectProfile,
    selectVertex,
    moveVertex,
    insertVertexOn,
    deleteSelectedVertex,
    deleteSelection,
    convertSelectedToOutline,
    simplifySelected,
    fixChainVertex,
    finishChain,
    undoPoint,
    cancelChain,
    escapeChain,
    setTool,
    addSliceAbove,
    deleteActiveSlice,
    setActiveSlice,
    setSliceOffset,
    setMethod,
    setExtrusionParam,
    togglePanel,
    toggleSnap,
    // TODO/sketch-003
    assetsVersion,
    imageImporting,
    imageError,
    imageTool,
    scaleAPx,
    scaleBPx,
    scaleStep,
    sliceImages,
    activeImage,
    assetOf,
    addImageAsset,
    updateImage,
    removeImage,
    armScale,
    cancelScale,
    // TODO/sketch-004
    traceToleranceMm,
    traceThreshold,
    traceThresholdUsed,
    traceRunning,
    traceMessage,
    traceMessageKind,
    tracedThisArming,
    armTrace,
    traceAt,
    setTraceTolerance,
    setTraceThreshold,
    finishTrace,
    addScalePoint,
    setScaleLine,
    applyScale,
    assetsToCommit,
  }
})
