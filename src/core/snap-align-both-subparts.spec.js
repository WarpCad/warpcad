// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { piAndTouchScreen, partBoundsOf, snapAlignParts, centreOf } from './__fixtures__/piScenes.js'
import { SNAP_SIDES, boundsOf } from './kernel/group.js'
import { rotateRecord } from './transform.js'

/**
 * Snap/Align with a named part on **both** operands (`TODO/ui-063`), against a real Pi 5
 * and a real `touchScreen2` — the user's own report: *"After snapping and aligning the
 * pi's holes should be centered on the mounting posts and the mb should be resting on
 * the top of the posts with no gap."*
 *
 * The kernel already resolved each operand's `pieces` independently (`registry.js`'s
 * `group.snap`/`group.align` and `referenceOf`); what was broken was the selection,
 * which could only carry one address. These cases pin the arithmetic the UI must now
 * produce, so a regression in either the recipes or the record shape fails here rather
 * than in someone's printed case. Every length is millimetres, Z-up.
 */

/** @typedef {[number, number, number]} Vec3Mm */

/**
 * @param {[Vec3Mm, Vec3Mm]} bounds
 * @returns {Vec3Mm}
 */
function centre([min, max]) {
  return [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2]
}

/**
 * The XY axis of a vertical cylinder part — its bounding-box centre in plan.
 *
 * @param {import('./document.js').WarpDocument} document
 * @param {string} bodyId
 * @param {string} partName
 * @returns {[number, number]}
 */
function axisOf(document, bodyId, partName) {
  const [x, y] = centre(partBoundsOf(document, bodyId, partName))
  return [x, y]
}

/**
 * @param {[number, number]} actual
 * @param {[number, number]} expected
 */
function expectSameAxis(actual, expected) {
  expect(actual[0]).toBeCloseTo(expected[0], 6)
  expect(actual[1]).toBeCloseTo(expected[1], 6)
}

/**
 * Align the Pi's `hole1` onto the screen's `piMountingPost1`, in plan.
 *
 * @param {import('./document.js').WarpDocument} document
 */
function alignHole1OnPost1(document) {
  return snapAlignParts(document, {
    op: 'group.align',
    moving: 'pi-1',
    movingPieces: 'hole1',
    reference: 'screen-1',
    referencePieces: 'piMountingPost1',
    axes: 'xy',
  })
}

/**
 * Rest the Pi's `mb` on top of the screen's `piMountingPost1`.
 *
 * @param {import('./document.js').WarpDocument} document
 */
function snapMbOnPost1(document) {
  return snapAlignParts(document, {
    op: 'group.snap',
    moving: 'pi-1',
    movingPieces: 'mb',
    reference: 'screen-1',
    referencePieces: 'piMountingPost1',
    axes: 'z',
    orientation: 'outside-',
  })
}

describe('Snap/Align with both operands addressed at a part (TODO/ui-063)', () => {
  it('the Z step uses `outside-`: SNAP_SIDES puts the mover’s min on the reference’s max', () => {
    // `[referenceBoundIndex, movingBoundIndex]`; 1 is max, 0 is min. Pinned against the
    // table rather than a guess: V1's `snap('piMountingPost1', rpi.parts.mb, 'z',
    // 'outside+')` moved the *screen*, and moving the Pi instead is the mirror image.
    expect(SNAP_SIDES['outside-']).toEqual([1, 0])
    expect(SNAP_SIDES['outside+']).toEqual([0, 1])
  })

  it('the recipe facts the two-step mount depends on: hole1 is taller than mb, and the SD card hangs below mb', () => {
    const document = piAndTouchScreen()
    const [holeMin, holeMax] = partBoundsOf(document, 'pi-1', 'hole1')
    const [mbMin, mbMax] = partBoundsOf(document, 'pi-1', 'mb')
    const [sdMin] = partBoundsOf(document, 'pi-1', 'microsd')
    // Snapping hole1 to the post top would leave the board floating, so `mb` is the Z
    // operand — and not because Z is special-cased anywhere.
    expect(holeMin[2]).toBeLessThan(mbMin[2])
    expect(holeMax[2]).toBeGreaterThan(mbMax[2])
    // What the whole-Pi measurement wrongly rested on the post.
    expect(sdMin[2]).toBeLessThan(mbMin[2])
    const [wholeMin] = boundsOf(
      /** @type {any} */ (document.bodies().find((body) => body.id === 'pi-1')).geometry,
    )
    expect(wholeMin[2]).toBeCloseTo(sdMin[2], 6)
  })

  it('align xy, hole1 → piMountingPost1: the hole’s axis lands on the post’s axis', () => {
    const document = alignHole1OnPost1(piAndTouchScreen())
    expectSameAxis(axisOf(document, 'pi-1', 'hole1'), axisOf(document, 'screen-1', 'piMountingPost1'))
  })

  it('one commit places all four: hole2/3/4 land on the other three posts because the whole board moves', () => {
    const document = alignHole1OnPost1(piAndTouchScreen())
    // The board's holes are 58 mm apart in x and 49 mm in y, and so are the screen's
    // posts — but the posts are numbered column-first: post 2 is +y of post 1 and post 3
    // is +x. So hole2 (+x of hole1) sits on post 3 and hole3 (+y) on post 2.
    expectSameAxis(axisOf(document, 'pi-1', 'hole2'), axisOf(document, 'screen-1', 'piMountingPost3'))
    expectSameAxis(axisOf(document, 'pi-1', 'hole3'), axisOf(document, 'screen-1', 'piMountingPost2'))
    expectSameAxis(axisOf(document, 'pi-1', 'hole4'), axisOf(document, 'screen-1', 'piMountingPost4'))
  })

  it('snap z, mb → post top with outside-: mb’s min z equals the post’s max z — no gap, no penetration', () => {
    const document = snapMbOnPost1(alignHole1OnPost1(piAndTouchScreen()))
    const [mbMin] = partBoundsOf(document, 'pi-1', 'mb')
    const [, postMax] = partBoundsOf(document, 'screen-1', 'piMountingPost1')
    expect(mbMin[2]).toBeCloseTo(postMax[2], 6)
    // And the xy step survives the z step: a snap on z moves nothing in plan.
    expectSameAxis(axisOf(document, 'pi-1', 'hole1'), axisOf(document, 'screen-1', 'piMountingPost1'))
  })

  it('measures mb, not the whole Pi: the SD card ends up below the post top, not resting on it', () => {
    const document = snapMbOnPost1(alignHole1OnPost1(piAndTouchScreen()))
    const [sdMin] = partBoundsOf(document, 'pi-1', 'microsd')
    const [mbMin] = partBoundsOf(document, 'pi-1', 'mb')
    const [, postMax] = partBoundsOf(document, 'screen-1', 'piMountingPost1')
    // The bug: the whole Pi's lowest face (the SD card) went on the post top, leaving mb
    // 1.5 mm up. Now the card hangs below the top by exactly its depth under the board.
    expect(sdMin[2]).toBeLessThan(postMax[2])
    expect(postMax[2] - sdMin[2]).toBeCloseTo(mbMin[2] - sdMin[2], 6)
    expect(mbMin[2] - sdMin[2]).toBeGreaterThan(1)
  })

  it('the existing asymmetric case still works: a bare (whole) Pi against an addressed post', () => {
    const document = snapAlignParts(piAndTouchScreen(), {
      op: 'group.align',
      moving: 'pi-1',
      movingPieces: '',
      reference: 'screen-1',
      referencePieces: 'piMountingPost1',
      axes: 'xy',
    })
    const [piX, piY] = centreOf(document, 'pi-1')
    const post = axisOf(document, 'screen-1', 'piMountingPost1')
    expectSameAxis([piX, piY], post)
    // The case discriminates: the post is nowhere near the screen's own centre, so a
    // reference measured whole would have landed somewhere else entirely.
    const [screenX, screenY] = centreOf(document, 'screen-1')
    expect(Math.hypot(post[0] - screenX, post[1] - screenY)).toBeGreaterThan(10)
  })

  it('a stale pieces name on the moving side is an error, never a silent whole-body fallback', () => {
    const document = piAndTouchScreen()
    const before = centreOf(document, 'pi-1')
    expect(() =>
      snapAlignParts(document, {
        op: 'group.align',
        moving: 'pi-1',
        movingPieces: 'hole9',
        reference: 'screen-1',
        referencePieces: 'piMountingPost1',
        axes: 'xy',
      }),
    ).toThrow(/hole9/)
    const after = centreOf(document, 'pi-1')
    for (let axis = 0; axis < 3; axis += 1) expect(after[axis]).toBeCloseTo(before[axis], 6)
  })

  it('a stale pieces name on the reference side is an error too', () => {
    const document = piAndTouchScreen()
    expect(() =>
      snapAlignParts(document, {
        op: 'group.snap',
        moving: 'pi-1',
        movingPieces: 'mb',
        reference: 'screen-1',
        referencePieces: 'piMountingPost9',
        axes: 'z',
        orientation: 'outside-',
      }),
    ).toThrow(/piMountingPost9/)
  })

  it('a rotated moving body: hole1 still lands on post 1, and mb still rests on the post top', () => {
    const document = piAndTouchScreen()
    document.append(rotateRecord(document, 'pi-1', [0, 0, 90]), { origin: 'local' })
    alignHole1OnPost1(document)
    expectSameAxis(axisOf(document, 'pi-1', 'hole1'), axisOf(document, 'screen-1', 'piMountingPost1'))
    snapMbOnPost1(document)
    const [mbMin] = partBoundsOf(document, 'pi-1', 'mb')
    const [, postMax] = partBoundsOf(document, 'screen-1', 'piMountingPost1')
    expect(mbMin[2]).toBeCloseTo(postMax[2], 6)
    expectSameAxis(axisOf(document, 'pi-1', 'hole1'), axisOf(document, 'screen-1', 'piMountingPost1'))
  })
})
