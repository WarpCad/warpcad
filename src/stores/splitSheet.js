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
import { computed, ref, shallowRef, watch } from 'vue'

import { fitVerdict } from '../core/buildVolume.js'
import { createEvaluationChannel } from '../core/kernel/evaluationClient.js'
import { boundsOf, hasNamedParts } from '../core/kernel/group.js'
import { packGeometry } from '../core/kernel/transport.js'
import { DEFAULT_JOINT_CLEARANCE_MM, JOINT_TYPES, MAX_JOINT_CLEARANCE_MM, splitWarnings } from '../core/kernel/split.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/** @typedef {'x' | 'y' | 'z'} Axis */
/** @typedef {[[number, number, number], [number, number, number]]} BoundsMm */

/** @type {readonly Axis[]} */
export const SPLIT_AXES = Object.freeze(/** @type {Axis[]} */ (['x', 'y', 'z']))

/** What each joint type is called in the sheet. */
export const JOINT_LABELS = Object.freeze({ pins: 'Pins and sockets', tongue: 'Tongue and groove', none: 'No joint' })

/**
 * What the Place connectors kind picker offers (`TODO/ui-067`), as the kernel's placement
 * kinds. A tongue is not offered — the search can seed one, and it stays on the face as a
 * marker, but a hand placement is a post, a wedge or a screw boss.
 */
export const CONNECTOR_KINDS = Object.freeze(/** @type {const} */ (['pins', 'wedge', 'screwBoss']))

/** What each connector kind is called in the sheet. */
export const CONNECTOR_LABELS = Object.freeze({ pins: 'Post', tongue: 'Tongue', wedge: 'Wedge', screwBoss: 'Screw boss' })

/**
 * One connector marker on the cut face: a placement the record will carry, plus the id the
 * overlay keeps it by. `uMm`/`vMm` are document millimetres along the face's two axes.
 *
 * @typedef {object} Marker
 * @property {string} id
 * @property {'pins' | 'tongue' | 'wedge' | 'screwBoss'} kind
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} [sizeMm] Left out for the kind's default size.
 * @property {number} [lengthMm]
 */

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

  // --- Place connectors (`TODO/ui-067`) -------------------------------------------------
  /** Whether the person is placing connectors by hand instead of the automatic search. */
  const manual = ref(false)
  /** The kind a tap on the face drops. */
  const connectorKind = ref(/** @type {'pins' | 'wedge' | 'screwBoss'} */ ('pins'))
  const markers = ref(/** @type {Marker[]} */ ([]))
  const selectedMarkerId = ref(/** @type {string | null} */ (null))
  /** The cut face as the kernel last described it — a plain object, never walked reactively. */
  const face = shallowRef(/** @type {import('../core/kernel/split.js').FacePreview | null} */ (null))
  /** The kernel's reason it could not describe the face, for the inputs it was asked about. */
  const faceError = ref('')
  /** One verdict per marker, for the markers/inputs `validatedKey` names. */
  const verdicts = ref(/** @type {{ ok: boolean, reason: string }[]} */ ([]))
  /** A refusal of the placements as a whole (two overlapping), or `''`. */
  const overall = ref('')
  const validatedKey = ref('')
  /** Why the last drop, drag or kind change was turned back — one line, until the next one. */
  const notice = ref('')
  /** A marker being dragged: where it is now and whether the kernel says it fits there. */
  const drag = ref(/** @type {{ id: string, uMm: number, vMm: number, ok: boolean | null, reason: string } | null} */ (null))
  /** Whether the camera sees the cut face squarely enough to place on it (the overlay sets it). */
  const faceViewUsable = ref(true)
  let markerCount = 0

  const faceChannel = createEvaluationChannel('split-face')
  const probeChannel = createEvaluationChannel('split-face-probe')
  /** The packed body for the document version it was packed at. */
  let packed = /** @type {{ key: string, geometry: import('../core/kernel/transport.js').PackedGeometry } | null} */ (null)

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
    if (manual.value) return manualProblem()
    return ''
  })

  /**
   * What would make Apply fail in Place connectors mode: no connector yet, a kernel check still
   * running, or a marker the kernel says does not fit — in its own words.
   */
  function manualProblem() {
    if (faceError.value !== '') return faceError.value
    if (markers.value.length === 0) return 'Tap the cut face to place a connector — Apply needs at least one'
    if (validatedKey.value !== placementKey.value) return 'Checking the connectors…'
    const bad = verdicts.value.findIndex((verdict) => !verdict.ok)
    if (bad >= 0) return verdicts.value[bad].reason
    return overall.value
  }

  const warnings = computed(() =>
    splitWarnings({ joint: manual.value ? 'pins' : joint.value, clearanceMm: clearanceMm.value ?? undefined })
  )

  /** The inputs as one string, so a refusal is shown only for the inputs it refused. */
  const inputKey = computed(() => `${bodyId.value}|${axis.value}|${offsetMm.value}|${joint.value}|${clearanceMm.value}|${manual.value}|${JSON.stringify(placementsOf(markers.value))}`)

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


  /** The placements a marker list stands for, as the record carries them. */
  const placementsOf = (/** @type {Marker[]} */ list) =>
    list.map(({ id: _id, ...placement }) => ({ ...placement }))

  /** The inputs a face preview depends on, as one string. */
  const faceKey = computed(
    () => `${bodyId.value}|${axis.value}|${offsetMm.value}|${clearanceMm.value}|${documentStore.version}`
  )

  /** Everything a verdict depends on: the face's inputs and the markers. */
  const placementKey = computed(() => `${faceKey.value}|${JSON.stringify(placementsOf(markers.value))}`)

  /**
   * Ask the kernel (off the main thread) about the cut face.
   *
   * @param {import('../core/kernel/evaluationClient.js').EvaluationChannel} channel
   * @param {Marker[]} list
   * @param {'pins' | 'tongue' | null} seed
   * @returns {Promise<{ face?: import('../core/kernel/split.js').FacePreview, error?: string } | null>}
   *   `null` when a newer request on the channel overtook this one.
   */
  async function ask(channel, list, seed) {
    const body = liveBody()
    if (!body || !Number.isFinite(cutMm.value)) return { error: 'The body is no longer in the scene' }
    const key = `${bodyId.value}@${documentStore.version}`
    if (packed?.key !== key) packed = { key, geometry: packGeometry(/** @type {any} */ (body.geometry)) }
    const outcome = await channel.request({
      kind: 'splitFace',
      body: packed.geometry,
      params: {
        axis: axis.value,
        offsetMm: offsetMm.value,
        clearanceMm: clearanceMm.value ?? DEFAULT_JOINT_CLEARANCE_MM,
        placements: placementsOf(list),
        seed,
      },
    })
    if (outcome.superseded) return null
    const result = /** @type {import('../core/kernel/evaluationJob.js').SplitFaceResult} */ (outcome.result)
    return result.face ? { face: result.face } : { error: result.error ?? 'The cut face could not be read' }
  }

  /** @type {Promise<void>} */
  let refreshing = Promise.resolve()

  /** Re-read the face and the verdicts for the committed markers. */
  function refresh() {
    if (!isOpen.value || !manual.value) return refreshing
    const key = placementKey.value
    refreshing = ask(faceChannel, markers.value, null).then((answer) => {
      if (answer === null || key !== placementKey.value) return
      if (answer.face) {
        face.value = answer.face
        verdicts.value = answer.face.verdicts
        overall.value = answer.face.overall
        faceError.value = ''
      } else {
        verdicts.value = []
        overall.value = ''
        faceError.value = answer.error ?? ''
      }
      validatedKey.value = key
    })
    return refreshing
  }

  watch(placementKey, () => {
    if (isOpen.value && manual.value) void refresh()
  })

  /** Resolves once the verdicts on screen are the ones for the markers on screen. */
  async function settled() {
    for (let round = 0; round < 50 && !(validatedKey.value === placementKey.value || !manual.value); round += 1) {
      await refreshing
      if (validatedKey.value !== placementKey.value) await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  /**
   * Check a candidate marker list without committing it.
   *
   * @param {Marker[]} list
   * @returns {Promise<{ verdicts: { ok: boolean, reason: string }[], overall: string, error: string } | null>}
   */
  async function probe(list) {
    const answer = await ask(probeChannel, list, null)
    if (answer === null) return null
    if (!answer.face) return { verdicts: [], overall: '', error: answer.error ?? '' }
    return { verdicts: answer.face.verdicts, overall: answer.face.overall, error: '' }
  }

  /**
   * Take the automatic search's placements as the starting markers.
   *
   * @returns {Promise<void>}
   */
  async function seedFromSearch() {
    const answer = await ask(faceChannel, [], joint.value === 'tongue' ? 'tongue' : 'pins')
    if (answer === null) return
    if (!answer.face) {
      faceError.value = answer.error ?? ''
      return
    }
    face.value = answer.face
    faceError.value = ''
    markers.value = answer.face.auto.map((entry) => ({
      id: `m${(markerCount += 1)}`,
      kind: entry.kind,
      uMm: entry.uMm ?? 0,
      vMm: entry.vMm ?? 0,
      ...(entry.sizeMm === undefined ? {} : { sizeMm: entry.sizeMm }),
      ...(entry.lengthMm === undefined ? {} : { lengthMm: entry.lengthMm }),
    }))
    notice.value = answer.face.auto.length === 0 ? (answer.face.autoError || 'The search found no room — tap the cut face to place one') : ''
    selectedMarkerId.value = null
  }

  /**
   * Turn **Place connectors** on or off. On starts from what the automatic search found;
   * off returns to the joint dropdown's fully automatic behaviour.
   *
   * @param {boolean} on
   * @returns {Promise<void>}
   */
  async function setManual(on) {
    if (on === manual.value) return
    notice.value = ''
    selectedMarkerId.value = null
    drag.value = null
    if (!on) {
      manual.value = false
      markers.value = []
      face.value = null
      verdicts.value = []
      overall.value = ''
      faceError.value = ''
      validatedKey.value = ''
      return
    }
    manual.value = true
    markers.value = []
    await seedFromSearch()
    await settled()
  }

  /**
   * The next marker list, committed only when the kernel says every marker still fits;
   * otherwise the reason is the {@link notice} and nothing changes. Commits run one after
   * another, and `next` is applied to the list as it stands when its turn comes.
   *
   * @param {(current: Marker[]) => Marker[]} next
   * @param {string} [changed] The id of the marker the change is about.
   * @returns {Promise<boolean>}
   */
  function commit(next, changed) {
    const run = committing.then(() => commitNow(next, changed))
    committing = run.then(
      () => undefined,
      () => undefined
    )
    return run
  }

  /** The last commit still in flight — commits run one after another, each on the list before it. */
  let committing = /** @type {Promise<void>} */ (Promise.resolve())

  /**
   * @param {Marker[] | ((current: Marker[]) => Marker[])} next
   * @param {string} [changed]
   * @returns {Promise<boolean>}
   */
  async function commitNow(next, changed) {
    const list = typeof next === 'function' ? next(markers.value) : next
    const answer = await probe(list)
    if (answer === null) return false
    const at = changed === undefined ? -1 : list.findIndex((m) => m.id === changed)
    const refusal = answer.error || (at < 0 ? '' : (answer.verdicts[at]?.reason ?? '')) || answer.overall
    if (refusal !== '') {
      notice.value = refusal
      return false
    }
    notice.value = ''
    markers.value = list
    return true
  }

  /**
   * Drop a marker of the picked kind at a face position. Refused, with the kernel's reason,
   * where it does not fit.
   *
   * @param {number} uMm
   * @param {number} vMm
   * @returns {Promise<boolean>}
   */
  async function addMarker(uMm, vMm) {
    const marker = /** @type {Marker} */ ({ id: `m${(markerCount += 1)}`, kind: connectorKind.value, uMm, vMm })
    const added = await commit((current) => [...current, marker], marker.id)
    if (added) selectedMarkerId.value = marker.id
    return added
  }

  /**
   * Show a marker at a position mid-drag and ask the kernel whether it fits there. The
   * committed list does not change until {@link moveMarker}.
   *
   * @param {string} id
   * @param {number} uMm
   * @param {number} vMm
   */
  function dragMarker(id, uMm, vMm) {
    drag.value = { id, uMm, vMm, ok: null, reason: '' }
    const next = markers.value.map((marker) => (marker.id === id ? { ...marker, uMm, vMm } : marker))
    void probe(next).then((answer) => {
      if (answer === null || drag.value?.id !== id || drag.value.uMm !== uMm || drag.value.vMm !== vMm) return
      const verdict = answer.verdicts[next.findIndex((marker) => marker.id === id)]
      const reason = answer.error || verdict?.reason || answer.overall
      drag.value = { id, uMm, vMm, ok: reason === '', reason }
    })
  }

  /**
   * Finish a drag: the marker moves to `(uMm, vMm)` if it fits there, and goes back to where
   * it was, with the reason as the {@link notice}, if it does not.
   *
   * @param {string} id
   * @param {number} uMm
   * @param {number} vMm
   * @returns {Promise<boolean>}
   */
  async function moveMarker(id, uMm, vMm) {
    const moved = await commit(
      (current) => current.map((marker) => (marker.id === id ? { ...marker, uMm, vMm } : marker)),
      id
    )
    drag.value = null
    return moved
  }

  /** Abandon a drag (a cancelled pointer): the marker stays where it was. */
  function cancelDrag() {
    drag.value = null
  }

  /** @param {string | null} id */
  function selectMarker(id) {
    selectedMarkerId.value = id
  }

  /**
   * @param {string} id
   * @returns {boolean} Whether there was such a marker.
   */
  function removeMarker(id) {
    if (!markers.value.some((marker) => marker.id === id)) return false
    markers.value = markers.value.filter((marker) => marker.id !== id)
    if (selectedMarkerId.value === id) selectedMarkerId.value = null
    notice.value = ''
    return true
  }

  /**
   * Choose a kind from the picker: it is what a tap drops next, and, with a marker selected,
   * what that marker becomes (at its own position, refused where the new kind does not fit).
   *
   * @param {'pins' | 'wedge' | 'screwBoss'} kind
   * @returns {Promise<boolean>}
   */
  async function chooseKind(kind) {
    if (!CONNECTOR_KINDS.includes(kind)) return false
    connectorKind.value = kind
    const id = selectedMarkerId.value
    if (id === null) return true
    await committing
    const current = markers.value.find((marker) => marker.id === id)
    if (!current || current.kind === kind) return true
    // A new kind starts at its own default size.
    return commit(
      (list) => list.map((marker) => (marker.id === id ? { id: marker.id, kind, uMm: marker.uMm, vMm: marker.vMm } : marker)),
      id
    )
  }

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
    resetManual()
    failure.value = { message: '', key: '' }
    isOpen.value = true
    return true
  }

  /** Leave Place connectors mode and forget its markers. */
  function resetManual() {
    manual.value = false
    markers.value = []
    selectedMarkerId.value = null
    face.value = null
    verdicts.value = []
    overall.value = ''
    faceError.value = ''
    validatedKey.value = ''
    notice.value = ''
    drag.value = null
    connectorKind.value = 'pins'
    packed = null
  }

  function close() {
    resetManual()
    isOpen.value = false
    bodyId.value = null
    failure.value = { message: '', key: '' }
  }

  /**
   * Change the axis, moving the plane to the middle of the body along it. Markers belong to
   * one face, so Place connectors starts over from the search on the new one.
   *
   * @param {string} next
   */
  function chooseAxis(next) {
    if (!SPLIT_AXES.includes(/** @type {Axis} */ (next))) return
    axis.value = /** @type {Axis} */ (next)
    const { minMm, maxMm } = extent.value
    offsetMm.value = (maxMm - minMm) / 2
    if (manual.value) {
      markers.value = []
      void seedFromSearch()
    }
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
      params: manual.value
        ? {
            axis: axis.value,
            offsetMm: offsetMm.value,
            clearanceMm: clearanceMm.value,
            names: [...pieceNames.value],
            placements: placementsOf(markers.value),
          }
        : {
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
    manual,
    connectorKind,
    markers,
    selectedMarkerId,
    face,
    faceError,
    verdicts,
    notice,
    drag,
    faceViewUsable,
    setManual,
    chooseKind,
    addMarker,
    dragMarker,
    moveMarker,
    cancelDrag,
    selectMarker,
    removeMarker,
    settled,
    open,
    close,
    chooseAxis,
    dragOffset,
    apply,
  }
})
