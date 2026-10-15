// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The STL parser (`TODO/io-009`): binary and ASCII to `{ positions, indices }`, and every
 * hostile shape the Testing section names — a lying header count above all, which must be
 * refused before anything is allocated for it.
 */
import { afterEach, describe, expect, it } from 'vitest'

import { MESH_LIMITS } from '../meshAsset.js'
import { formatTriangleCount, parseStl, sniffStl } from './stl.js'
import { acceptAttribute, formatForName, parseMeshFile } from './index.js'
import { asciiBytes, asciiStl, binaryStl, cubeTriangles } from '../__fixtures__/stl.js'

const CUBE = cubeTriangles(10)

/** @param {any} result */
function expectRefused(result, pattern = /^Not a valid STL/) {
  expect(result.ok).toBe(false)
  expect(result.reason).toMatch(pattern)
}

describe('parseStl — happy paths', () => {
  it('reads a binary STL: one corner per vertex, in file order, normals ignored', () => {
    const result = parseStl(binaryStl(CUBE))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.format).toBe('binary')
    expect(result.triangleCount).toBe(12)
    expect(result.positions).toBeInstanceOf(Float32Array)
    expect(result.positions.length).toBe(12 * 9)
    expect(Array.from(result.positions.slice(0, 9))).toEqual([0, 0, 0, 0, 10, 0, 10, 10, 0])
    expect(result.indices).toBeInstanceOf(Uint32Array)
    expect(Array.from(result.indices)).toEqual(Array.from({ length: 36 }, (_, index) => index))
  })

  it('reads an ASCII STL to the same corners', () => {
    const binary = parseStl(binaryStl(CUBE))
    const ascii = parseStl(asciiStl(CUBE))
    expect(ascii.ok).toBe(true)
    if (!ascii.ok || !binary.ok) return
    expect(ascii.format).toBe('ascii')
    expect(Array.from(ascii.positions)).toEqual(Array.from(binary.positions))
    expect(ascii.triangleCount).toBe(12)
  })

  it('reads ASCII with CRLF line ends, exponents, signs and a multi-word solid name', () => {
    const result = parseStl(asciiStl(CUBE, { eol: '\r\n', name: 'my bracket v2 (final)', format: (value) => value.toExponential(3) }))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.positions[4]).toBeCloseTo(10, 6)
  })

  it('reads an ASCII file holding more than one solid', () => {
    const text = new TextDecoder().decode(asciiStl(CUBE.slice(0, 6), { name: 'a' })) + new TextDecoder().decode(asciiStl(CUBE.slice(6), { name: 'b' }))
    const result = parseStl(asciiBytes(text))
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.triangleCount).toBe(12)
  })

  it('reads a binary STL whose header begins with "solid" as binary — the length equation decides first', () => {
    const bytes = binaryStl(CUBE, { header: 'solid exported-by-a-tool-that-writes-solid-in-binary-headers' })
    expect(sniffStl(bytes)).toBe('binary')
    const result = parseStl(bytes)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.format).toBe('binary')
      expect(result.triangleCount).toBe(12)
    }
  })

  it('accepts -0 as a coordinate', () => {
    const triangles = cubeTriangles(10).map((triangle) => triangle.map((corner) => corner.map((value) => (value === 0 ? -0 : value))))
    const result = parseStl(binaryStl(/** @type {any} */ (triangles)))
    expect(result.ok).toBe(true)
  })
})

describe('parseStl — refusals, never throws', () => {
  /** @type {(() => void)[]} */
  const restore = []
  afterEach(() => {
    while (restore.length > 0) /** @type {() => void} */ (restore.pop())()
  })

  /**
   * Record every typed-array length the parser asks for, so a spec can assert it never sized
   * an allocation from an untrusted header.
   */
  function watchAllocations() {
    /** @type {number[]} */
    const lengths = []
    for (const name of /** @type {const} */ (['Float32Array', 'Float64Array', 'Uint32Array', 'Uint16Array', 'Uint8Array', 'ArrayBuffer'])) {
      const original = globalThis[name]
      globalThis[name] = /** @type {any} */ (
        new Proxy(original, {
          construct(target, args, newTarget) {
            if (typeof args[0] === 'number') lengths.push(args[0])
            return Reflect.construct(target, args, newTarget === globalThis[name] ? target : newTarget)
          },
        })
      )
      restore.push(() => {
        globalThis[name] = /** @type {any} */ (original)
      })
    }
    return lengths
  }

  it('refuses a header count of 0xFFFFFFFF without allocating for it', () => {
    const bytes = binaryStl([], { count: 0xffffffff })
    const lengths = watchAllocations()
    const result = parseStl(bytes)
    expectRefused(result)
    expect(result.ok ? '' : result.reason).toMatch(/4,294,967,295 triangles/)
    expect(Math.max(0, ...lengths)).toBeLessThan(1024)
  })

  it('refuses a header count that disagrees with the byte length', () => {
    expectRefused(parseStl(binaryStl(CUBE, { count: 13 })))
    expectRefused(parseStl(binaryStl(CUBE, { count: 11 })))
  })

  it('refuses a truncated binary file', () => {
    expectRefused(parseStl(binaryStl(CUBE).slice(0, 84 + 50 * 12 - 10)))
  })

  it('refuses a truncated ASCII file', () => {
    const text = new TextDecoder().decode(asciiStl(CUBE))
    expectRefused(parseStl(asciiBytes(text.slice(0, Math.floor(text.length / 2)))))
  })

  it('refuses an empty file', () => {
    const result = parseStl(new Uint8Array(0))
    expectRefused(result)
    expect(result.ok ? '' : result.reason).toMatch(/empty/)
  })

  it('refuses a text file that is not an STL', () => {
    expectRefused(parseStl(asciiBytes('hello, this is a shopping list\nmilk\neggs\n')))
    expectRefused(parseStl(asciiBytes(`${'not an stl at all. '.repeat(20)}`)))
    expectRefused(parseStl(asciiBytes('solid x\n  this is not a facet\nendsolid x\n')))
  })

  it('refuses NaN and Infinity coordinates, binary and ASCII', () => {
    const nan = cubeTriangles(10)
    nan[3][1][2] = Number.NaN
    expectRefused(parseStl(binaryStl(nan)), /finite/)
    const inf = cubeTriangles(10)
    inf[0][0][0] = Number.POSITIVE_INFINITY
    expectRefused(parseStl(binaryStl(inf)), /finite/)
    for (const token of ['nan', 'NaN', 'inf', '-Infinity', '1e999']) {
      const text = new TextDecoder().decode(asciiStl(CUBE)).replace('vertex 0 0 0', `vertex ${token} 0 0`)
      expectRefused(parseStl(asciiBytes(text)), /finite/)
    }
  })

  it('refuses a coordinate beyond the magnitude cap', () => {
    const far = cubeTriangles(10)
    far[0][0][0] = MESH_LIMITS.maxAbsCoordinate * 2
    expectRefused(parseStl(binaryStl(far)), /beyond/)
  })

  it('refuses a facet that is not a triangle', () => {
    const text = new TextDecoder().decode(asciiStl(CUBE)).replace('vertex 0 10 0', 'vertex 0 10 0\n      vertex 5 5 5')
    expectRefused(parseStl(asciiBytes(text)))
  })

  it('refuses a malformed ASCII number rather than reading it as 0', () => {
    const text = new TextDecoder().decode(asciiStl(CUBE)).replace('vertex 0 0 0', 'vertex 0x10 0 0')
    expectRefused(parseStl(asciiBytes(text)))
  })

  it(`refuses ${MESH_LIMITS.maxTriangles + 1} triangles — one past the cap — before reading them`, () => {
    // Zero-filled triangles: the count is checked before a single one is read.
    const bytes = new Uint8Array(84 + 50 * (MESH_LIMITS.maxTriangles + 1))
    new DataView(bytes.buffer).setUint32(80, MESH_LIMITS.maxTriangles + 1, true)
    const lengths = watchAllocations()
    const result = parseStl(bytes)
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toBe('Too many triangles: 250,001, limit 250 k')
    expect(Math.max(0, ...lengths)).toBeLessThan(1024)
  })

  it('stops an ASCII file at the triangle cap', () => {
    const result = parseStl(asciiStl(CUBE), { ...MESH_LIMITS, maxTriangles: 5 })
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toBe('Too many triangles: more than 5, limit 5')
  })

  it('refuses an over-long ASCII token instead of scanning it', () => {
    const text = new TextDecoder().decode(asciiStl(CUBE)).replace('vertex 0 0 0', `vertex ${'1'.repeat(5000)} 0 0`)
    expectRefused(parseStl(asciiBytes(text)))
  })

  it('never throws, whatever it is handed', () => {
    for (const input of [null, undefined, 'solid', 42, {}, [1, 2, 3], new Uint8Array([0xff])]) {
      expect(() => parseStl(/** @type {any} */ (input))).not.toThrow()
      expect(parseStl(/** @type {any} */ (input)).ok).toBe(false)
    }
  })
})

describe('formatTriangleCount', () => {
  it('groups thousands and shortens millions', () => {
    expect(formatTriangleCount(12)).toBe('12')
    expect(formatTriangleCount(12408)).toBe('12,408')
    expect(formatTriangleCount(1_200_000)).toBe('1.2 M')
  })
})

describe('the format registry', () => {
  it('chooses a parser by extension, case-insensitively', () => {
    expect(formatForName('bracket.STL')?.id).toBe('stl')
    expect(formatForName('bracket.stl')?.id).toBe('stl')
    expect(formatForName('bracket.obj')).toBeNull()
    expect(acceptAttribute()).toBe('.stl')
  })

  it('sniffs a file with no extension rather than trusting the name', () => {
    const result = parseMeshFile('scan', binaryStl(CUBE))
    expect(result.ok).toBe(true)
  })

  it('refuses an unsupported extension by naming what it takes', () => {
    const result = parseMeshFile('part.step', asciiBytes('ISO-10303-21;'))
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/STL/)
  })

  it('still refuses a text file renamed x.stl', () => {
    const result = parseMeshFile('x.stl', asciiBytes('just some notes'))
    expect(result.ok).toBe(false)
    expect(result.ok ? '' : result.reason).toMatch(/^Not a valid STL/)
  })
})
