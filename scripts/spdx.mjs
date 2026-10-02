// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Checks (default) or adds (`--fix`) the SPDX license marker every tracked source and
// prose file must carry. The marker is what keeps the license attached to a file when
// someone copies just that file — a single TODO spec, one command prompt, one component.
//
//   node scripts/spdx.mjs          # exit 1 and list every tracked file missing its marker
//   node scripts/spdx.mjs --fix    # add the marker to each of them
//
// Policy lives in LICENSING.md; this script is its mechanical enforcement. Only files
// known to git (tracked or staged) are considered, so `git add` a new file to have it
// checked.
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { extname } from 'node:path'

const CODE = 'AGPL-3.0-or-later'
const PROSE = 'CC-BY-SA-4.0'
const ID = 'SPDX-License-Identifier:'

/** Paths never marked: license texts themselves, and drafted social posts (chat/). */
const SKIP = [/^LICENSE/, /^chat\//, /^package-lock\.json$/]

/** @type {Record<string, {license: string, where: 'top' | 'end', wrap: (id: string) => string}>} */
const RULES = {
  '.js': { license: CODE, where: 'top', wrap: (id) => `// ${id}` },
  '.mjs': { license: CODE, where: 'top', wrap: (id) => `// ${id}` },
  '.cjs': { license: CODE, where: 'top', wrap: (id) => `// ${id}` },
  '.ts': { license: CODE, where: 'top', wrap: (id) => `// ${id}` },
  '.vue': { license: CODE, where: 'top', wrap: (id) => `<!-- ${id} -->` },
  '.css': { license: CODE, where: 'top', wrap: (id) => `/* ${id} */` },
  // Markdown goes at the END: many files (.claude/commands/*, TODO/*) open with YAML
  // front matter, and anything above it breaks the parser that reads it.
  '.md': { license: PROSE, where: 'end', wrap: (id) => `<!-- ${id} -->` },
}

const fix = process.argv.includes('--fix')
const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)
  .filter((f) => !SKIP.some((re) => re.test(f)))

const missing = []
for (const file of files) {
  const rule = RULES[extname(file)]
  if (!rule) continue
  const text = readFileSync(file, 'utf8')
  if (text.includes(ID)) continue
  missing.push(file)
  if (!fix) continue
  const marker = rule.wrap(`${ID} ${rule.license}`)
  if (rule.where === 'end') {
    writeFileSync(file, `${text.replace(/\s*$/, '')}\n\n${marker}\n`)
  } else if (text.startsWith('#!')) {
    const nl = text.indexOf('\n') + 1
    writeFileSync(file, `${text.slice(0, nl)}${marker}\n${text.slice(nl)}`)
  } else {
    writeFileSync(file, `${marker}\n${text}`)
  }
}

if (fix) {
  console.log(`Marked ${missing.length} file(s).`)
} else if (missing.length) {
  console.error(`Missing ${ID} marker (run: node scripts/spdx.mjs --fix):`)
  for (const f of missing) console.error(`  ${f}`)
  process.exit(1)
} else {
  console.log('All tracked source and prose files carry an SPDX marker.')
}
