// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The Split sheet's state and rules (`TODO/io-007`) — **UI state only**. The cut itself is the
 * kernel's (`src/core/kernel/split.js`, `modify.splitWithJoint`); this store decides what the
 * sheet opens with, what it says before Apply, and the one record Apply appends through the
 * document store (the command layer — `CLAUDE.md`: never mutate the document from a component).
 *
 * ## Interaction model (from the TODO)
 *
 * - **Precondition**: exactly one body selected (a group counts as one) — the toolbar's
 *   exactly-1 gate; {@link open} refuses otherwise as the belt to that gate's braces.
 * - **Trigger**: **Split…** (`op-split`) opens the sheet on the selected body.
 * - **Fields**: axis, offset (a number *and* the draggable plane in the viewport — both write
 *   {@link offsetMm}), joint type, clearance.
 * - **Feedback before Apply**: the cut plane moves as the offset changes ({@link cutMm},
 *   {@link previewBounds}); each piece's fit against the project's build volume
 *   ({@link pieceFits}); a problem that would make Apply fail ({@link problem}); warnings that
 *   would not ({@link warnings}).
 * - **Apply**: one unnamed `supersedes` record — Bisect's shape — whose params name the parts
 *   after the body: `Wing A` / `Wing B`. A second split of a split body keeps the crossed
 *   part's name and gives the new piece the next free letter (`Wing C`). A kernel refusal
 *   stays in the sheet, by name; nothing is written.
 *
 * Offsets are millimetres **from the body's minimum face** along the axis — Bisect's rule, so
 * the two sheets read the same.
 *
 * @module stores/splitSheet
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { fitVerdict } from '../core/buildVolume.js'
import { boundsOf, hasNamedParts } from '../core/kernel/group.js'
import { DEFAULT_JOINT_CLEARANCE_MM, JOINT_TYPES, MAX_JOINT_CLEARANCE_MM, splitWarnings } from '../core/kernel/split.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/** @typedef {'x' | 'y' | 'z'} Axis */
/** @typedef {[[number, number, number], [number, number, number]]} BoundsMm */

/** @type {readonly Axis[]} */
export const SPLIT_AXES = Object.freeze(/** @type {Axis[]} */ (['x', 'y', 'z']))

/** What each joint type is called in the sheet. */
export const JOINT_LABELS = Object.freeze({ pins: 'Pins and sockets', tongue: 'Tongue and groove', none: 'No joint' })

/** A dragged plane snaps to this step, mm, so a drag lands on a number a person can read. */
export const DRAG_STEP_MM = 0.5

/** @param {number} mm */
const fmt = (mm) => String(Number(mm.toFixed(3)))

export const useSplitSheetStore = defineStore('splitSheet', () => {
  const documentStore = useDocumentStore()
  const selection = useSelectionStore()

  const isOpen = ref(false)
  /** The body being split — its lineage root, which is what the selection holds. */
  const bodyId = ref(/** @type {string | null} */ (null))
  const axis = ref(/** @type {Axis} */ ('x'))
  const offsetMm = ref(/** @type {number | null} */ (0))
  const joint = ref(/** @type {'pins' | 'tongue' | 'none'} */ ('pins'))
  const clearanceMm = ref(/** @type {number | null} */ (DEFAULT_JOINT_CLEARANCE_MM))
  /** The kernel's refusal from the last Apply, and the inputs it refused. */
  const failure = ref({ message: '', key: '' })

  const axisIndex = computed(() => SPLIT_AXES.indexOf(axis.value))

  /** The evaluated body (geometry included) — read live, never cached into reactive state. */
  function liveBody() {
    if (bodyId.value === null) return undefined
    void documentStore.version
    return documentStore.raw.bodies().find((candidate) => candidate.id === bodyId.value)
  }

  const summary = computed(() => documentStore.bodies.find((candidate) => candidate.id === bodyId.value))

  /** The body's extent along the cut axis, world mm. */
  const extent = computed(() => {
    const bounds = summary.value?.bounds
    if (!bounds) return { minMm: 0, maxMm: 0 }
    return { minMm: bounds[0][axisIndex.value], maxMm: bounds[1][axisIndex.value] }
  })

  /** The plane's position along the axis, world mm (`NaN` while the offset is blank). */
  const cutMm = computed(() =>
    typeof offsetMm.value === 'number' && Number.isFinite(offsetMm.value) ? extent.value.minMm + offsetMm.value : Number.NaN
  )

  /**
   * For a body that is already a group of parts, the visible parts the plane crosses, with
   * their bounds — Split cuts only the crossed part (the kernel's multi-split rule).
   *
   * @type {import('vue').ComputedRef<{ name: string, bounds: BoundsMm }[] | null>}
   */
  const crossedParts = computed(() => {
    const geometry = liveBody()?.geometry
    if (!geometry || !hasNamedParts(geometry) || !Number.isFinite(cutMm.value)) return null
    const index = axisIndex.value
    return geometry.names
      .filter((name) => geometry.parts[name].polygons.length > 0)
      .map((name) => ({ name, bounds: /** @type {BoundsMm} */ (boundsOf(geometry.parts[name])) }))
      .filter(({ bounds }) => bounds[0][index] < cutMm.value - 1e-6 && bounds[1][index] > cutMm.value + 1e-6)
  })

  /** What would make Apply fail, said before Apply — the kernel's own words where it can. */
  const problem = computed(() => {
    if (!isOpen.value) return ''
    if (!summary.value) return 'The body is no longer in the scene — close this and select it again'
    const offset = offsetMm.value
    if (typeof offset !== 'number' || !Number.isFinite(offset)) return 'Type an offset in millimetres'
    const { minMm, maxMm } = extent.value
    if (!(offset > 1e-6 && minMm + offset < maxMm - 1e-6)) {
      return (
        `The cut plane at ${axis.value} = ${fmt(minMm + offset)} mm is outside the body (${axis.value} ${fmt(minMm)} to ${fmt(maxMm)} mm) — ` +
        `the offset is measured from the minimum face and must be between 0 and ${fmt(maxMm - minMm)}`
      )
    }
    const clearance = clearanceMm.value
    if (joint.value !== 'none' && (typeof clearance !== 'number' || !(clearance >= 0) || clearance > MAX_JOINT_CLEARANCE_MM)) {
      return `Clearance must be between 0 and ${MAX_JOINT_CLEARANCE_MM} mm`
    }
    const crossed = crossedParts.value
    if (crossed && crossed.length === 0) return 'The cut plane passes between parts and crosses none of them'
    if (crossed && crossed.length > 1) {
      return `The cut plane crosses ${crossed.length} parts (${crossed.map((part) => part.name).join(', ')}) — split one part at a time`
    }
    return ''
  })

  const warnings = computed(() =>
    splitWarnings({ joint: joint.value, clearanceMm: clearanceMm.value ?? undefined })
  )

  /** The inputs as one string, so a refusal is shown only for the inputs it refused. */
  const inputKey = computed(() => `${bodyId.value}|${axis.value}|${offsetMm.value}|${joint.value}|${clearanceMm.value}`)

  /** The kernel's refusal, while the inputs are still the ones it refused. */
  const error = computed(() => (failure.value.key === inputKey.value ? failure.value.message : ''))

  const canApply = computed(() => isOpen.value && problem.value === '')

  /** The two new parts' names — see the module doc. */
  const pieceNames = computed(() => {
    const body = summary.value
    if (!body) return /** @type {[string, string]} */ (['A', 'B'])
    const crossed = crossedParts.value
    if (!crossed || crossed.length !== 1) return /** @type {[string, string]} */ ([`${body.name} A`, `${body.name} B`])
    const taken = new Set([...body.partNames, ...body.hiddenPartNames])
    const lettered = body.partNames.every((name) => name.startsWith(`${body.name} `))
    if (lettered) {
      for (let code = 65; code < 91; code += 1) {
        const candidate = `${body.name} ${String.fromCharCode(code)}`
        if (!taken.has(candidate)) return /** @type {[string, string]} */ ([crossed[0].name, candidate])
      }
    }
    let candidate = `${crossed[0].name} B`
    for (let n = 2; taken.has(candidate); n += 1) candidate = `${crossed[0].name} B${n}`
    return /** @type {[string, string]} */ ([crossed[0].name, candidate])
  })

  /** World bounds of what is being cut — the whole body, or the crossed part. */
  const previewBounds = computed(() => {
    const crossed = crossedParts.value
    if (crossed && crossed.length === 1) return crossed[0].bounds
    return /** @type {BoundsMm | null} */ (summary.value?.bounds ?? null)
  })

  /**
   * Each piece's fit, estimated from the bounding box before Apply (the joint's few
   * millimetres are not in it — the Inspector's badge measures the real pieces after).
   */
  const pieceFits = computed(() => {
    const bounds = previewBounds.value
    if (!bounds || !Number.isFinite(cutMm.value)) return []
    const index = axisIndex.value
    const names = pieceNames.value
    const size = [0, 1, 2].map((i) => bounds[1][i] - bounds[0][i])
    const lowerLength = Math.max(0, cutMm.value - bounds[0][index])
    const upperLength = Math.max(0, bounds[1][index] - cutMm.value)
    return [lowerLength, upperLength].map((length, piece) => {
      const sizeMm = /** @type {[number, number, number]} */ (size.map((value, i) => (i === index ? length : value)))
      return { name: names[piece], sizeMm, ...fitVerdict(sizeMm, documentStore.buildVolume) }
    })
  })

  /**
   * Open on the one selected body, cutting across its longest axis at the middle.
   *
   * @returns {boolean} `false` unless exactly one body is selected.
   */
  function open() {
    const only = selection.count === 1 ? selection.onlyId : null
    const body = only === null ? undefined : documentStore.bodies.find((candidate) => candidate.id === only)
    if (!body) return false
    bodyId.value = body.id
    const size = [0, 1, 2].map((i) => body.bounds[1][i] - body.bounds[0][i])
    const longest = size.indexOf(Math.max(...size))
    axis.value = SPLIT_AXES[longest]
    offsetMm.value = size[longest] / 2
    joint.value = 'pins'
    clearanceMm.value = DEFAULT_JOINT_CLEARANCE_MM
    failure.value = { message: '', key: '' }
    isOpen.value = true
    return true
  }

  function close() {
    isOpen.value = false
    bodyId.value = null
    failure.value = { message: '', key: '' }
  }

  /**
   * Change the axis, moving the plane to the middle of the body along it.
   *
   * @param {string} next
   */
  function chooseAxis(next) {
    if (!SPLIT_AXES.includes(/** @type {Axis} */ (next))) return
    axis.value = /** @type {Axis} */ (next)
    const { minMm, maxMm } = extent.value
    offsetMm.value = (maxMm - minMm) / 2
  }

  /**
   * Set the offset from a drag of the plane's handle: `startMm` plus the dragged distance,
   * snapped to {@link DRAG_STEP_MM} and kept inside the body.
   *
   * @param {number} startMm The offset when the drag began.
   * @param {number} deltaMm
   */
  function dragOffset(startMm, deltaMm) {
    const { minMm, maxMm } = extent.value
    const size = maxMm - minMm
    const snapped = Math.round((startMm + deltaMm) / DRAG_STEP_MM) * DRAG_STEP_MM
    offsetMm.value = Math.min(size - DRAG_STEP_MM, Math.max(DRAG_STEP_MM, snapped))
  }

  /**
   * Append the split. A kernel refusal stays in the sheet and nothing is written.
   *
   * @returns {boolean} Whether the split was applied.
   */
  function apply() {
    if (!canApply.value || bodyId.value === null) return false
    const root = bodyId.value
    const target = documentStore.raw.currentIdOf(root) ?? root
    /** @type {import('../core/kernel/registry.js').OpRecord} */
    const record = {
      id: documentStore.raw.nextId('split'),
      op: 'modify.splitWithJoint',
      target,
      supersedes: target,
      params: {
        axis: axis.value,
        offsetMm: offsetMm.value,
        joint: joint.value,
        clearanceMm: joint.value === 'none' ? 0 : clearanceMm.value,
        names: [...pieceNames.value],
      },
    }
    try {
      documentStore.append(record, { origin: 'local' })
    } catch (failed) {
      failure.value = { message: failed instanceof Error ? failed.message : String(failed), key: inputKey.value }
      return false
    }
    // `supersedes` keeps the lineage root valid — the same body, still selected.
    selection.select(root)
    close()
    return true
  }

  return {
    isOpen,
    bodyId,
    axis,
    offsetMm,
    joint,
    clearanceMm,
    axisIndex,
    extent,
    cutMm,
    problem,
    warnings,
    error,
    canApply,
    pieceNames,
    previewBounds,
    pieceFits,
    jointTypes: JOINT_TYPES,
    open,
    close,
    chooseAxis,
    dragOffset,
    apply,
  }
})
