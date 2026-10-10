// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The UI's handle on the document.
 *
 * Deliberately thin. CLAUDE.md is explicit that Pinia holds **UI state only** and
 * that document state "lives wherever the document/sync decision lands, never
 * mirrored into Pinia". So the real log lives in `src/core/document.js` as a plain,
 * non-reactive value, and this store holds only what a component needs to *react*
 * to: a version counter and a small plain-data summary of the placed bodies.
 *
 * What is emphatically **not** reactive here is geometry. `bodies()` returns
 * kernel solids with multi-thousand-element vertex arrays, and CLAUDE.md's
 * Performance section calls Vue deep-reactivity over those a performance bug — so
 * geometry is only ever read imperatively, through {@link useDocumentStore}'s
 * `raw` handle, by the renderer.
 */

import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'

import { createDocument } from '../core/document.js'
import { DEFAULT_RESOLUTION } from '../core/kernel/tessellation.js'
import { createEvaluationChannel, evaluationWorkerAvailable } from '../core/kernel/evaluationClient.js'
import { boundsOf, hasNamedParts, hiddenNamesOf, isGroup } from '../core/kernel/group.js'
import { cachedMeasurementOf, measureGeometry, rememberMeasurement } from '../core/kernel/measure.js'
import { packGeometry } from '../core/kernel/transport.js'
import { useSelectionStore } from './selection.js'

/** @typedef {import('../core/document.js').Body} Body */
/** @typedef {import('../core/kernel/registry.js').OpRecord} OpRecord */

/**
 * @typedef {object} BodySummary
 * @property {string} id
 * @property {string} name
 * @property {string} op
 * @property {Record<string, any>} params What the body *is* (`Body.params`) — plain JSON,
 *   added by `TODO/ui-038` so the Bill of Materials can group bodies by spec without
 *   reaching into the raw document.
 * @property {[number, number, number]} center Millimetres, Z-up.
 * @property {[[number, number, number], [number, number, number]]} bounds
 *   World-axis-aligned `[min, max]`, millimetres — added by `TODO/ui-027`,
 *   keeping the two corners `center` was already averaging away rather than
 *   discarding them.
 * @property {number | null} volumeMm3 Also added by `TODO/ui-027`: a rim fillet/
 *   chamfer deliberately leaves `bounds` unchanged (`fillet.js`'s own module
 *   doc and `fillet.spec.js`'s "leaves the bounding box alone" case), so this
 *   is what an e2e spec actually checks to confirm rim material was removed.
 *   **`null` while a composite body's volume is still being measured** by the
 *   evaluation worker (`TODO/core-029`): it needs a kernel union, which no longer
 *   runs on the main thread. Never a guess — absent until it is known.
 * @property {import('../core/document.js').ColorOverride[]} [colorOverrides] The
 *   body's user colour overrides (`TODO/ui-037`), as `Body.colorOverrides` reports
 *   them — absent when it has none. Plain JSON, so it is safe in this summary.
 * @property {string[]} partNames The body's **visible** named parts in group order, or
 *   `[]` for a bare solid (`TODO/ui-042`). Non-empty exactly when the body is drawn
 *   part-by-part (`hasNamedParts` — the condition `createBodyObject` uses), which is what
 *   makes it a composite the Objects list can expand and a boolean can address.
 * @property {string[]} hiddenPartNames Parts that exist in the group but are absent from
 *   `names` — a tap-clearance solid, a Raspberry Pi's mounting holes. Still addressable
 *   (`pieces` resolves against every part), which is exactly why the Objects list shows
 *   them. `[]` whenever {@link BodySummary.partNames} is.
 */
/**
 * A body's measurements as far as they are known **right now**, without running a
 * kernel union on the main thread (`TODO/core-029`).
 *
 * - Already measured (by the worker, or earlier here): the cached answer. The cache is
 *   keyed by geometry object, and every kernel value is immutable, so an unchanged
 *   body is never measured twice — the reason a drag-place of one Cube no longer
 *   re-measures every Raspberry Pi already on the plate.
 * - A bare solid, or no worker to defer to: measured on the spot, exactly as before
 *   `core-029`. A bare solid's volume involves no union, and without a worker there is
 *   nowhere else for the work to go.
 * - A composite, with a worker: the box now (`boundsOf` needs no union), the volume
 *   `null` until the worker's answer lands — see {@link requestMeasurements}.
 *
 * @param {Body['geometry']} geometry
 * @returns {{ bounds: import('../core/kernel/group.js').BoundsMm, volumeMm3: number | null }}
 */
function measurementNow(geometry) {
  const cached = cachedMeasurementOf(geometry)
  if (cached) return cached
  if (!isGroup(geometry) || !evaluationWorkerAvailable()) {
    const measured = measureGeometry(geometry)
    rememberMeasurement(geometry, measured)
    return measured
  }
  return { bounds: boundsOf(geometry), volumeMm3: null }
}

/**
 * Send every body whose measurement is still unknown to the evaluation worker, and
 * call `onLanded` once the answer is in the cache.
 *
 * Only the bodies still waiting are sent — typically the one just placed or moved — and
 * a request on the same channel supersedes this one if the document changes again
 * before the worker starts it (the channel's generation rule, `evaluationClient.js`).
 * A superseded answer is simply dropped: the newer request carries every body that is
 * still waiting, so nothing is lost by ignoring it.
 *
 * @param {readonly Body[]} list
 * @param {import('../core/kernel/evaluationClient.js').EvaluationChannel} channel
 * @param {() => void} onLanded
 */
function requestMeasurements(list, channel, onLanded) {
  const waiting = list
    .map((body) => body.geometry)
    .filter((geometry) => isGroup(geometry) && !cachedMeasurementOf(geometry))
  if (waiting.length === 0 || !evaluationWorkerAvailable()) return
  channel.request({ kind: 'measure', bodies: waiting.map((geometry) => packGeometry(geometry)) }).then(
    (outcome) => {
      if (outcome.superseded || outcome.result.kind !== 'measure') return
      outcome.result.measurements.forEach((measured, index) => {
        const geometry = waiting[index]
        rememberMeasurement(
          geometry,
          measured.error === undefined && measured.bounds && measured.volumeMm3 !== undefined
            ? { bounds: measured.bounds, volumeMm3: measured.volumeMm3 }
            : // Unmeasurable (a group with nothing visible). Before `core-029` that threw
              // out of `refresh()` and took the whole UI with it; now it reads as NaN.
              { bounds: boundsOf(geometry), volumeMm3: Number.NaN }
        )
      })
      onLanded()
    },
    (error) => {
      console.error('evaluation worker refused a measure job', error)
    }
  )
}

/**
 * One evaluated body as the plain, non-geometry summary the DOM and the specs
 * read.
 *
 * Exported since `TODO/ui-032`, which needs the *previewed* document summarised
 * the same way the live one is. Sharing the function rather than the shape is
 * the point: two mappings would let the scene list and the preview disagree
 * about what a body's centre is, and "the readout contradicts the picture" is
 * the failure class this project's Verification section exists for.
 *
 * @param {import('../core/document.js').Body} body
 * @returns {BodySummary}
 */
export function summarizeBody(body) {
  // Measured off the evaluated geometry, not read out of the creation record's
  // `center` param. Once a body can be *moved* (`ui-012`), that param stops
  // describing where the body is — it is where the body was first dropped — and
  // this summary is what the scene list announces and what specs assert a
  // placement against. Same measurement, and the same reasoning, as
  // `src/core/inspector.js`'s Transform section.
  const geometry = body.geometry
  const { bounds, volumeMm3 } = measurementNow(geometry)
  const [min, max] = bounds
  const composite = hasNamedParts(geometry)
  return {
    id: body.id,
    name: body.name,
    op: body.op,
    params: body.params,
    center: /** @type {[number, number, number]} */ ([
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
    ]),
    bounds: /** @type {[[number, number, number], [number, number, number]]} */ ([min, max]),
    volumeMm3,
    ...(body.colorOverrides !== undefined ? { colorOverrides: body.colorOverrides } : {}),
    partNames: composite ? [...geometry.names] : [],
    hiddenPartNames: composite ? [...hiddenNamesOf(geometry)] : [],
  }
}

export const useDocumentStore = defineStore('document', () => {
  // Plain and non-reactive on purpose — see the module comment. A brand-new document
  // starts at the default design resolution (Normal, `TODO/core-035`); a loaded one takes
  // whatever its file says, which is Legacy for a file saved before the setting existed.
  // `publishesUserParts` (`TODO/core-037`): this is *the* open project, so the user-part
  // definitions it carries are the registry's project layer.
  const raw = createDocument({ resolution: DEFAULT_RESOLUTION, publishesUserParts: true })

  const version = ref(0)
  /** @type {import('vue').ShallowRef<BodySummary[]>} */
  const bodies = shallowRef(/** @type {BodySummary[]} */ ([]))
  /**
   * `TODO/ui-052`: bodies a condition is keeping out of the fold. Plain data (ids, names
   * and the condition's words — no geometry), refreshed with everything else, so the
   * object list can show them greyed and selectable.
   *
   * @type {import('vue').ShallowRef<import('../core/document.js').InactiveBody[]>}
   */
  const inactiveBodies = shallowRef(/** @type {import('../core/document.js').InactiveBody[]} */ ([]))

  /**
   * Whether each control is enabled, and what it says it will do — the two
   * things `HistoryControls.vue` reads (`TODO/data-003`).
   *
   * Plain refs updated in {@link refresh} rather than `computed`s over `raw`,
   * because `raw` is deliberately non-reactive (see the module comment): a
   * computed reading `raw.canUndo()` would never re-evaluate.
   */
  const canUndo = ref(false)
  const canRedo = ref(false)
  const undoLabel = ref('')
  const redoLabel = ref('')
  /**
   * The design resolution (`TODO/core-035`), mirrored off `raw` in {@link refresh} for the
   * same reason as the refs above: `raw` is deliberately non-reactive.
   */
  const resolution = ref(raw.resolution())
  /**
   * The project's standing instructions (`TODO/ai-003`), mirrored off `raw` in
   * {@link refresh} like {@link resolution}. Untrusted text when it came with a file: render
   * it as text only, never markup.
   */
  const standingInstructions = ref(raw.standingInstructions())
  /**
   * The printer's build volume (`TODO/io-007`), mirrored off `raw` in {@link refresh} like
   * {@link standingInstructions}. A fresh plain object each refresh — three numbers.
   */
  const buildVolume = ref(raw.buildVolume())
  /**
   * Bumped each time a whole document is *loaded* (autosave restore, Open) as
   * opposed to edited. The viewport frames the camera on it: a loaded project
   * whose geometry sits outside the default view would otherwise read as an empty
   * scene — the same class of defect as the second attempt's "too dark to see
   * anything" (`interaction-model-qa.md` §10). Edits deliberately do not move it.
   */
  const loadRevision = ref(0)
  /**
   * Bumped when measurements land from the evaluation worker (`TODO/core-029`), so a
   * computed that summarises bodies — the timeline preview's — re-reads the cache.
   */
  const measureRevision = ref(0)
  /** The live scene's measurement stream; a preview has its own, so neither cancels the other. */
  const sceneChannel = createEvaluationChannel('scene')
  const previewChannel = createEvaluationChannel('preview')

  function resummarize() {
    bodies.value = raw.bodies().map(summarizeBody)
    measureRevision.value += 1
  }

  /**
   * Ask the worker to measure a *previewed* document's bodies (`TODO/ui-032`'s
   * timeline preview). On its own channel, so scrubbing the preview never supersedes
   * the live scene's measurements.
   *
   * @param {readonly Body[]} list
   */
  function measurePreview(list) {
    requestMeasurements(list, previewChannel, () => {
      measureRevision.value += 1
    })
  }

  function refresh() {
    canUndo.value = raw.canUndo()
    canRedo.value = raw.canRedo()
    undoLabel.value = raw.pendingUndo()?.label ?? ''
    redoLabel.value = raw.pendingRedo()?.label ?? ''
    resolution.value = raw.resolution()
    standingInstructions.value = raw.standingInstructions()
    buildVolume.value = raw.buildVolume()
    const list = raw.bodies()
    bodies.value = list.map(summarizeBody)
    // `TODO/ui-052`: a change (a model swap, or its Undo) can take away the part the
    // selection is drilled into — a Pi 5's `camera0` on the way back to a Pi 4. Fall back
    // to the whole body, the same "is the part still there?" check `restoreSelection`
    // makes, before anything renders a description of a part that no longer exists.
    const selection = useSelectionStore()
    const drilled = selection.subPart
    if (drilled) {
      const summary = bodies.value.find((candidate) => candidate.id === drilled.bodyId)
      const known = [...(summary?.partNames ?? []), ...(summary?.hiddenPartNames ?? [])]
      if (summary && !known.includes(drilled.partName)) selection.stepUp()
    }
    inactiveBodies.value = raw.inactiveBodies()
    version.value = raw.version
    requestMeasurements(list, sceneChannel, resummarize)
  }

  /**
   * Append one record, origin-tagged. The only way a component is allowed to
   * change the document (CLAUDE.md: "never mutate document state directly from a
   * component — that breaks undo").
   *
   * @param {OpRecord} record
   * @param {{ origin?: string }} [transaction]
   * @returns {OpRecord}
   */
  function append(record, transaction = {}) {
    appendAll([record], transaction)
    return record
  }

  /**
   * The `meta` every local step parks on the undo stack — see `appendAll`.
   *
   * @param {string} origin
   */
  function localMeta(origin) {
    return origin === 'local' ? { selectionBefore: [...useSelectionStore().ids] } : undefined
  }

  /**
   * Recolour a body, or one named sub-part of it (`TODO/ui-037`) — core's
   * `setColorOverride`, routed through here for the same two reasons every other
   * mutation is: the selection-before `meta` Undo restores, and one `refresh()`.
   *
   * @param {string} id
   * @param {{ color: number, colorAlpha?: number, subPart?: string }} override
   * @param {{ origin?: string }} [transaction]
   * @returns {OpRecord}
   */
  function setColorOverride(id, override, transaction = {}) {
    const origin = transaction.origin ?? 'local'
    const { record } = raw.setColorOverride(id, override, { origin, meta: localMeta(origin) })
    refresh()
    return record
  }

  /**
   * Change the design resolution (`TODO/core-035`) — core's `setResolution`, one local
   * undoable step that re-folds every body. Routed through here like every other
   * mutation, for the selection-before `meta` Undo restores and one `refresh()`.
   *
   * @param {string} next One of the resolution ids.
   */
  function setResolution(next) {
    raw.setResolution(next, { origin: 'local', meta: localMeta('local') })
    refresh()
  }

  /**
   * Replace the project's standing instructions (`TODO/ai-003`) — core's
   * `setStandingInstructions`, a `local` document change that bumps the version (so autosave,
   * auto-push and the save-status chip follow it) but is not an undo step.
   *
   * @param {string} text
   */
  function setStandingInstructions(text) {
    raw.setStandingInstructions(text, { origin: 'local' })
    refresh()
  }

  /**
   * Replace the printer's build volume (`TODO/io-007`) — core's `setBuildVolume`, a `local`
   * document change that bumps the version but is not an undo step, like the standing
   * instructions. Throws, naming the field, on a volume that is not three positive mm values.
   *
   * @param {import('../core/buildVolume.js').BuildVolume} volume
   */
  function setBuildVolume(volume) {
    raw.setBuildVolume(volume, { origin: 'local' })
    refresh()
  }

  /**
   * Reset a body's (or one sub-part's) colour to the default — core's
   * `clearColorOverride`, routed through here like {@link setColorOverride}.
   *
   * @param {string} id
   * @param {{ subPart?: string }} target
   * @param {{ origin?: string }} [transaction]
   * @returns {OpRecord}
   */
  function clearColorOverride(id, target, transaction = {}) {
    const origin = transaction.origin ?? 'local'
    const { record } = raw.clearColorOverride(id, target, { origin, meta: localMeta(origin) })
    refresh()
    return record
  }

  /**
   * Append several records as **one undoable step** — a composite placement is
   * its recipe record plus the translate that drops it (`ui-030`), and section
   * 19's granularity rule is one *user action*, not one record.
   *
   * @param {readonly OpRecord[]} records
   * @param {{ origin?: string, label?: string }} [transaction]
   * @returns {readonly OpRecord[]}
   */
  function appendAll(records, transaction = {}) {
    const origin = transaction.origin ?? 'local'
    raw.appendAll(records, {
      origin,
      label: transaction.label,
      // The selection as it stood *before* the mutation, parked on the step so
      // undo can put it back (section 19: "the selection that existed before the
      // undone action is restored"). Captured here, in the one place every
      // mutation already funnels through, rather than at each of the half-dozen
      // call sites — which is also why this store reaches for the selection
      // store at all. `src/core/document.js` stays framework-free and treats the
      // whole thing as opaque `meta`.
      meta: origin === 'local' ? { selectionBefore: [...useSelectionStore().ids] } : undefined,
    })
    refresh()
    return records
  }

  /**
   * Several appends that each need the document *as the previous one left it*,
   * committed as **one undoable step**, atomically (`TODO/ui-044`, core's
   * `document.batch`). `build` gets an `append` to call as often as it needs and
   * reads `raw` between calls; a throw anywhere inside leaves the document and
   * both stacks exactly as they were and reaches the caller unchanged.
   *
   * Refreshed once at the end rather than per record: the intermediate states
   * are never meant to be seen.
   *
   * @template T
   * @param {(append: (record: OpRecord) => OpRecord) => T} build
   * @param {{ origin?: string, label?: string }} [transaction]
   * @returns {T}
   */
  function batch(build, transaction = {}) {
    const origin = transaction.origin ?? 'local'
    // Captured once, before the first record: the selection to restore on Undo is
    // the one that existed before the whole action, as `appendAll` does per step.
    const meta = origin === 'local' ? { selectionBefore: [...useSelectionStore().ids] } : undefined
    const result = raw.batch(
      () =>
        build((record) => {
          raw.appendAll([record], { origin, meta })
          return record
        }),
      { label: transaction.label }
    )
    refresh()
    return result
  }

  /**
   * Revise several existing rows in place as **one undoable step** (`TODO/ui-052`,
   * core's `document.reviseRecords`): a composite param edit together with every fix
   * the repair dialog chose, or a condition edited or removed. Throws the core's
   * refusal unchanged — atomic, so a refused revision leaves everything as it was.
   *
   * `transaction.append` (`TODO/sketch-003`): records to put into the log in the **same**
   * undo step — the photo an Edit sketch session added alongside the sketch's revision.
   *
   * @param {readonly import('../core/document.js').RecordRevision[]} changes
   * @param {{ label?: string, append?: readonly OpRecord[] }} [transaction]
   */
  function revise(changes, transaction = {}) {
    raw.reviseRecords(
      changes,
      {
        origin: 'local',
        label: transaction.label,
        meta: { selectionBefore: [...useSelectionStore().ids] },
      },
      { append: transaction.append ?? [] },
    )
    refresh()
  }

  /**
   * The undo meta a delete parks: the selection *and* the drilled-in sub-part, so Undo
   * lands the user exactly where they were (`TODO/ui-051` — Delete then Undo is a
   * no-op from the user's side, including `Raspberry Pi 1 ▸ usb1`).
   */
  function selectionMeta() {
    const selection = useSelectionStore()
    const subPart = selection.subPart
    return {
      selectionBefore: [...selection.ids],
      ...(subPart ? { subPartBefore: { bodyId: subPart.bodyId, partName: subPart.partName } } : {}),
    }
  }

  /**
   * Delete bodies as one undoable step (`TODO/ui-051`) — core's `deleteBodies`.
   *
   * The selection is cleared **before** the refresh that drops the meshes, so no frame
   * ever renders a gizmo or dimension lines on a body that is gone. A refusal puts the
   * selection back and rethrows; nothing else changed.
   *
   * @param {readonly string[]} ids
   * @returns {readonly OpRecord[]}
   */
  function deleteBodies(ids) {
    const selection = useSelectionStore()
    const meta = selectionMeta()
    selection.clear()
    try {
      const { records } = raw.deleteBodies(ids, { origin: 'local', meta })
      refresh()
      return records
    } catch (error) {
      restoreSelection(meta.selectionBefore, meta.subPartBefore)
      throw error
    }
  }

  /**
   * Remove one named part from a group-valued body (`TODO/ui-051`) — core's
   * `removePart`. The selection steps back up to the parent body first, which is
   * still there, now without the part.
   *
   * @param {string} bodyId
   * @param {string} partName
   * @returns {OpRecord}
   */
  function removePart(bodyId, partName) {
    const selection = useSelectionStore()
    const meta = selectionMeta()
    selection.stepUp()
    try {
      const { record } = raw.removePart(bodyId, partName, { origin: 'local', meta })
      refresh()
      return record
    } catch (error) {
      restoreSelection(meta.selectionBefore, meta.subPartBefore)
      throw error
    }
  }

  /**
   * Replace the whole document with a parsed project (`TODO/io-001`) — the one
   * entry point for autosave restore and Open.
   *
   * Throws the command layer's `ReplayRejection` (naming the step) if any entry
   * does not fold, and in that case **nothing has changed**: the load is atomic,
   * so selection, history and the document are exactly as they were.
   *
   * On success selection is cleared (it named bodies that may no longer exist —
   * and selection is UI state, never persisted), both undo stacks are empty
   * (section 19), and {@link loadRevision} moves so the viewport frames the new
   * content.
   *
   * @param {readonly import('../core/document.js').DocumentEntry[]} entries
   * @param {number | null} [rollbackAt]
   * @param {string} [nextResolution] The loaded design's resolution (`TODO/core-035`);
   *   `parseProject` supplies it. Omitted: the current one.
   * @param {{ standingInstructions?: string, buildVolume?: import('../core/buildVolume.js').BuildVolume, userParts?: readonly import('../core/userPart.js').UserPartDefinition[], unavailableParts?: Readonly<Record<string, string>> }} [options]
   *   `TODO/ai-003`: the loaded project's standing instructions; omitted, the loaded project has
   *   none. `TODO/io-007`: its build volume; omitted, the default. `TODO/core-037`: the user-part
   *   definitions it carries and the parts it names that could not be loaded; omitted, none.
   */
  function load(entries, rollbackAt = null, nextResolution = raw.resolution(), options = {}) {
    raw.loadEntries(entries, rollbackAt, nextResolution, {
      standingInstructions: options.standingInstructions ?? '',
      ...(options.buildVolume === undefined ? {} : { buildVolume: options.buildVolume }),
      userParts: options.userParts ?? [],
      unavailableParts: options.unavailableParts ?? {},
    })
    useSelectionStore().clear()
    loadRevision.value += 1
    refresh()
  }

  /**
   * Put a remembered selection back, dropping anything that is no longer there.
   *
   * "If those bodies still exist" is load-bearing: undoing the *placement* of a
   * body that was selected when a later step ran would otherwise leave the
   * selection pointing at a record the document no longer has, and the gizmo and
   * Inspector would both be attached to nothing.
   *
   * A remembered sub-part depth (`TODO/ui-051`'s Remove part) comes back too, but
   * only when its body is the one survivor and it really has that part again.
   *
   * @param {readonly string[]} ids
   * @param {{ bodyId: string, partName: string }} [subPart]
   */
  function restoreSelection(ids, subPart) {
    const live = new Set(bodies.value.map((body) => body.id))
    const survivors = ids.filter((id) => live.has(id))
    const selection = useSelectionStore()
    if (survivors.length === 0) selection.clear()
    else selection.selectMany(survivors)
    if (subPart && survivors.length === 1 && survivors[0] === subPart.bodyId) {
      const body = bodies.value.find((candidate) => candidate.id === subPart.bodyId)
      const known = [...(body?.partNames ?? []), ...(body?.hiddenPartNames ?? [])]
      if (known.includes(subPart.partName)) selection.selectPart(subPart.bodyId, subPart.partName)
    }
  }

  /**
   * @typedef {object} HistoryResult
   * @property {boolean} ok
   * @property {string} [message] Why it was refused — shown to the user, never
   *   swallowed (section 19, point 4's named refusal).
   * @property {string} [label]
   */

  /**
   * Undo the most recent local step, then restore the selection it started with.
   *
   * @returns {HistoryResult}
   */
  function undo() {
    const step = raw.pendingUndo()
    if (!step) return { ok: false }
    try {
      raw.undo()
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    refresh()
    restoreSelection(step.meta?.selectionBefore ?? [], step.meta?.subPartBefore)
    return { ok: true, label: step.label }
  }

  /**
   * Redo the most recently undone step, selecting what it (re)built.
   *
   * The mirror of undo's rule rather than a copy of it: redoing a placement
   * should leave the placed body selected, exactly as placing it did, so the
   * selection to restore here is the step's own lineage roots — not the
   * selection that preceded it.
   *
   * @returns {HistoryResult}
   */
  function redo() {
    const step = raw.pendingRedo()
    if (!step) return { ok: false }
    try {
      raw.redo()
    } catch (error) {
      return { ok: false, message: error instanceof Error ? error.message : String(error) }
    }
    refresh()
    // A row action revises records rather than adding any (`TODO/ui-052`'s revise among
    // them), so it has no records of its own to select: put back the selection it was
    // made from instead of clearing it.
    if (step.revision !== undefined) {
      restoreSelection(step.meta?.selectionBefore ?? [])
      return { ok: true, label: step.label }
    }
    /** @type {Set<string>} */
    const roots = new Set()
    for (const record of step.records) {
      const root = record.id === undefined ? undefined : raw.rootOf(record.id)
      if (root !== undefined) roots.add(root)
    }
    restoreSelection([...roots])
    return { ok: true, label: step.label }
  }

  return {
    raw,
    version,
    bodies,
    inactiveBodies,
    count: computed(() => bodies.value.length),
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    resolution,
    loadRevision,
    measureRevision,
    measurePreview,
    load,
    append,
    appendAll,
    batch,
    revise,
    setColorOverride,
    clearColorOverride,
    setResolution,
    standingInstructions,
    setStandingInstructions,
    buildVolume,
    setBuildVolume,
    deleteBodies,
    removePart,
    undo,
    redo,
    refresh,
  }
})
