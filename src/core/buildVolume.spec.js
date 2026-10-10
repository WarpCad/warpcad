// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest'

import { DEFAULT_BUILD_VOLUME, buildVolumeVector, fitVerdict, normalizeBuildVolume, sameBuildVolume } from './buildVolume.js'
import { createDocument } from './document.js'
import { parseProject, serializeProject, ProjectFormatError } from './project.js'

describe('build volume — the value', () => {
  it('defaults to 220 × 220 × 250 mm, width/depth/height', () => {
    expect(DEFAULT_BUILD_VOLUME).toEqual({ widthMm: 220, depthMm: 220, heightMm: 250 })
    expect(Object.isFrozen(DEFAULT_BUILD_VOLUME)).toBe(true)
    expect(buildVolumeVector({ widthMm: 180, depthMm: 190, heightMm: 200 })).toEqual([180, 190, 200])
  })

  it('normalises a valid volume and refuses anything that is not three positive millimetre values', () => {
    expect(normalizeBuildVolume({ widthMm: 256, depthMm: 256, heightMm: 256 })).toEqual({
      widthMm: 256,
      depthMm: 256,
      heightMm: 256,
    })
    expect(() => normalizeBuildVolume({ widthMm: 0, depthMm: 220, heightMm: 250 })).toThrow(/widthMm/)
    expect(() => normalizeBuildVolume({ widthMm: 220, depthMm: -1, heightMm: 250 })).toThrow(/depthMm/)
    expect(() => normalizeBuildVolume({ widthMm: 220, depthMm: 220 })).toThrow(/heightMm/)
    expect(() => normalizeBuildVolume(null)).toThrow(/build volume/)
    expect(() => normalizeBuildVolume({ widthMm: 1e9, depthMm: 220, heightMm: 250 })).toThrow(/widthMm/)
    expect(sameBuildVolume(DEFAULT_BUILD_VOLUME, { widthMm: 220, depthMm: 220, heightMm: 250 })).toBe(true)
  })
})

describe('fitVerdict — fits, fits after turning onto a face, or too large by N mm', () => {
  it('fits as placed', () => {
    const verdict = fitVerdict([100, 50, 20], DEFAULT_BUILD_VOLUME)
    expect(verdict.verdict).toBe('fits')
    expect(verdict.overByMm).toBe(0)
    expect(verdict.label).toBe('fits')
  })

  it('fits only after rotating onto a face, and says which way round', () => {
    // 230 mm is longer than the bed's 220 mm in X and Y, but stood on end it is under the
    // 250 mm height.
    const verdict = fitVerdict([230, 20, 20], DEFAULT_BUILD_VOLUME)
    expect(verdict.verdict).toBe('fits-rotated')
    expect(verdict.orientation).toMatch(/X axis vertical/)
    expect(verdict.label).toMatch(/^fits /)
  })

  it('too large every way round reports by how much, in the best orientation', () => {
    // 300 mm stood up is 50 mm over the 250 mm height — the least it can be over by.
    const verdict = fitVerdict([300, 20, 20], DEFAULT_BUILD_VOLUME)
    expect(verdict.verdict).toBe('too-large')
    expect(verdict.overByMm).toBeCloseTo(50, 9)
    expect(verdict.label).toBe('too large by 50 mm')
    // 334 × 30 × 30 on the default volume: 84 mm over — the spec's own example number.
    expect(fitVerdict([334, 30, 30], DEFAULT_BUILD_VOLUME).label).toBe('too large by 84 mm')
  })

  it('judges against the volume it is given, not a hidden default', () => {
    expect(fitVerdict([150, 150, 150], { widthMm: 120, depthMm: 120, heightMm: 120 }).verdict).toBe('too-large')
  })
})

describe('build volume — project state', () => {
  it('a new document has the default; setting it is a version bump but not an undo step', () => {
    const document = createDocument()
    expect(document.buildVolume()).toEqual(DEFAULT_BUILD_VOLUME)
    const before = document.version
    document.setBuildVolume({ widthMm: 256, depthMm: 256, heightMm: 256 }, { origin: 'local' })
    expect(document.buildVolume()).toEqual({ widthMm: 256, depthMm: 256, heightMm: 256 })
    expect(document.version).toBe(before + 1)
    expect(document.canUndo()).toBe(false)
    expect(() => document.setBuildVolume({ widthMm: 256, depthMm: 256, heightMm: 256 }, /** @type {any} */ ({}))).toThrow(
      /origin/
    )
  })

  it('round-trips through the state line, and the default is never written', () => {
    const document = createDocument()
    document.append({ id: 'cube', op: 'primitive.cuboid', name: 'Cube 1', params: { size: [10, 10, 10] } }, { origin: 'local' })
    const plain = serializeProject(document)
    expect(plain).not.toContain('buildVolume')

    document.setBuildVolume({ widthMm: 180, depthMm: 180, heightMm: 180 }, { origin: 'local' })
    const text = serializeProject(document)
    expect(text).toContain('"buildVolume":{"widthMm":180,"depthMm":180,"heightMm":180}')
    const parsed = parseProject(text)
    expect(parsed.buildVolume).toEqual({ widthMm: 180, depthMm: 180, heightMm: 180 })
    expect(parseProject(plain).buildVolume).toEqual(DEFAULT_BUILD_VOLUME)

    const reopened = createDocument()
    reopened.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, { buildVolume: parsed.buildVolume })
    expect(reopened.buildVolume()).toEqual({ widthMm: 180, depthMm: 180, heightMm: 180 })
  })

  it('a malformed build volume in a file is refused, not repaired', () => {
    const bad =
      '{"id":"cube","op":"primitive.cuboid","params":{"size":[1,1,1]}}\n' +
      '{"warpcad":"project-state","version":1,"buildVolume":{"widthMm":"wide","depthMm":220,"heightMm":250}}\n'
    expect(() => parseProject(bad)).toThrow(ProjectFormatError)
    expect(() => parseProject(bad)).toThrow(/buildVolume/)
  })
})
