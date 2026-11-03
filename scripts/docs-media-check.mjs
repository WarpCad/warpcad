// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Pure logic behind the docs-media guard (`e2e/docs-media.spec.js`, `TODO/docs-007`): which
// images the Markdown pages reference, and whether every picture on disk is referenced,
// regenerable by a docs spec, and (for GIFs) recorded in `docs/media/manifest.json`.
// No filesystem access here so it is unit-testable; the Playwright guard does the reading.

/**
 * @typedef {{ file: string, alt: string, target: string, line: number }} ImageRef
 * @typedef {{ alt: string, target: string, line: number }} PageImage
 */

const IMAGE_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g

/**
 * Local image references in one Markdown page (remote/data URLs, fenced code and inline code skipped).
 *
 * @param {string} markdown
 * @returns {PageImage[]}
 */
export function findImageRefs(markdown) {
  /** @type {PageImage[]} */
  const refs = []
  let fenced = false
  markdown.split('\n').forEach((text, i) => {
    if (/^\s*```/.test(text)) {
      fenced = !fenced
      return
    }
    if (fenced) return
    for (const m of text.replace(/`[^`]*`/g, (c) => ' '.repeat(c.length)).matchAll(IMAGE_RE)) {
      const target = m[2].replace(/[#?].*$/, '')
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue
      refs.push({ alt: m[1], target, line: i + 1 })
    }
  })
  return refs
}

/**
 * Still names a docs spec produces: every `'<name>.png'` literal passed to `shot()` or
 * `toHaveScreenshot()`.
 *
 * @param {string} source contents of an `e2e/docs/*.docs.js` file
 * @returns {Set<string>}
 */
export function findClaimedStills(source) {
  const names = new Set()
  for (const m of source.matchAll(/(?:[sS]hot|toHaveScreenshot)\([^)]*?['"`]([\w.-]+\.png)['"`]/g)) names.add(m[1])
  return names
}

/**
 * @param {{
 *   refs: ImageRef[],
 *   files: string[],
 *   claimedStills: Set<string>,
 *   manifest: Record<string, { spec: string, specHash: string, theme?: string }>,
 *   hashes: Record<string, string>,
 *   ci?: boolean,
 * }} input
 *   `refs` have `target` already resolved to a repo-relative path; `files` are repo-relative
 *   paths under `docs/screenshots/`, `docs/media/` and `docs/images/`; `hashes` maps a spec path to its
 *   current content hash.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function checkDocsMedia({ refs, files, claimedStills, manifest, hashes, ci = false }) {
  const errors = []
  const warnings = []
  const present = new Set(files)
  const referenced = new Set(refs.map((r) => r.target))
  // A dark twin is reached through its light partner (`help-build` emits the <picture>), never
  // embedded by name, so it counts as referenced when the light file is.
  const darkOf = (/** @type {string} */ f) => f.replace(/\.(png|gif)$/, '.dark.$1')
  const lightOf = (/** @type {string} */ f) => f.replace(/\.dark\.(png|gif)$/, '.$1')
  const isDark = (/** @type {string} */ f) => /\.dark\.(png|gif)$/.test(f)

  for (const r of refs) {
    if (!present.has(r.target)) errors.push(`${r.file}:${r.line} links to missing image ${r.target}`)
    if (!r.alt.trim()) errors.push(`${r.file}:${r.line} image ${r.target} has no alt text`)
  }

  for (const f of files) {
    const name = f.split('/').pop() ?? f
    if (isDark(f)) {
      if (!present.has(lightOf(f))) errors.push(`unpaired: ${f} has no light partner ${lightOf(f)} — record both themes from one spec`)
    } else if (/\.(png|gif)$/.test(f) && /^docs\/(screenshots|media)\//.test(f) && !present.has(darkOf(f))) {
      errors.push(`unpaired: ${f} has no dark twin ${darkOf(f)} — run \`npm run docs:media\` (docs-*-dark projects record it)`)
    }
    if (!referenced.has(isDark(f) ? lightOf(f) : f)) {
      errors.push(
        `orphan: ${f} is not referenced by any docs page or README.md — embed it, or delete it and the e2e/docs spec that produces it`,
      )
    }
    if (f.endsWith('.png') && !claimedStills.has(isDark(f) ? lightOf(name) : name)) {
      errors.push(`${f}: no e2e/docs/*.docs.js claims '${isDark(f) ? lightOf(name) : name}' via shot()/toHaveScreenshot(), so tests would never refresh it`)
    }
    if (f.endsWith('.gif') && !manifest[name]) {
      errors.push(`${f}: no entry in docs/media/manifest.json — record it with an e2e/docs movie and \`npm run docs:media\``)
    }
  }

  for (const [name, entry] of Object.entries(manifest)) {
    const current = hashes[entry.spec]
    if (current !== undefined && current !== entry.specHash) {
      const msg = `stale movie: ${name} was recorded from an older ${entry.spec} — run \`npm run docs:media\``
      ;(ci ? errors : warnings).push(msg)
    }
  }

  return { errors, warnings }
}
