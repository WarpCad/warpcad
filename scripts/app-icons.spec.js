// SPDX-License-Identifier: AGPL-3.0-or-later
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ICONS, encodeIco, fullBleed, manifestIcons } from './app-icons.mjs'

describe('manifestIcons', () => {
  it('lists the 192 px and 512 px icons Chromium needs before it offers Install', () => {
    const sizes = manifestIcons()
      .filter((icon) => !icon.purpose)
      .map((icon) => icon.sizes)
    expect(sizes).toEqual(['192x192', '512x512'])
  })
  it('marks exactly one icon maskable, and it is a full-bleed render', () => {
    const maskable = manifestIcons().filter((icon) => icon.purpose === 'maskable')
    expect(maskable).toHaveLength(1)
    expect(ICONS.find((icon) => icon.file === maskable[0].src)?.fullBleed).toBe(true)
  })
  it('uses relative paths, so the icons follow BASE_PATH', () => {
    for (const icon of manifestIcons()) expect(icon.src).not.toMatch(/^\//)
  })
})

describe('the committed icons in public/', () => {
  const pngSize = (file) => {
    const png = readFileSync(new URL(`../public/${file}`, import.meta.url))
    return [png.readUInt32BE(16), png.readUInt32BE(20)]
  }
  it.each(ICONS.map((icon) => [icon.file, icon.size]))('%s is %ipx square, as listed', (file, size) => {
    expect(pngSize(file)).toEqual([size, size])
  })
})

describe('fullBleed', () => {
  it('squares off both the tile and its clip path in the real mark', () => {
    const svg = readFileSync(new URL('../public/favicon.svg', import.meta.url), 'utf8')
    expect(svg.match(/ rx="112"/g)).toHaveLength(2)
    expect(fullBleed(svg)).not.toContain('rx="112"')
  })
  it('refuses a mark with no rounded tile rather than silently emitting it unchanged', () => {
    expect(() => fullBleed('<svg><rect width="512" height="512"/></svg>')).toThrow(/no rx="112"/)
  })
})

describe('encodeIco', () => {
  const png = (n) => new Uint8Array(n).fill(7)

  it('writes the ICONDIR header and one 16-byte entry per image', () => {
    const ico = encodeIco([{ size: 16, data: png(10) }, { size: 32, data: png(20) }])
    expect(ico.readUInt16LE(0)).toBe(0)
    expect(ico.readUInt16LE(2)).toBe(1)
    expect(ico.readUInt16LE(4)).toBe(2)
    expect(ico.length).toBe(6 + 2 * 16 + 10 + 20)
  })
  it('points each entry at its own PNG bytes', () => {
    const ico = encodeIco([{ size: 16, data: png(10) }, { size: 48, data: png(20) }])
    expect([ico.readUInt8(6), ico.readUInt32LE(6 + 8), ico.readUInt32LE(6 + 12)]).toEqual([16, 10, 38])
    expect([ico.readUInt8(22), ico.readUInt32LE(22 + 8), ico.readUInt32LE(22 + 12)]).toEqual([48, 20, 48])
  })
  it('stores 256 px as 0, the format’s spelling of 256', () => {
    expect(encodeIco([{ size: 256, data: png(1) }]).readUInt8(6)).toBe(0)
  })
  it('rejects a size the format cannot record', () => {
    expect(() => encodeIco([{ size: 512, data: png(1) }])).toThrow(RangeError)
  })
})
