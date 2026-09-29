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
