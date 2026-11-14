// SPDX-License-Identifier: AGPL-3.0-or-later
// Guards the design tokens (`TODO/ui-112`): the layered files, the scales, that every `var(--x)` names
// something defined (this is what would have caught `--tap-target`), that fallbacks are not a second
// copy of a value, and that the first-paint literals outside CSS equal `--surface-0`.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { REPO_ROOT, TOKEN_FILES, declarationsOf, readTokenFile, rel, resolveToken, sourceFiles, splitLightMedia, surface0 } from './cssTokens.js'
import * as breakpoints from './breakpoints.js'

/** Every token name the app had before the split. Renaming one is a different task. */
const EXISTING_TOKENS = [
  '--layout-safe-top', '--layout-safe-right', '--layout-safe-bottom', '--layout-safe-left',
  '--surface-0', '--surface-1', '--surface-2', '--surface-glass', '--border', '--border-strong',
  '--text-1', '--text-2', '--text-3', '--accent', '--accent-contrast', '--axis-x', '--axis-y',
  '--snap-guide', '--accent-secondary', '--hover-highlight', '--role-moving', '--role-target',
  '--sketch-stroke', '--danger', '--warn', '--radius-sm', '--radius-md', '--radius-lg',
  '--tap', '--tap-compact', '--shadow-overlay', '--font', '--font-mono',
]

/** The colour tokens that differ by theme: both theme files must define every one. */
const THEMED = [
  '--surface-0', '--surface-1', '--surface-2', '--surface-glass', '--border', '--border-strong',
  '--text-1', '--text-2', '--text-3', '--accent', '--accent-contrast', '--axis-x', '--axis-y',
  '--snap-guide', '--accent-secondary', '--hover-highlight', '--role-moving', '--role-target',
  '--sketch-stroke', '--danger', '--warn', '--shadow-overlay', '--scrim', '--overlay-drop',
]

const SCALES = [
  '--space-1', '--space-8', '--font-size-1', '--font-size-7', '--radius-1', '--radius-3', '--duration-1', '--duration-2',
  '--text-size-2xs', '--text-size-xs', '--text-size-sm', '--text-size-md', '--text-size-lg', '--text-size-xl', '--text-size-2xl',
  '--weight-regular', '--weight-medium', '--weight-bold', '--text-size-title', '--text-size-display', '--z-sheet',
  '--z-canvas-overlay', '--z-panel', '--z-chat', '--z-popover', '--z-modal', '--z-help', '--z-toast',
  '--radius-pill', '--radius-round', '--duration-fast', '--duration-base', '--ease-standard',
  '--scrim', '--focus-ring', '--shadow-popover',
]

const all = new Map()
for (const f of TOKEN_FILES) for (const [k, v] of declarationsOf(readTokenFile(f))) all.set(k, v)

const srcRoot = `${REPO_ROOT}src`
const files = sourceFiles(srcRoot, ['.vue', '.js', '.css']).filter((f) => !f.endsWith('cssTokens.js'))
const text = new Map(files.map((f) => [f, readFileSync(f, 'utf-8')]))

/** Names defined anywhere under src: a CSS declaration, or a quoted key a script sets. */
function definedNames() {
  const out = new Set()
  for (const t of text.values()) {
    const bare = t.replace(/\/\*[\s\S]*?\*\//g, '')
    for (const m of bare.matchAll(/(--[a-z][a-z0-9-]*)\s*:/gi)) out.add(m[1])
    for (const m of bare.matchAll(/['"`](--[a-z][a-z0-9-]*)['"`]/gi)) out.add(m[1])
  }
  return out
}

/**
 * Every `var(--x` use, with its balanced fallback text ('' when there is none).
 * @param {string} src
 * @returns {{ name: string, fallback: string }[]}
 */
function varUses(src) {
  const bare = src.replace(/\/\*[\s\S]*?\*\//g, '')
  /** @type {{ name: string, fallback: string }[]} */
  const uses = []
  for (const m of bare.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)\s*(,)?/gi)) {
    let fallback = ''
    if (m[2]) {
      let depth = 1
      let i = m.index + m[0].length
      const from = i
      for (; i < bare.length && depth > 0; i++) {
        if (bare[i] === '(') depth++
        else if (bare[i] === ')') depth--
      }
      fallback = bare.slice(from, i - 1).trim()
    }
    uses.push({ name: m[1], fallback })
  }
  return uses
}

describe('token files', () => {
  it.each(TOKEN_FILES)('src/styles/%s exists and is non-empty', (f) => {
    expect(readTokenFile(f).trim().length).toBeGreaterThan(0)
  })

  it('index.css imports the layers in order (utilities before the reset), reset last', () => {
    const imports = [...readTokenFile('index.css').matchAll(/@import\s+['"]\.\/([^'"]+)['"]/g)].map((m) => m[1])
    expect(imports).toEqual(['base.css', 'semantic.css', 'themes/dark.css', 'themes/light.css', 'utilities.css', 'reset.css'])
  })

  it('keeps every existing token name', () => {
    expect(EXISTING_TOKENS.filter((n) => !all.has(n))).toEqual([])
  })

  it('defines every new scale', () => {
    expect(SCALES.filter((n) => !all.has(n))).toEqual([])
  })

  it('puts the reset in reset.css and no rule in the token layers', () => {
    expect(readTokenFile('reset.css')).toMatch(/box-sizing:\s*border-box/)
    expect(readTokenFile('reset.css')).toMatch(/#app/)
    for (const f of ['base.css', 'semantic.css', 'themes/dark.css', 'themes/light.css']) {
      expect(readTokenFile(f).replace(/\/\*[\s\S]*?\*\//g, '')).not.toMatch(/(^|\})\s*(html|body|\*|#app)\b/)
    }
  })
})

describe('themes', () => {
  const dark = declarationsOf(readTokenFile('themes/dark.css'))
  const light = splitLightMedia(readTokenFile('themes/light.css')).light

  it.each(THEMED)('%s is defined in both themes', (name) => {
    expect(dark.has(name)).toBe(true)
    expect(light.has(name)).toBe(true)
  })

  it('theme files take their colours from base values, not literals', () => {
    for (const [name, value] of [...dark, ...light]) {
      if (name === '--shadow-overlay' || name === '--shadow-popover') continue
      expect(value, name).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i)
    }
  })

  it("light.css states the same set under [data-theme='light'] as under the media query", () => {
    const css = readTokenFile('themes/light.css')
    const forced = css.slice(css.indexOf(":root[data-theme='light']"))
    expect(css).toContain(':root:not([data-theme])')
    expect([...declarationsOf(forced)]).toEqual([...light])
  })

  it("dark.css answers to [data-theme='dark'] as well as the default", () => {
    expect(readTokenFile('themes/dark.css')).toMatch(/:root,\s*:root\[data-theme='dark'\]\s*\{/)
  })

  it('--scrim is a dimming colour in both themes', () => {
    expect(resolveToken('--scrim', new Map([...all, ...dark]))).toMatch(/rgba\(0,\s*0,\s*0,\s*0?\.5\)/)
    expect(resolveToken('--scrim', new Map([...all, ...light]))).toBeDefined()
  })
})

describe('layers', () => {
  it('states the tier rule once, in semantic.css', () => {
    expect(readTokenFile('semantic.css')).toMatch(/backdrop[\s\S]{0,200}frame|frame[\s\S]{0,200}backdrop/i)
  })

  it('orders the tiers from canvas overlay up to toast', () => {
    const order = ['--z-canvas-overlay', '--z-panel', '--z-chat', '--z-popover', '--z-modal', '--z-help', '--z-toast']
    const nums = order.map((n) => Number(all.get(n)))
    expect(nums.every(Number.isFinite)).toBe(true)
    expect([...nums].sort((a, b) => a - b)).toEqual(nums)
    expect(new Set(nums).size).toBe(nums.length)
  })
})

describe('breakpoints', () => {
  it('exports the three widths and matches the comment block in semantic.css', () => {
    expect(breakpoints.BREAKPOINT_PHONE_COMPACT).toBe(480)
    expect(breakpoints.BREAKPOINT_PHONE).toBe(640)
    expect(breakpoints.BREAKPOINT_WIDE_HEADER).toBe(1100)
    const css = readTokenFile('semantic.css')
    for (const px of [480, 640, 1100]) expect(css).toContain(`${px}px`)
  })

  it('AiHeaderEntry and TraceTool read their queries from breakpoints.js', () => {
    for (const f of ['ai/AiHeaderEntry.vue', 'sketch/TraceTool.vue']) {
      const src = readFileSync(`${srcRoot}/components/${f}`, 'utf-8')
      expect(src, f).toMatch(/styles\/breakpoints\.js/)
      expect(src, f).not.toMatch(/\(\s*(max|min)-width:\s*\d+px\s*\)/)
    }
  })
})

describe('every var(--x) names something defined', () => {
  it('has no use of an undefined custom property', () => {
    const defined = new Set([...definedNames(), ...all.keys()])
    const bad = []
    for (const [f, t] of text) {
      for (const u of varUses(t)) if (!defined.has(u.name)) bad.push(`${rel(f)}: ${u.name}`)
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('has no fallback that is a literal copy of a token value', () => {
    const tokens = new Set(all.keys())
    const bad = []
    for (const [f, t] of text) {
      for (const u of varUses(t)) {
        if (tokens.has(u.name) && u.fallback) bad.push(`${rel(f)}: var(${u.name}, ${u.fallback})`)
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })

  it('names every script-set or locally defined variable with the --layout- prefix or a local allowlist', () => {
    const LOCAL = new Set(['--marker-color'])
    const tokens = new Set(all.keys())
    const bad = []
    for (const [f, t] of text) {
      if (f.includes('/styles/')) continue
      const bare = t.replace(/\/\*[\s\S]*?\*\//g, '')
      for (const m of bare.matchAll(/['"`](--[a-z][a-z0-9-]*)['"`]\s*:/gi)) {
        if (!m[1].startsWith('--layout-') && !LOCAL.has(m[1]) && !tokens.has(m[1])) bad.push(`${rel(f)}: ${m[1]}`)
      }
      for (const m of bare.matchAll(/(?:^|[;{\s])(--[a-z][a-z0-9-]*)\s*:/gim)) {
        if (!m[1].startsWith('--layout-') && !LOCAL.has(m[1]) && !tokens.has(m[1])) bad.push(`${rel(f)}: ${m[1]}`)
      }
    }
    expect([...new Set(bad)]).toEqual([])
  })
})

describe('first-paint copies of --surface-0', () => {
  const { dark, light } = surface0()
  const indexHtml = readFileSync(`${REPO_ROOT}index.html`, 'utf-8')
  const viteConfig = readFileSync(`${REPO_ROOT}vite.config.js`, 'utf-8')

  it('index.html paints the dark value, and the light value under prefers-color-scheme: light', () => {
    expect(dark).toMatch(/^#[0-9a-f]{6}$/)
    expect(light).toMatch(/^#[0-9a-f]{6}$/)
    const style = indexHtml.match(/<style>([\s\S]*?)<\/style>/i)?.[1] ?? ''
    const plain = style.replace(/@media[\s\S]*$/, '')
    expect(plain).toMatch(new RegExp(`background:\\s*${dark}\\s*;`, 'i'))
    const media = style.match(/@media\s*\(\s*prefers-color-scheme:\s*light\s*\)\s*\{([\s\S]*)\}\s*$/i)
    expect(media).not.toBeNull()
    expect(media?.[1]).toMatch(new RegExp(`background:\\s*${light}\\s*;`, 'i'))
  })

  it('index.html names the token in a comment next to the literals', () => {
    expect(indexHtml).toMatch(/<!--[\s\S]*--surface-0[\s\S]*?-->\s*<style>/)
  })

  it('the manifest background and theme colours equal it, with a comment naming the token', () => {
    const bg = viteConfig.match(/background_color:\s*'(#[0-9a-f]{6})'/i)
    const theme = viteConfig.match(/theme_color:\s*'(#[0-9a-f]{6})'/i)
    expect(bg?.[1].toLowerCase()).toBe(dark)
    expect(theme?.[1].toLowerCase()).toBe(dark)
    expect(viteConfig).toMatch(/`--surface-0`[\s\S]{0,300}background_color/)
  })
})
