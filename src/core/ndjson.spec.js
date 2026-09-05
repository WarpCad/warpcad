import { describe, expect, it } from 'vitest'

import { parseNdjson, serializeNdjson } from './ndjson.js'

describe('parseNdjson', () => {
  it('parses one JSON object per line', () => {
    const text = '{"op":"a"}\n{"op":"b"}\n'
    const { records, errors } = parseNdjson(text)
    expect(records).toEqual([{ op: 'a' }, { op: 'b' }])
    expect(errors).toEqual([])
  })

  it('skips blank lines', () => {
    const text = '{"op":"a"}\n\n\n{"op":"b"}\n'
    const { records } = parseNdjson(text)
    expect(records).toEqual([{ op: 'a' }, { op: 'b' }])
  })

  it('works without a trailing newline', () => {
    const { records } = parseNdjson('{"op":"a"}')
    expect(records).toEqual([{ op: 'a' }])
  })

  it('returns an empty array for empty input', () => {
    expect(parseNdjson('').records).toEqual([])
    expect(parseNdjson('\n\n').records).toEqual([])
  })

  it('reports a malformed line rather than throwing, and still parses the rest', () => {
    const text = '{"op":"a"}\nnot json at all\n{"op":"b"}\n'
    const { records, errors } = parseNdjson(text)
    expect(records).toEqual([{ op: 'a' }, { op: 'b' }])
    expect(errors).toHaveLength(1)
    expect(errors[0].line).toBe(2)
    expect(errors[0].message).toMatch(/json/i)
  })

  it('never executes a malicious line — a JS expression is reported as invalid JSON, not evaluated', () => {
    const text = '{"op":"a"}\nglobalThis.PWNED = true\n'
    const { records, errors } = parseNdjson(text)
    expect(records).toEqual([{ op: 'a' }])
    expect(errors).toHaveLength(1)
    expect(/** @type {any} */ (globalThis).PWNED).toBeUndefined()
  })
})

describe('serializeNdjson', () => {
  it('writes one JSON line per record, newline-terminated', () => {
    expect(serializeNdjson([{ op: 'a' }, { op: 'b' }])).toBe('{"op":"a"}\n{"op":"b"}\n')
  })

  it('serializes an empty array to an empty string', () => {
    expect(serializeNdjson([])).toBe('')
  })
})

describe('round trip', () => {
  it('parse -> serialize -> parse produces an identical array', () => {
    const records = [
      { id: 'a7f3', op: 'primitive.cuboid', params: { size: [40, 20, 10] }, name: 'case' },
      { id: 'b112', op: 'hardware.bolt', params: { spec: 'm10 hex', length: 20 }, name: 'bolt1' },
      { id: 'c9a0', op: 'transform.translate', params: { vector: [0, 0, 14] }, target: 'b112' },
      { id: 'e558', op: 'boolean.subtract', params: {}, target: 'a7f3', operands: ['b112'] },
    ]
    const once = parseNdjson(serializeNdjson(records)).records
    expect(once).toEqual(records)
    const twice = parseNdjson(serializeNdjson(once)).records
    expect(twice).toEqual(once)
  })
})
