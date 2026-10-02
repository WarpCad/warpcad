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
 * Selection *inside* the editor (which outline is picked) is held here too, deliberately
 * not in `src/stores/selection.js`: that store selects bodies, and ui-020's second
 * `sketchId` there had to be kept mutually exclusive with body selection by every path
 * that touched either. An editor-local selection needs no such rule.
 *
 * @module stores/sketchEditor
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import {
  EXTRUSION_METHODS,
  addProfile,
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
/** @typedef {'line' | 'rect' | 'circle' | 'polygon'} SketchTool */
/** @typedef {'' | 'slices' | 'extrude'} SketchPanel */

/** The tools, in toolbar order. Hardcoded on purpose — see `SketchToolbar.vue`. */
export const SKETCH_TOOLS = /** @type {readonly SketchTool[]} */ (Object.freeze(['line', 'rect', 'circle', 'polygon']))

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
  const tool = ref(/** @type {SketchTool} */ ('circle'))
  const polygonSides = ref(6)
  /** Which of the Slices / Extrude panels is open — one at a time. */
  const panel = ref(/** @type {SketchPanel} */ (''))
  /** The open Line chain being extended, or `''`. */
  const chainId = ref('')
  /** The worker preview's state: what the Done gate reads besides the static checks. */
  const previewStatus = ref(/** @type {'idle' | 'building' | 'ok' | 'error'} */ ('idle'))
  const previewError = ref('')
  /** Why the last Done was refused by the document, shown until the next edit. */
  const commitError = ref('')
  let profileCounter = 0
  let sliceCounter = 0

  const slice = computed(() => draft.value.slices[activeSlice.value] ?? draft.value.slices[0])
  const selectedProfile = computed(
    () => slice.value?.profiles.find((profile) => profile.id === selectedProfileId.value) ?? null,
  )

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
    panel.value = ''
    chainId.value = ''
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
    panel.value = ''
    chainId.value = ''
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
    if (chainId.value === selectedProfileId.value) chainId.value = ''
    setDraft(removeProfile(draft.value, activeSlice.value, selectedProfileId.value))
    selectedProfileId.value = ''
  }

  /** @param {string} id */
  function selectProfile(id) {
    selectedProfileId.value = id
  }

  /** @param {SketchTool} next */
  function setTool(next) {
    tool.value = next
    chainId.value = ''
  }

  function addSliceAbove() {
    sliceCounter += 1
    setDraft(addSlice(draft.value, `s${sliceCounter}`))
    activeSlice.value = draft.value.slices.length - 1
    selectedProfileId.value = ''
    chainId.value = ''
  }

  function deleteActiveSlice() {
    if (draft.value.slices.length <= 1) return
    setDraft(removeSlice(draft.value, activeSlice.value))
    activeSlice.value = Math.max(0, activeSlice.value - 1)
    selectedProfileId.value = ''
    chainId.value = ''
  }

  /** @param {number} index */
  function setActiveSlice(index) {
    if (index < 0 || index >= draft.value.slices.length) return
    activeSlice.value = index
    selectedProfileId.value = ''
    chainId.value = ''
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
    tool,
    polygonSides,
    panel,
    chainId,
    previewStatus,
    previewError,
    commitError,
    slice,
    selectedProfile,
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
