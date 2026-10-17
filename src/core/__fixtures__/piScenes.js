// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Hand-built, real-kernel documents for `TODO/ui-052`'s specs: a Raspberry Pi with
 * something depending on one of its parts — the user's own example, "a Pi 4, something
 * snapped to its AV jack, then change it to a Pi 5".
 *
 * Built through the document's own command layer (`append`), never by writing entries
 * directly, so each fixture is a log the real app could have produced.
 *
 * @module core/__fixtures__/piScenes
 */

import { createDocument } from '../document.js'
import { boundsOf } from '../kernel/group.js'

/** @typedef {import('../document.js').WarpDocument} WarpDocument */
/** @typedef {[number, number, number]} Vec3Mm */

export const LOCAL = Object.freeze({ origin: 'local' })

/**
 * A Pi (moved off the origin, the way a Library drop leaves it) and a small cube.
 *
 * @param {object} [options]
 * @param {number} [options.model] The Pi's model, default 4.
 * @param {boolean} [options.cubeFirst] Place the cube *before* the Pi — the order a user
 *   who drops the enclosure first produces.
 * @returns {WarpDocument}
 */
export function piAndCube({ model = 4, cubeFirst = false } = {}) {
  const document = createDocument()
  const cube = () =>
    document.append(
      { id: 'cube-1', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [6, 6, 6], center: [120, 20, 3] } },
      LOCAL,
    )
  if (cubeFirst) cube()
  document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model } }, LOCAL)
  document.append(
    {
      id: 'pi-1-move',
      op: 'transform.translate',
      target: 'pi-1',
      supersedes: 'pi-1',
      params: { vector: [10, 5, 0], rotation: [0, 0, 0] },
    },
    LOCAL,
  )
  if (!cubeFirst) cube()
  return document
}

/**
 * Snap the cube to one or more named parts of the Pi — the record `OperationsToolbar`'s
 * `commitSnapAlign` writes for "cube first, then Shift-click the Pi's part".
 *
 * @param {WarpDocument} document
 * @param {string} pieces Comma-separated part names, e.g. `'avjack'`; `''` for the whole Pi.
 * @param {object} [options]
 * @param {string} [options.axes]
 * @param {string} [options.orientation]
 * @returns {WarpDocument}
 */
export function snapCubeTo(document, pieces, { axes = 'xy', orientation = 'inside+' } = {}) {
  const cube = /** @type {string} */ (document.currentIdOf('cube-1'))
  const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
  document.append(
    {
      id: 'snap-1',
      op: 'group.snap',
      target: cube,
      operands: [pieces === '' ? pi : { id: pi, pieces }],
      supersedes: cube,
      params: { axes, orientation, deltaMm: 0 },
    },
    LOCAL,
  )
  return document
}

/**
 * The other way round: the **Pi** is the moving body, snapped **by one of its own parts**
 * onto the cube — what "Pi first, then the cube" produces (found hand-driving `ui-052`:
 * a stray click selected the Pi first). The row that breaks on a model change is then in
 * the Pi's own history.
 *
 * @param {WarpDocument} document
 * @param {string} pieces
 * @returns {WarpDocument}
 */
export function snapPiBy(document, pieces) {
  const cube = /** @type {string} */ (document.currentIdOf('cube-1'))
  const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
  document.append(
    {
      id: 'snap-pi',
      op: 'group.snap',
      target: { id: pi, pieces },
      operands: [cube],
      supersedes: pi,
      params: { axes: 'xyz', orientation: 'outside+', deltaMm: 0 },
    },
    LOCAL,
  )
  return document
}

/**
 * A case with the Pi's hidden `clearance-avjack` cut out of it — `ui-040`'s sub-part
 * Subtract, which consumes the whole Pi (a boolean always retires its operands).
 *
 * @param {WarpDocument} document From {@link piAndCube}.
 * @returns {WarpDocument}
 */
export function subtractAvjackClearance(document) {
  document.append(
    { id: 'case-1', op: 'primitive.cuboid', name: 'Case 1', params: { size: [110, 80, 30], center: [50, 30, 5] } },
    LOCAL,
  )
  const pi = /** @type {string} */ (document.currentIdOf('pi-1'))
  document.append(
    {
      id: 'bool-1',
      op: 'boolean.subtract',
      name: 'Subtract 1',
      target: 'case-1',
      operands: [{ id: pi, pieces: 'clearance-avjack' }],
      consumes: ['case-1', pi],
    },
    LOCAL,
  )
  return document
}

/**
 * The Pi's creation record with new params — what a composite param edit swaps in.
 *
 * @param {WarpDocument} document
 * @param {Record<string, any>} params Merged over the current ones.
 * @returns {import('../kernel/registry.js').OpRecord}
 */
export function piWith(document, params) {
  const root = /** @type {import('../kernel/registry.js').OpRecord} */ (document.recordOf('pi-1'))
  return { ...root, params: { ...root.params, ...params } }
}

/**
 * A Raspberry Pi and a `touchScreen2`, both moved off the origin the way two Library
 * drops leave them — the user's own scene for `TODO/ui-063` ("mount the board on the
 * screen's posts").
 *
 * @param {object} [options]
 * @param {number} [options.model] The Pi's model, default 5.
 * @returns {WarpDocument}
 */
export function piAndTouchScreen({ model = 5 } = {}) {
  const document = createDocument()
  document.append({ id: 'pi-1', op: 'raspberrypi.bplus', name: 'Raspberry Pi 1', params: { model } }, LOCAL)
  document.append(
    {
      id: 'pi-1-move',
      op: 'transform.translate',
      target: 'pi-1',
      supersedes: 'pi-1',
      params: { vector: [-120, 15, 4], rotation: [0, 0, 0] },
    },
    LOCAL,
  )
  document.append({ id: 'screen-1', op: 'raspberrypi.touchScreen2', name: 'touchScreen2 1', params: {} }, LOCAL)
  document.append(
    {
      id: 'screen-1-move',
      op: 'transform.translate',
      target: 'screen-1',
      supersedes: 'screen-1',
      params: { vector: [40, -30, 0], rotation: [0, 0, 0] },
    },
    LOCAL,
  )
  return document
}

/**
 * Snap or Align one body against another with **either or both** sides addressed at a
 * named part — the record `OperationsToolbar`'s `commitSnapAlign` writes once every
 * selected body can carry its own address (`TODO/ui-063`). `''` for a side means the
 * whole body, exactly as a bare id does.
 *
 * @param {WarpDocument} document
 * @param {object} spec
 * @param {'group.snap' | 'group.align'} spec.op
 * @param {string} spec.moving Lineage-root id of the body that moves.
 * @param {string} spec.movingPieces
 * @param {string} spec.reference Lineage-root id of the body it is measured against.
 * @param {string} spec.referencePieces
 * @param {string} spec.axes
 * @param {string} [spec.orientation] `group.snap` only.
 * @param {string} [spec.id]
 * @returns {WarpDocument}
 */
export function snapAlignParts(
  document,
  { op, moving, movingPieces, reference, referencePieces, axes, orientation, id = document.nextId('snapalign') },
) {
  const movingId = /** @type {string} */ (document.currentIdOf(moving))
  const referenceId = /** @type {string} */ (document.currentIdOf(reference))
  /** @type {Record<string, any>} */
  const params = { axes, deltaMm: 0 }
  if (op === 'group.snap') params.orientation = orientation
  document.append(
    {
      id,
      op,
      target: movingPieces === '' ? movingId : { id: movingId, pieces: movingPieces },
      operands: [referencePieces === '' ? referenceId : { id: referenceId, pieces: referencePieces }],
      supersedes: movingId,
      params,
    },
    LOCAL,
  )
  return document
}

/**
 * The user's own `TODO/core-061` scene, up to the first finished bolt: a Pi 5 mounted on a
 * Touchscreen 2's posts (Align `hole1` → `piMountingPost1` on XY, Snap `mb` onto the post top
 * on Z), then an M2.5 socket bolt turned over, aligned to `hole1` on XY and snapped to `mb`
 * on Z with a −5 mm offset. Ids: `pi-align`, `pi-snap`, `bolt-1`, `bolt-align`, `bolt-snap`.
 *
 * @returns {WarpDocument}
 */
export function piBoltOnHole1() {
  const document = piAndTouchScreen()
  const pi = () => /** @type {string} */ (document.currentIdOf('pi-1'))
  const screen = /** @type {string} */ (document.currentIdOf('screen-1'))
  document.append(
    {
      id: 'pi-align',
      op: 'group.align',
      target: { id: pi(), pieces: 'hole1' },
      supersedes: pi(),
      operands: [{ id: screen, pieces: 'piMountingPost1' }],
      params: { axes: 'xy', deltaMm: 0 },
    },
    LOCAL,
  )
  document.append(
    {
      id: 'pi-snap',
      op: 'group.snap',
      target: { id: pi(), pieces: 'mb' },
      supersedes: pi(),
      operands: [{ id: screen, pieces: 'piMountingPost1' }],
      params: { axes: 'z', orientation: 'outside-', deltaMm: 0 },
    },
    LOCAL,
  )
  document.append(
    { id: 'bolt-1', op: 'hardware.bolt', name: 'Bolt 1', params: { type: 'socket', spec: 'm2.5', length: 10, fit: 'loose' } },
    LOCAL,
  )
  document.append(
    {
      id: 'bolt-turn',
      op: 'transform.rotate',
      target: 'bolt-1',
      supersedes: 'bolt-1',
      params: { angles: [180, 0, 0], center: [0, 0, 6.25], rotation: [180, 0, 0] },
    },
    LOCAL,
  )
  document.append(
    {
      id: 'bolt-align',
      op: 'group.align',
      target: 'bolt-turn',
      supersedes: 'bolt-turn',
      operands: [{ id: pi(), pieces: 'hole1' }],
      params: { axes: 'xy', deltaMm: 0 },
    },
    LOCAL,
  )
  document.append(
    {
      id: 'bolt-snap',
      op: 'group.snap',
      target: 'bolt-align',
      supersedes: 'bolt-align',
      operands: [{ id: pi(), pieces: 'mb' }],
      params: { axes: 'z', orientation: 'outside-', deltaMm: -5 },
    },
    LOCAL,
  )
  return document
}

/**
 * {@link piBoltOnHole1} plus the `pattern.repeat` that puts the same bolt on `hole2`–`hole4`
 * (`TODO/core-061`), appended as `rep-1`.
 *
 * @param {object} [options]
 * @param {string[]} [options.targets]
 * @returns {WarpDocument}
 */
export function piBoltRepeated({ targets = ['hole2', 'hole3', 'hole4'] } = {}) {
  const document = piBoltOnHole1()
  document.append(
    { id: 'rep-1', op: 'pattern.repeat', params: { source: 'bolt-1', seed: { id: 'pi-1', pieces: 'hole1' }, targets } },
    LOCAL,
  )
  return document
}

/**
 * One named part's bounding box, measured off its body's evaluated geometry — hidden
 * parts (a Pi's `hole1`) included, since those are exactly what a mount is aligned by.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId Lineage-root id.
 * @param {string} partName
 * @returns {[Vec3Mm, Vec3Mm]}
 */
export function partBoundsOf(document, bodyId, partName) {
  const body = document.bodies().find((candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`piScenes: no body "${bodyId}"`)
  const part = /** @type {any} */ (body.geometry).parts?.[partName]
  if (!part) throw new Error(`piScenes: body "${bodyId}" has no part "${partName}"`)
  return /** @type {[Vec3Mm, Vec3Mm]} */ (boundsOf(part))
}

/**
 * A body's bounding-box centre, measured off its evaluated geometry.
 *
 * @param {WarpDocument} document
 * @param {string} bodyId
 * @returns {Vec3Mm}
 */
export function centreOf(document, bodyId) {
  const body = document.bodies().find((candidate) => candidate.id === bodyId)
  if (!body) throw new Error(`piScenes: no body "${bodyId}"`)
  const [min, max] = boundsOf(body.geometry)
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}
