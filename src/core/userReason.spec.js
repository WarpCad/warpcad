// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { plainIdsIn, plainRecordId, userReason } from './userReason.js'

describe('userReason (TODO/ui-129)', () => {
  it('words a fillet radius past the extent as a limit, not as an op id', () => {
    expect(userReason("modify.filletRim: radius 45mm must be narrower than the solid's 40mm extent along the axis")).toBe(
      'A 45 mm radius is too large for this 40 mm part. Use a radius smaller than 40 mm.',
    )
    expect(userReason("modify.chamferRim: radius -45mm must be narrower than the solid's 40mm extent along the axis")).toMatch(/^A 45 mm radius/)
  })

  it('reads through the document wrapper around a rejected record', () => {
    expect(
      userReason("document.append: modify.filletRim could not be applied — modify.filletRim: radius 45mm must be narrower than the solid's 40mm extent along the axis"),
    ).toBe('A 45 mm radius is too large for this 40 mm part. Use a radius smaller than 40 mm.')
    expect(userReason('document.append: primitive.cylinder could not be applied — primitive.cylinder: height must be a positive number of millimetres, got 0')).toBe(
      'Height must be more than 0 mm.',
    )
  })

  it('words a size that must be more than zero, for a plain field and an indexed one', () => {
    expect(userReason('primitive.cylinder: height must be a positive number of millimetres, got 0')).toBe('Height must be more than 0 mm.')
    expect(userReason('primitive.cuboid: size[0] must be a positive number of millimetres, got -5')).toBe('Size X must be more than 0 mm.')
    expect(userReason('primitive.cuboid: size[2] must be a positive number of millimetres, got NaN')).toBe('Size Z must be more than 0 mm.')
    expect(userReason('primitive.tube: cornerRadius must be a positive number of millimetres, got 0')).toBe('Corner radius must be more than 0 mm.')
  })

  it('words a step that points at an already-replaced body without record ids', () => {
    const raw =
      'supersedes "cuboid-k3f5xa-1", which has itself already been superseded by "cuboid-k3f5xa-1-move-k3f5xa-4" — forking a lineage would put two live representations of one body on screen'
    const plain = userReason(`can't be built: ${raw}`)
    expect(plain).not.toMatch(/cuboid-|supersed|lineage/)
    expect(plain).toMatch(/another step already changed the part/)
    expect(userReason(raw)).toBe(plain)
  })

  it('does not claim the move came after the rollback (TODO/ui-154)', () => {
    // The move lands at the marker, so it sits above the rollback marker in History: "after you
    // rolled back" contradicted the row the reader could see.
    const plain = userReason(
      'supersedes "cuboid-k3f5xa-1", which has itself already been superseded by "cuboid-k3f5xa-1-move-k3f5xa-4" — forking a lineage would put two live representations of one body on screen',
    )
    expect(plain).not.toMatch(/after you rolled back|a later step/i)
    expect(plain).toMatch(/Re-link/)
  })

  it('says what Re-link does, not where the move happened (TODO/ui-155)', () => {
    // The move is listed above the broken step and the marker sits right above it, so "a move you made
    // while you were rolled back" could not be squared with the order on screen.
    const plain = userReason(
      'supersedes "cuboid-k3f5xa-1", which has itself already been superseded by "cuboid-k3f5xa-1-move-k3f5xa-4" — forking a lineage would put two live representations of one body on screen',
    )
    expect(plain).toMatch(/Re-link points this step at the part's new position/)
    expect(plain).not.toMatch(/rolled back|while you|a move you made/i)
  })

  it('returns an unknown message untouched, and never throws or empties', () => {
    expect(userReason('something the kernel says that this does not know')).toBe('something the kernel says that this does not know')
    expect(userReason('')).toBe('')
    expect(userReason(null)).toBe('')
    expect(userReason(new Error('x: y'))).toBe('x: y')
  })
})

describe('plainRecordId (TODO/ui-129)', () => {
  it('drops the project tag and keeps the counter', () => {
    expect(plainRecordId('cuboid-k3f5xa-1')).toBe('Cuboid 1')
    expect(plainRecordId('cylinder-ab12cd-12')).toBe('Cylinder 12')
  })

  it('reads a derived step as its action on its source', () => {
    expect(plainRecordId('cuboid-k3f5xa-1-move-k3f5xa-4')).toBe('Move of Cuboid 1 (4)')
  })

  it('leaves anything that is not a replica id alone', () => {
    expect(plainRecordId('bolt-1')).toBe('bolt-1')
    expect(plainRecordId('kit-phone-12')).toBe('kit-phone-12')
    expect(plainRecordId('')).toBe('')
  })

  it('tidies every id inside a sentence and nothing else', () => {
    expect(plainIdsIn('Moved cuboid-k3f5xa-1 by 5 mm, then cuboid-k3f5xa-1-move-k3f5xa-4 to z 3')).toBe(
      'Moved Cuboid 1 by 5 mm, then Move of Cuboid 1 (4) to z 3',
    )
    expect(plainIdsIn('Snapped kit-phone-12 to the grid')).toBe('Snapped kit-phone-12 to the grid')
    expect(plainIdsIn('')).toBe('')
  })
})
