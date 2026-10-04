// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Tiny image byte fixtures for specs (`TODO/sketch-003`): headers only, built byte by byte
 * so a spec knows exactly what it is handing the validator.
 */

import { ASSET_OP, base64FromBytes } from '../imageAsset.js'

/** @param {number} value @returns {number[]} */
const u32be = (value) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
/** @param {string} text @returns {number[]} */
const ascii = (text) => [...text].map((char) => char.charCodeAt(0))

/**
 * A PNG with a signature, an IHDR and an IEND — no pixels.
 *
 * @param {number} width
 * @param {number} height
 * @returns {Uint8Array}
 */
export function pngBytes(width, height) {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ...u32be(13), ...ascii('IHDR'), ...u32be(width), ...u32be(height), 8, 2, 0, 0, 0, ...u32be(0),
    ...u32be(0), ...ascii('IEND'), ...u32be(0),
  ])
}

/**
 * A valid `asset.image` record holding a header-only PNG.
 *
 * @param {string} [id]
 * @param {number} [width]
 * @param {number} [height]
 */
export function validAssetRecord(id = 'img-0123456789abcdef01234567', width = 640, height = 480) {
  return {
    id,
    op: ASSET_OP,
    params: { mime: 'image/png', widthPx: width, heightPx: height, dataBase64: base64FromBytes(pngBytes(width, height)) },
  }
}
