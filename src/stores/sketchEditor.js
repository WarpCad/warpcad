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
import { computed, ref, shallowRef } from 'vue'

import { formatMmValue } from '../core/units.js'

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
    profileCounter = Math.max(0, ...params.slices.flatMap((entry) => entry.profiles.map((profile) => Number(/^p(\d+)$/.exec(profile.id)?.[1] ?? 0))))
    sliceCounter = Math.max(0, ...params.slices.map((entry) => Number(/^s(\d+)$/.exec(entry.id)?.[1] ?? 0)))
    active.value = true
  }

  function close() {
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
    sliceCounter += 1
    setDraft(addSlice(draft.value, `s${sliceCounter}`))
    activeSlice.value = draft.value.slices.length - 1
    selectedProfileId.value = ''
    selectedVertex.value = -1
    endChain()
  }

  function deleteActiveSlice() {
    if (draft.value.slices.length <= 1) return
    setDraft(removeSlice(draft.value, activeSlice.value))
    activeSlice.value = Math.max(0, activeSlice.value - 1)
    selectedProfileId.value = ''
    selectedVertex.value = -1
    endChain()
  }

  /** @param {number} index */
  function setActiveSlice(index) {
    if (index < 0 || index >= draft.value.slices.length) return
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
  }
})
