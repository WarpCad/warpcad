// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The zip reader a 3MF needs (`TODO/io-024`): entries found through the **central directory**
 * (a writer may leave local-header sizes zero and use data descriptors), stored and deflated
 * methods, every offset bounds-checked, every CRC verified, encryption and zip64 refused, and a
 * deflate bomb stopped at the limit. `createZip`/`readZip` (Export → Print pieces) are unchanged.
 */
import { describe, expect, it } from 'vitest'

import { ZIP_LIMITS, createZip, listZipEntries, readZip, readZipEntry } from './zip.js'
import { buildZip, deflateRaw } from '../io/__fixtures__/threeMf.js'

const text = (/** @type {Uint8Array} */ bytes) => new TextDecoder().decode(bytes)

/** @param {Uint8Array} zip */
function entries(zip) {
  const listed = listZipEntries(zip)
  if (!listed.ok) throw new Error(listed.reason)
  return listed.entries
}

describe('listZipEntries / readZipEntry', () => {
  it('reads a deflated and a stored entry by name', async () => {
    const zip = await buildZip([
      { name: '3D/3dmodel.model', data: '<model/>'.repeat(100) },
      { name: 'notes.txt', data: 'hello', method: 0 },
    ])
    const listed = entries(zip)
    expect([...listed.keys()]).toEqual(['3D/3dmodel.model', 'notes.txt'])
    const model = await readZipEntry(zip, /** @type {any} */ (listed.get('3D/3dmodel.model')), 1 << 20)
    expect(model.ok && text(model.bytes)).toBe('<model/>'.repeat(100))
    const notes = await readZipEntry(zip, /** @type {any} */ (listed.get('notes.txt')), 1 << 20)
    expect(notes.ok && text(notes.bytes)).toBe('hello')
  })

  it('reads an entry whose local header has zero sizes and a data descriptor', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'x'.repeat(5000), dataDescriptor: true }])
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('a.model')), 1 << 20)
    expect(read.ok && read.bytes.length).toBe(5000)
  })

  it('still reads what createZip writes', async () => {
    const zip = createZip([{ name: 'one.stl', bytes: new Uint8Array([1, 2, 3]) }])
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('one.stl')), 100)
    expect(read.ok && [...read.bytes]).toEqual([1, 2, 3])
    expect(readZip(zip)[0].name).toBe('one.stl')
  })

  it('refuses a file that is not a zip, and an empty one', () => {
    expect(listZipEntries(new TextEncoder().encode('just some notes'))).toEqual({ ok: false, reason: 'it is not a zip package' })
    expect(listZipEntries(new Uint8Array(0)).ok).toBe(false)
  })

  it('refuses a truncated file', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc'.repeat(1000) }])
    const cut = zip.slice(0, zip.length - 30)
    expect(listZipEntries(cut).ok).toBe(false)
    // Cut inside the data: the directory is intact but points past what is there.
    const listed = entries(zip)
    const entry = /** @type {any} */ (listed.get('a.model'))
    const short = await readZipEntry(zip.slice(0, 40), entry, 1 << 20)
    expect(short).toEqual({ ok: false, reason: expect.stringMatching(/truncated|past the end/) })
  })

  it('refuses a central-directory offset past the end', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc' }])
    const view = new DataView(zip.buffer)
    view.setUint32(zip.length - 22 + 16, zip.length + 1000, true)
    expect(listZipEntries(zip)).toEqual({ ok: false, reason: expect.stringMatching(/central directory/) })
  })

  it('refuses a local-header offset past the end', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc' }])
    const listed = entries(zip)
    const entry = { .../** @type {any} */ (listed.get('a.model')), localOffset: zip.length + 5 }
    expect(await readZipEntry(zip, entry, 100)).toEqual({ ok: false, reason: expect.stringMatching(/past the end/) })
  })

  it('refuses an encrypted entry and a zip64 package', async () => {
    const encrypted = await buildZip([{ name: 'a.model', data: 'abc', encrypted: true }])
    expect(listZipEntries(encrypted)).toEqual({ ok: false, reason: expect.stringMatching(/encrypted/) })
    const zip64 = await buildZip([{ name: 'a.model', data: 'abc' }], { zip64: true })
    expect(listZipEntries(zip64)).toEqual({ ok: false, reason: expect.stringMatching(/zip64/i) })
  })

  it('refuses a compression method other than stored or deflated', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc', method: 12, raw: new Uint8Array([1, 2, 3]) }])
    expect(listZipEntries(zip)).toEqual({ ok: false, reason: expect.stringMatching(/compression method 12/) })
  })

  it('refuses a name listed twice', async () => {
    const zip = await buildZip([
      { name: 'a.model', data: 'one' },
      { name: 'a.model', data: 'two' },
    ])
    expect(listZipEntries(zip)).toEqual({ ok: false, reason: expect.stringMatching(/twice/) })
  })

  it('refuses more entries than the cap', async () => {
    const zip = await buildZip([{ name: 'a', data: '' , method: 0 }, { name: 'b', data: '', method: 0 }])
    expect(listZipEntries(zip, { maxEntries: 1 })).toEqual({ ok: false, reason: expect.stringMatching(/more than 1 file/) })
    expect(ZIP_LIMITS.maxEntries).toBeGreaterThanOrEqual(1000)
  })

  it('refuses a CRC mismatch', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc', crc: 12345 }])
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('a.model')), 100)
    expect(read).toEqual({ ok: false, reason: expect.stringMatching(/a\.model.*(CRC|damaged)/) })
  })

  it('refuses an entry whose inflated size disagrees with the directory', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abcdef', uncompressedSize: 3 }])
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('a.model')), 100)
    expect(read.ok).toBe(false)
  })

  it('refuses corrupt deflate data in words', async () => {
    const zip = await buildZip([{ name: 'a.model', data: 'abc', raw: new Uint8Array([0xff, 0xff, 0xff]) }])
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('a.model')), 100)
    expect(read).toEqual({ ok: false, reason: expect.stringMatching(/a\.model/) })
  })

  it('stops a deflate bomb at the limit, without inflating the rest', async () => {
    // 256 MiB of zeros deflates to about 256 KB. The limit is 1 MiB.
    const big = 256 * 1024 * 1024
    const chunk = new Uint8Array(1024 * 1024)
    const stream = new Blob(Array.from({ length: 256 }, () => chunk)).stream().pipeThrough(new CompressionStream('deflate-raw'))
    const raw = new Uint8Array(await new Response(stream).arrayBuffer())
    // Declared honestly small, so only the running count can catch it.
    const zip = await buildZip([{ name: 'bomb.model', data: new Uint8Array(0), raw, uncompressedSize: 10, crc: 0 }])
    const started = performance.now()
    const read = await readZipEntry(zip, /** @type {any} */ (entries(zip).get('bomb.model')), 1024 * 1024)
    const elapsed = performance.now() - started
    expect(read).toEqual({ ok: false, reason: expect.stringMatching(/larger than/) })
    // Inflating all 256 MiB takes far longer than stopping after the first.
    expect(elapsed).toBeLessThan(1000)
    expect(raw.length).toBeLessThan(big / 100)
  })

  it('refuses a declared size over the limit before inflating anything', async () => {
    const raw = await deflateRaw(new Uint8Array(10))
    const zip = await buildZip([{ name: 'a.model', data: new Uint8Array(10), raw, uncompressedSize: 50 * 1024 * 1024 }])
    expect(await readZipEntry(zip, /** @type {any} */ (entries(zip).get('a.model')), 1024)).toEqual({
      ok: false,
      reason: expect.stringMatching(/larger than/),
    })
  })
})
