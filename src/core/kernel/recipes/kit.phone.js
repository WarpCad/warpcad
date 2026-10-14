// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The `kit.phone` composite recipe — a stand-in for a phone in a case, to *subtract*
 * from a plate so the phone can lie flat despite its camera plateau.
 *
 * It is a stand-in, not a model of any handset: a rounded-rectangle slab (the phone and
 * its case) with a second, shallower rounded-rectangle block fused to its **back** face
 * at the top end (the camera plateau). Defaults are an iPhone 17 Pro in a TechWeave case,
 * as best estimated; every dimension is a parameter because the case, not the phone,
 * sets most of them and nobody should trust a spec sheet over calipers.
 *
 * ## Orientation
 *
 * Back face down. The body's underside sits on the plateau's underside plus
 * `plateauHeight`, so the plateau protrudes *below* the slab, toward −Z, exactly as the
 * phone does when it lies screen-up. Placed with the slab's underside level with a
 * plate's top face and subtracted from the plate, only the plateau cuts — a pocket of
 * `plateauHeight` deep, with the plate's top face left flat everywhere else the phone
 * rests. The plateau sits at the +Y end; rotate the stand-in about Z for the other end.
 *
 * Like `kit.board`, nothing here builds geometry: it expands into other op records and
 * is centred on its bounding box so a Library drop lands under the pointer.
 *
 * @module core/kernel/recipes/kit.phone
 */

import { centringVector, requireCornerRadiusMm, requirePositiveMm } from './kit.board.js'

/** @typedef {import('../registry.js').OpRecord} OpRecord */

const OP = 'kit.phone'

/**
 * How far the plateau prism is extruded *into* the slab so the union overlaps instead of
 * meeting face to face — coplanar faces are the classic BSP non-manifold seam
 * (`kit.boardFrame.js` explains the same hazard). It is inside the slab, so it changes
 * nothing visible.
 */
const WELD_OVERLAP_MM = 1

/**
 * Expand a `kit.phone` document line into the op records that define it.
 *
 * @param {object} params
 * @param {number} [params.width] Phone-in-case width, X, mm.
 * @param {number} [params.length] Phone-in-case length, Y, mm.
 * @param {number} [params.thickness] Slab thickness excluding the plateau, Z, mm.
 * @param {number} [params.cornerRadius] Slab corner radius, mm.
 * @param {number} [params.plateauWidth] Camera plateau width, X, mm.
 * @param {number} [params.plateauLength] Camera plateau length, Y, mm.
 * @param {number} [params.plateauHeight] How far the plateau protrudes below the slab, mm.
 * @param {number} [params.plateauCornerRadius] Plateau corner radius, mm.
 * @param {[number, number, number]} [params.center] Bounding-box centre; defaults to origin.
 * @returns {OpRecord[]}
 */
export function phone(params) {
  const {
    width = 77,
    length = 157,
    thickness = 9,
    cornerRadius = 12,
    plateauWidth = 74,
    plateauLength = 46,
    plateauHeight = 4,
    plateauCornerRadius = 10,
    center,
  } = params

  requirePositiveMm(width, 'width', OP)
  requirePositiveMm(length, 'length', OP)
  requirePositiveMm(thickness, 'thickness', OP)
  requirePositiveMm(plateauWidth, 'plateauWidth', OP)
  requirePositiveMm(plateauLength, 'plateauLength', OP)
  requirePositiveMm(plateauHeight, 'plateauHeight', OP)
  requireCornerRadiusMm(cornerRadius, Math.min(width, length), 'cornerRadius', OP)
  requireCornerRadiusMm(
    plateauCornerRadius,
    Math.min(plateauWidth, plateauLength),
    'plateauCornerRadius',
    OP
  )
  if (plateauWidth > width || plateauLength > length) {
    throw new Error(
      `${OP}: the plateau (${plateauWidth} × ${plateauLength} mm) must fit inside the ` +
        `phone (${width} × ${length} mm)`
    )
  }

  // The plateau hugs the +Y end: its far edge is flush with the slab's.
  const plateauY = (length - plateauLength) / 2

  return [
    {
      id: 'phone.body.profile',
      op: 'profile.roundedRectangle',
      params: { size: [width, length], roundRadius: cornerRadius },
    },
    {
      id: 'phone.body.prism',
      op: 'profile.extrudeLinear',
      params: { height: thickness },
      target: 'phone.body.profile',
    },
    {
      id: 'phone.body',
      op: 'transform.translate',
      params: { vector: [0, 0, plateauHeight] },
      target: 'phone.body.prism',
    },
    {
      id: 'phone.plateau.profile',
      op: 'profile.roundedRectangle',
      params: { size: [plateauWidth, plateauLength], roundRadius: plateauCornerRadius },
    },
    {
      id: 'phone.plateau.prism',
      op: 'profile.extrudeLinear',
      params: { height: plateauHeight + WELD_OVERLAP_MM },
      target: 'phone.plateau.profile',
    },
    {
      id: 'phone.plateau',
      op: 'transform.translate',
      params: { vector: [0, plateauY, 0] },
      target: 'phone.plateau.prism',
    },
    {
      id: 'phone.solid',
      op: 'boolean.union',
      params: {},
      target: 'phone.body',
      operands: ['phone.plateau'],
    },
    {
      id: 'phone',
      op: 'transform.translate',
      params: { vector: centringVector(center, thickness + plateauHeight, OP) },
      target: 'phone.solid',
      name: 'phone',
    },
  ]
}
