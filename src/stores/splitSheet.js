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
 * ## Joints that make parts, or need parts bought (`TODO/core-075`, stage 1)
 *
 * The **Joint** control is a grouped list written out by hand here ({@link JOINT_CHOICES}) —
 * never built by iterating the kernel's `PLACEMENT_KINDS` (`CLAUDE.md`'s creation-vs-operation
 * rule). **Dowels** and **Steel or filament dowels** are both the kernel's `dowel` joint, told
 * apart by {@link stock}. Before Apply the sheet lists the key parts a split will make
 * ({@link keyRows}: `Dowel × 2 — 9.6 × 3.5 × 2.8 mm — fits`) and what to buy
 * ({@link hardwareRows}, the **You'll also need** line). For the automatic joint those come
 * from the kernel's own search, off the main thread; for hand placement, from the markers.
 *
 * **Butterfly keys** (stage 2) are their own choice under *Separate keys to print*, with
 * **Keys** (Auto or a count), **Side** (Auto or the face's Top/Bottom/Front/… — named per axis,
 * {@link butterflySides}), **Depth** (Auto or mm) and **Cut right through**. A **Butterfly**
 * tap in Place connectors snaps to the nearest edge of the cut face's outline (the kernel's
 * `FacePreview.outline`), and the marker carries that edge's side.
 *
 * **Tenons** (stage 3) sit under *Separate keys to print* with **Tenon width** and **Tenon
 * thickness** (each Auto or mm); **Magnets** under *Hardware you buy* with **Magnet size** — Auto,
 * the common disc sizes, or Custom with its own diameter and thickness ({@link MAGNET_CHOICES}).
 * The magnet size also applies to every Magnet marker in Place connectors, as the dowel stock
 * does to dowel markers. Tenons are key rows in the pieces list; magnets are a **You'll also
 * need** line, two per pocket pair.
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
import { boundsOf, hasNamedParts, partMetaOf } from '../core/kernel/group.js'
import {
  BUTTERFLY_SIDES,
  butterflySideLabel,
  describeButterfly,
  snapToOutline,
} from '../core/kernel/recipes/joint.butterfly.js'
import { describeDowel } from '../core/kernel/recipes/joint.dowel.js'
import { MAGNET_SIZES, describeMagnet } from '../core/kernel/recipes/joint.magnet.js'
import { describeTenon } from '../core/kernel/recipes/joint.tenon.js'
import { defaultSize } from '../core/kernel/recipes/joint.placements.js'
import { packGeometry } from '../core/kernel/transport.js'
import { DEFAULT_JOINT_CLEARANCE_MM, JOINT_TYPES, MAX_JOINT_CLEARANCE_MM, splitWarnings } from '../core/kernel/split.js'
import { useDocumentStore } from './document.js'
import { useSelectionStore } from './selection.js'

/** @typedef {'x' | 'y' | 'z'} Axis */
/** @typedef {[[number, number, number], [number, number, number]]} BoundsMm */

/** @type {readonly Axis[]} */
export const SPLIT_AXES = Object.freeze(/** @type {Axis[]} */ (['x', 'y', 'z']))

/** What each joint type is called in the sheet. */
export const JOINT_LABELS = Object.freeze({
  pins: 'Pins and sockets',
  tongue: 'Tongue and groove',
  dowel: 'Dowels',
  butterfly: 'Butterfly keys',
  tenon: 'Tenons',
  magnets: 'Magnets',
  none: 'No joint',
})

/**
 * One entry of the Joint list: the `<option>` value, its visible text, and the one line under
 * the list saying what it is for.
 *
 * @typedef {{ value: 'pins' | 'tongue' | 'butterfly' | 'dowel' | 'tenon' | 'magnets' | 'dowel-stock' | 'none', label: string, use: string }} JointChoice
 */

/**
 * The Joint list, grouped and in order — written out by hand (`TODO/core-075`). Each group is
 * an `<optgroup>`; **No joint** stands alone after them.
 *
 * @type {readonly { heading: string, choices: readonly JointChoice[] }[]}
 */
export const JOINT_CHOICES = /** @type {readonly { heading: string, choices: readonly JointChoice[] }[]} */ (Object.freeze([
  Object.freeze({
    heading: 'Printed into the pieces',
    choices: Object.freeze([
      { value: 'pins', label: 'Pins and sockets', use: 'Pins on one piece fit sockets in the other; nothing extra to print or buy' },
      { value: 'tongue', label: 'Tongue and groove', use: 'A rib and a matching groove, for sections too thin for a pin' },
    ]),
  }),
  Object.freeze({
    heading: 'Separate keys to print',
    choices: Object.freeze([
      { value: 'butterfly', label: 'Butterfly keys', use: 'Locks the pieces together from outside; print the keys flat' },
      { value: 'dowel', label: 'Dowels', use: 'A socket in each piece and a dowel printed lying down, stronger than a pin; glue or press-fit' },
      { value: 'tenon', label: 'Tenons', use: 'A flat key in a slot in each piece; one stops sliding and twisting. Print it flat' },
    ]),
  }),
  Object.freeze({
    heading: 'Hardware you buy',
    choices: Object.freeze([
      { value: 'magnets', label: 'Magnets', use: 'Disc-magnet pockets in both faces, so the pieces pull apart and snap back; buy the magnets' },
      { value: 'dowel-stock', label: 'Steel or filament dowels', use: 'Sockets sized for bought steel pins or 1.75 mm filament; nothing extra to print' },
    ]),
  }),
]))

/** No joint: a plain cut, listed after the groups. */
export const NO_JOINT_CHOICE = Object.freeze(/** @type {JointChoice} */ ({ value: 'none', label: 'No joint', use: 'A plain cut; glue the faces or join them some other way' }))

/**
 * The Magnet size list (`TODO/core-075` stage 3): Auto (the largest common size that fits), the
 * common disc sizes, then Custom.
 *
 * @type {readonly { value: string, label: string }[]}
 */
export const MAGNET_CHOICES = Object.freeze([
  { value: 'auto', label: 'Auto' },
  ...MAGNET_SIZES.map((size) => ({ value: `${size.diameterMm}x${size.thicknessMm}`, label: `${size.diameterMm} × ${size.thicknessMm} mm` })),
  { value: 'custom', label: 'Custom' },
])

/** What a bought dowel can be, in the sheet's words. */
export const STOCK_LABELS = Object.freeze({ printed: 'Printed', steel: 'Steel pin', filament: '1.75 mm filament' })

/**
 * What the Place connectors kind picker offers (`TODO/ui-067`), as the kernel's placement
 * kinds. A tongue is not offered — the search can seed one, and it stays on the face as a
 * marker, but a hand placement is a post, a wedge, a screw boss, a dowel, a butterfly key, a
 * tenon or a magnet.
 */
export const CONNECTOR_KINDS = Object.freeze(
  /** @type {const} */ (['pins', 'wedge', 'screwBoss', 'dowel', 'butterfly', 'tenon', 'magnet'])
)

/** What each connector kind is called in the sheet. */
export const CONNECTOR_LABELS = Object.freeze({
  pins: 'Post',
  tongue: 'Tongue',
  wedge: 'Wedge',
  screwBoss: 'Screw boss',
  dowel: 'Dowel',
  butterfly: 'Butterfly',
  tenon: 'Tenon',
  magnet: 'Magnet',
})

/**
 * One connector marker on the cut face: a placement the record will carry, plus the id the
 * overlay keeps it by. `uMm`/`vMm` are document millimetres along the face's two axes.
 *
 * @typedef {object} Marker
 * @property {string} id
 * @property {'pins' | 'tongue' | 'wedge' | 'screwBoss' | 'dowel' | 'butterfly' | 'tenon' | 'magnet'} kind
 * @property {number} uMm
 * @property {number} vMm
 * @property {number} [sizeMm] Left out for the kind's default size.
 * @property {number} [lengthMm]
 * @property {'u-' | 'u+' | 'v-' | 'v+'} [side] A butterfly's surface: the outline edge it snapped to.
 * @property {number} [depthMm] A butterfly's depth, when the search gave one.
 * @property {boolean} [through]
 * @property {number} [thicknessMm] A tenon's or a magnet's, when the search gave one.
 */

/** The joints whose own search the sheet runs before Apply, and which carry `jointOptions`. */
const KEYED_JOINTS = Object.freeze(/** @type {string[]} */ (['dowel', 'butterfly', 'tenon', 'magnets']))

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
  const joint = ref(/** @type {'pins' | 'tongue' | 'dowel' | 'butterfly' | 'tenon' | 'magnets' | 'none'} */ ('pins'))
  /** What a dowel is made of (`TODO/core-075`): the automatic joint's and every dowel marker's. */
  const stock = ref(/** @type {'printed' | 'steel' | 'filament'} */ ('printed'))
  /** A dowel diameter the person typed, mm, or `null` for the search's own. */
  const dowelSizeMm = ref(/** @type {number | null} */ (null))
  /** How many butterfly keys (`TODO/core-075` stage 2), or `null` for Auto (one per ~50 mm). */
  const butterflyCount = ref(/** @type {number | null} */ (null))
  /** Which side of the cut face the keys sit on, or `null` for Auto (the longest straight edge). */
  const butterflySide = ref(/** @type {'u-' | 'u+' | 'v-' | 'v+' | null} */ (null))
  /** The keys' depth, mm, or `null` for Auto (half the wall, at least 3 mm). */
  const butterflyDepthMm = ref(/** @type {number | null} */ (null))
  /** Keys that run the full thickness of a thin wall. */
  const butterflyThrough = ref(false)
  /** A tenon width the person typed (`TODO/core-075` stage 3), mm, or `null` for Auto. */
  const tenonWidthMm = ref(/** @type {number | null} */ (null))
  /** A tenon thickness, mm, or `null` for Auto. */
  const tenonThicknessMm = ref(/** @type {number | null} */ (null))
  /** The Magnet size list's value: `auto`, a common size (`6x3`), or `custom`. */
  const magnetSize = ref('auto')
  /** A custom magnet's diameter, mm. */
  const magnetDiameterMm = ref(/** @type {number | null} */ (null))
  /** A custom magnet's thickness, mm. */
  const magnetThicknessMm = ref(/** @type {number | null} */ (null))

  /**
   * The magnet the sheet asks for, or `null` for Auto (and for a Custom size not yet typed in
   * full) — what the magnets joint's options and every Magnet marker carry.
   */
  const magnetChoice = computed(() => {
    if (magnetSize.value === 'custom') {
      const d = magnetDiameterMm.value
      const t = magnetThicknessMm.value
      return typeof d === 'number' && Number.isFinite(d) && typeof t === 'number' && Number.isFinite(t)
        ? { sizeMm: d, thicknessMm: t }
        : null
    }
    const preset = MAGNET_SIZES.find((size) => `${size.diameterMm}x${size.thicknessMm}` === magnetSize.value)
    return preset ? { sizeMm: preset.diameterMm, thicknessMm: preset.thicknessMm } : null
  })

  /**
   * The Joint list's value: the kernel's joint, with `dowel` split by {@link stock} into the
   * list's two entries.
   */
  const jointChoice = computed({
    get: () => (joint.value === 'dowel' ? (stock.value === 'printed' ? 'dowel' : 'dowel-stock') : joint.value),
    set: (value) => {
      if (value === 'dowel') {
        joint.value = 'dowel'
        stock.value = 'printed'
      } else if (value === 'dowel-stock') {
        joint.value = 'dowel'
        if (stock.value === 'printed') stock.value = 'steel'
      } else if (
        value === 'pins' ||
        value === 'tongue' ||
        value === 'butterfly' ||
        value === 'tenon' ||
        value === 'magnets' ||
        value === 'none'
      ) {
        joint.value = value
      }
    },
  })

  /** The one line under the Joint list. */
  const jointUse = computed(() => {
    const value = jointChoice.value
    const found = [...JOINT_CHOICES.flatMap((group) => group.choices), NO_JOINT_CHOICE].find((choice) => choice.value === value)
    return found?.use ?? ''
  })
  const clearanceMm = ref(/** @type {number | null} */ (DEFAULT_JOINT_CLEARANCE_MM))
  /** The kernel's refusal from the last Apply, and the inputs it refused. */
  const failure = ref({ message: '', key: '' })

  const axisIndex = computed(() => SPLIT_AXES.indexOf(axis.value))

  // --- Place connectors (`TODO/ui-067`) -------------------------------------------------
  /** Whether the person is placing connectors by hand instead of the automatic search. */
  const manual = ref(false)
  /** The kind a tap on the face drops. */
  const connectorKind = ref(/** @type {'pins' | 'wedge' | 'screwBoss' | 'dowel' | 'butterfly' | 'tenon' | 'magnet'} */ ('pins'))
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
      .filter((name) => geometry.parts[name].polygons.length > 0 && partMetaOf(geometry, name)?.role !== 'key')
      .map((name) => ({ name, bounds: /** @type {BoundsMm} */ (boundsOf(geometry.parts[name])) }))
      .filter(({ bounds }) => bounds[0][index] < cutMm.value - 1e-6 && bounds[1][index] > cutMm.value + 1e-6)
  })

  /** A split key part the plane would cut through, or `null` — the kernel refuses that by name. */
  const crossedKey = computed(() => {
    const geometry = liveBody()?.geometry
    if (!geometry || !hasNamedParts(geometry) || !Number.isFinite(cutMm.value)) return null
    const index = axisIndex.value
    const hit = geometry.names.find((name) => {
      if (partMetaOf(geometry, name)?.role !== 'key') return false
      const [min, max] = boundsOf(geometry.parts[name])
      return min[index] < cutMm.value - 1e-6 && max[index] > cutMm.value + 1e-6
    })
    return hit ?? null
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
    const key = crossedKey.value
    if (key !== null) return `The cut plane crosses ${key} — move it clear of the keys`
    if (crossed && crossed.length === 0) return 'The cut plane passes between parts and crosses none of them'
    if (crossed && crossed.length > 1) {
      return `The cut plane crosses ${crossed.length} parts (${crossed.map((part) => part.name).join(', ')}) — split one part at a time`
    }
    if (manual.value) return manualProblem()
    if (autoKeyError.value !== '') return autoKeyError.value
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
  const inputKey = computed(() => `${bodyId.value}|${axis.value}|${offsetMm.value}|${joint.value}|${stock.value}|${dowelSizeMm.value}|${butterflyKey.value}|${sizedKey.value}|${clearanceMm.value}|${manual.value}|${JSON.stringify(placementsOf(markers.value))}`)

  /** The butterfly fields as one string. */
  const butterflyKey = computed(() => `${butterflyCount.value}|${butterflySide.value}|${butterflyDepthMm.value}|${butterflyThrough.value}`)

  /** The tenon and magnet fields as one string (stage 3). */
  const sizedKey = computed(() => `${tenonWidthMm.value}|${tenonThicknessMm.value}|${JSON.stringify(magnetChoice.value)}`)

  /** The Side list for the current axis: an X cut's `v+` is the Top. */
  const butterflySides = computed(() => BUTTERFLY_SIDES.map((value) => ({ value, label: butterflySideLabel(axisIndex.value, value) })))

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
   * The placements a marker list stands for, as the record carries them. A dowel marker takes
   * the sheet's {@link stock}; filament has one size, so it carries none. A magnet marker takes
   * the sheet's magnet size when one is chosen (stage 3), and keeps its own on Auto.
   */
  const placementsOf = (/** @type {Marker[]} */ list) =>
    list.map(({ id: _id, ...placement }) => {
      if (placement.kind === 'magnet') {
        const chosen = magnetChoice.value
        return chosen === null ? { ...placement } : { ...placement, ...chosen }
      }
      if (placement.kind !== 'dowel' || stock.value === 'printed') return { ...placement }
      const { sizeMm: _size, ...rest } = placement
      return { ...(stock.value === 'filament' ? rest : placement), stock: stock.value }
    })

  /** The dowel, butterfly, tenon or magnets joint's options as a record carries them — `undefined` when there are none. */
  const jointOptions = computed(() => {
    if (joint.value === 'tenon') {
      /** @type {{ sizeMm?: number, thicknessMm?: number }} */
      const options = {}
      const width = tenonWidthMm.value
      const thickness = tenonThicknessMm.value
      if (typeof width === 'number' && Number.isFinite(width)) options.sizeMm = width
      if (typeof thickness === 'number' && Number.isFinite(thickness)) options.thicknessMm = thickness
      return Object.keys(options).length > 0 ? options : undefined
    }
    if (joint.value === 'magnets') return magnetChoice.value === null ? undefined : { ...magnetChoice.value }
    if (joint.value === 'butterfly') {
      /** @type {{ count?: number, side?: string, depthMm?: number, through?: boolean }} */
      const options = {}
      const count = butterflyCount.value
      if (typeof count === 'number' && Number.isInteger(count) && count >= 1) options.count = count
      if (butterflySide.value !== null) options.side = butterflySide.value
      const depth = butterflyDepthMm.value
      if (butterflyThrough.value) options.through = true
      else if (typeof depth === 'number' && Number.isFinite(depth)) options.depthMm = depth
      return Object.keys(options).length > 0 ? options : undefined
    }
    /** @type {{ stock?: string, sizeMm?: number }} */
    const options = {}
    if (stock.value !== 'printed') options.stock = stock.value
    const size = dowelSizeMm.value
    if (stock.value !== 'filament' && typeof size === 'number' && Number.isFinite(size)) options.sizeMm = size
    return Object.keys(options).length > 0 ? options : undefined
  })

  // --- Keys and hardware before Apply (`TODO/core-075`) ------------------------------------
  const planChannel = createEvaluationChannel('split-plan')
  /**
   * The automatic dowel or butterfly search's result, for the inputs `key` names, with the cut
   * face's extent (`spans`, mm along u and v) — a through butterfly's depth is the wall's.
   */
  const autoKeys = shallowRef(
    /** @type {{ key: string, entries: import('../core/kernel/split.js').PlacementParams[], error: string, spans: [number, number] }} */ ({
      key: '',
      entries: [],
      error: '',
      spans: [0, 0],
    })
  )
  /** The inputs the automatic key search depends on. */
  const autoKey = computed(() =>
    isOpen.value && !manual.value && KEYED_JOINTS.includes(joint.value)
      ? `${joint.value}|${bodyId.value}|${axis.value}|${offsetMm.value}|${clearanceMm.value}|${stock.value}|${dowelSizeMm.value}|${butterflyKey.value}|${sizedKey.value}|${documentStore.version}`
      : ''
  )
  watch(autoKey, async (key) => {
    if (key === '' || !Number.isFinite(cutMm.value)) return
    const answer = await ask(planChannel, [], /** @type {'dowel' | 'butterfly' | 'tenon' | 'magnets'} */ (joint.value))
    if (answer === null || key !== autoKey.value) return
    autoKeys.value = answer.face
      ? {
          key,
          entries: answer.face.auto,
          error: answer.face.autoError,
          spans: [answer.face.uRange[1] - answer.face.uRange[0], answer.face.vRange[1] - answer.face.vRange[0]],
        }
      : { key, entries: [], error: answer.error ?? '', spans: [0, 0] }
  })

  /** The dowels a split would make or need: the markers' when placing by hand, else the search's. */
  const plannedDowels = computed(() => {
    const clearance = clearanceMm.value ?? DEFAULT_JOINT_CLEARANCE_MM
    if (manual.value) {
      const preview = face.value
      const minor = preview ? Math.min(preview.uRange[1] - preview.uRange[0], preview.vRange[1] - preview.vRange[0]) : 0
      return markers.value
        .filter((marker) => marker.kind === 'dowel')
        .map((marker) => ({ sizeMm: marker.sizeMm ?? defaultSize('dowel', minor), stock: stock.value, clearance }))
    }
    if (joint.value !== 'dowel' || autoKeys.value.key !== autoKey.value) return []
    return autoKeys.value.entries.map((entry) => ({ sizeMm: entry.sizeMm ?? 2, stock: stock.value, clearance }))
  })

  /**
   * The butterfly keys a split would make: as the kernel resolved the markers when placing by
   * hand, else the search's. A through key is as deep as the face is across on its side.
   */
  const plannedButterflies = computed(() => {
    /** @param {import('../core/kernel/split.js').PlacementParams} entry @param {[number, number]} spans */
    const sized = (entry, spans) => ({
      sizeMm: entry.sizeMm ?? 3,
      depthMm: entry.depthMm ?? (entry.side?.[0] === 'u' ? spans[0] : spans[1]),
    })
    if (manual.value) {
      const preview = face.value
      if (!preview || preview.resolved === null || validatedKey.value !== placementKey.value) return []
      const spans = /** @type {[number, number]} */ ([preview.uRange[1] - preview.uRange[0], preview.vRange[1] - preview.vRange[0]])
      return preview.resolved.filter((entry) => entry.kind === 'butterfly').map((entry) => sized(entry, spans))
    }
    if (joint.value !== 'butterfly' || autoKeys.value.key !== autoKey.value) return []
    return autoKeys.value.entries.map((entry) => sized(entry, autoKeys.value.spans))
  })

  /**
   * Resolved entries of one kind: as the kernel resolved the markers when placing by hand, else
   * the automatic search's when it is the joint asked for (stage 3: tenons, magnets).
   *
   * @param {'tenon' | 'magnet'} kind
   * @param {'tenon' | 'magnets'} jointName
   * @returns {import('../core/kernel/split.js').PlacementParams[]}
   */
  function resolvedOf(kind, jointName) {
    if (manual.value) {
      const preview = face.value
      if (!preview || preview.resolved === null || validatedKey.value !== placementKey.value) return []
      return preview.resolved.filter((entry) => entry.kind === kind)
    }
    if (joint.value !== jointName || autoKeys.value.key !== autoKey.value) return []
    return autoKeys.value.entries
  }

  /** The tenons a split would make (stage 3). */
  const plannedTenons = computed(() =>
    resolvedOf('tenon', 'tenon').map((entry) => ({ sizeMm: entry.sizeMm ?? 6, thicknessMm: entry.thicknessMm ?? 3 }))
  )

  /** The magnet pocket pairs a split would cut (stage 3): two magnets to buy for each. */
  const plannedMagnets = computed(() =>
    resolvedOf('magnet', 'magnets').map((entry) => ({ sizeMm: entry.sizeMm ?? 6, thicknessMm: entry.thicknessMm ?? 3 }))
  )

  /**
   * The key parts a split would make, one row per size: `Dowel × 2`, its size lying on the bed,
   * and its fit — what the pieces list shows under the pieces.
   */
  const keyRows = computed(() => {
    /** @type {Map<string, { name: string, title: string, count: number, sizeMm: [number, number, number] }>} */
    const rows = new Map()
    for (const dowel of plannedDowels.value) {
      if (dowel.stock !== 'printed') continue
      const words = describeDowel(dowel.sizeMm, dowel.clearance, 'printed')
      const row = rows.get(words.keyLabel)
      if (row) row.count += 1
      else rows.set(words.keyLabel, { name: 'Dowel', title: words.keyLabel, count: 1, sizeMm: words.keySizeMm })
    }
    for (const key of plannedButterflies.value) {
      const words = describeButterfly(key.sizeMm, key.depthMm)
      const row = rows.get(words.keyLabel)
      if (row) row.count += 1
      else rows.set(words.keyLabel, { name: 'Butterfly key', title: words.keyLabel, count: 1, sizeMm: words.keySizeMm })
    }
    const clearance = clearanceMm.value ?? DEFAULT_JOINT_CLEARANCE_MM
    for (const tenon of plannedTenons.value) {
      const words = describeTenon(tenon.sizeMm, tenon.thicknessMm, clearance)
      const row = rows.get(words.keyLabel)
      if (row) row.count += 1
      else rows.set(words.keyLabel, { name: 'Tenon', title: words.keyLabel, count: 1, sizeMm: words.keySizeMm })
    }
    return [...rows.values()].map((row) => ({ ...row, ...fitVerdict(row.sizeMm, documentStore.buildVolume) }))
  })

  /** What a split needs bought, one line each: `2 × steel dowel pin Ø4 × 10 mm`. */
  const hardwareRows = computed(() => {
    /** @type {Map<string, number>} */
    const lines = new Map()
    for (const dowel of plannedDowels.value) {
      if (dowel.stock === 'printed') continue
      const { hardwareLabel } = describeDowel(dowel.sizeMm, dowel.clearance, dowel.stock)
      lines.set(hardwareLabel, (lines.get(hardwareLabel) ?? 0) + 1)
    }
    // A magnet in each face: two to buy per pocket pair.
    for (const magnet of plannedMagnets.value) {
      const { hardwareLabel } = describeMagnet(magnet.sizeMm, magnet.thicknessMm)
      lines.set(hardwareLabel, (lines.get(hardwareLabel) ?? 0) + 2)
    }
    return [...lines.entries()].map(([label, count]) => `${count} × ${label}`)
  })

  /** Why the automatic dowel, butterfly, tenon or magnet search found nothing, while it is the joint asked for. */
  const autoKeyError = computed(() => (autoKeys.value.key !== '' && autoKeys.value.key === autoKey.value ? autoKeys.value.error : ''))

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
   * @param {'pins' | 'tongue' | 'dowel' | 'butterfly' | 'tenon' | 'magnets' | null} seed
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
        ...(seed !== null && KEYED_JOINTS.includes(seed) && seed === joint.value && jointOptions.value !== undefined
          ? { seedOptions: { ...jointOptions.value } }
          : {}),
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
    const seed = /** @type {'pins' | 'tongue' | 'dowel' | 'butterfly' | 'tenon' | 'magnets'} */ (
      joint.value === 'tongue' || KEYED_JOINTS.includes(joint.value) ? joint.value : 'pins'
    )
    const answer = await ask(faceChannel, [], seed)
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
      ...(entry.side === undefined ? {} : { side: entry.side }),
      ...(entry.depthMm === undefined ? {} : { depthMm: entry.depthMm }),
      ...(entry.through === true ? { through: true } : {}),
      ...(entry.thicknessMm === undefined ? {} : { thicknessMm: entry.thicknessMm }),
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
    if (joint.value === 'dowel') connectorKind.value = 'dowel'
    if (joint.value === 'butterfly') connectorKind.value = 'butterfly'
    if (joint.value === 'tenon') connectorKind.value = 'tenon'
    if (joint.value === 'magnets') connectorKind.value = 'magnet'
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
   * Where a marker of `kind` lands for a tap at `(uMm, vMm)`: there, or — for a butterfly — on
   * the nearest edge of the cut face's outline, with that edge's side (`TODO/core-075`).
   *
   * @param {Marker['kind']} kind
   * @param {number} uMm
   * @param {number} vMm
   * @returns {{ uMm: number, vMm: number, side?: 'u-' | 'u+' | 'v-' | 'v+' }}
   */
  function snapped(kind, uMm, vMm) {
    if (kind !== 'butterfly') return { uMm, vMm }
    const onEdge = snapToOutline(face.value?.outline ?? [], uMm, vMm)
    return onEdge ?? { uMm, vMm }
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
    const marker = /** @type {Marker} */ ({ id: `m${(markerCount += 1)}`, kind: connectorKind.value, ...snapped(connectorKind.value, uMm, vMm) })
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
    const kind = markers.value.find((marker) => marker.id === id)?.kind ?? 'pins'
    const at = snapped(kind, uMm, vMm)
    uMm = at.uMm
    vMm = at.vMm
    drag.value = { id, uMm, vMm, ok: null, reason: '' }
    const next = markers.value.map((marker) => (marker.id === id ? { ...marker, ...at } : marker))
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
      (current) => current.map((marker) => (marker.id === id ? { ...marker, ...snapped(marker.kind, uMm, vMm) } : marker)),
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
   * @param {'pins' | 'wedge' | 'screwBoss' | 'dowel' | 'butterfly' | 'tenon' | 'magnet'} kind
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
      (list) => list.map((marker) => (marker.id === id ? { id: marker.id, kind, ...snapped(kind, marker.uMm, marker.vMm) } : marker)),
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
    stock.value = 'printed'
    dowelSizeMm.value = null
    butterflyCount.value = null
    butterflySide.value = null
    butterflyDepthMm.value = null
    butterflyThrough.value = false
    tenonWidthMm.value = null
    tenonThicknessMm.value = null
    magnetSize.value = 'auto'
    magnetDiameterMm.value = null
    magnetThicknessMm.value = null
    clearanceMm.value = DEFAULT_JOINT_CLEARANCE_MM
    autoKeys.value = { key: '', entries: [], error: '', spans: [0, 0] }
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
            ...(KEYED_JOINTS.includes(joint.value) && jointOptions.value !== undefined
              ? { jointOptions: { ...jointOptions.value } }
              : {}),
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
    jointChoice,
    jointUse,
    stock,
    dowelSizeMm,
    butterflyCount,
    butterflySide,
    butterflyDepthMm,
    butterflyThrough,
    butterflySides,
    tenonWidthMm,
    tenonThicknessMm,
    magnetSize,
    magnetDiameterMm,
    magnetThicknessMm,
    keyRows,
    hardwareRows,
    autoKeyError,
    autoDowelError: autoKeyError,
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
