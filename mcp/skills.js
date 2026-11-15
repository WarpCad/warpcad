// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * WarpCad's skills (`TODO/ai-035`): written workflows for multi-step modelling jobs, served
 * to an MCP client under SEP-2640, the `io.modelcontextprotocol/skills` extension
 * (https://modelcontextprotocol.io/seps/2640-skills-extension).
 *
 * A skill is a directory in `mcp/skills/` holding a `SKILL.md` (YAML frontmatter with `name`
 * and `description`, then Markdown) and optional supporting Markdown files. Every file is a
 * resource `skill://<name>/<path>`; the directory name is the skill's `name`. This module reads
 * the directory, checks the Agent Skills rules, and builds SEP-2640's entries
 * (`{ uri, frontmatter, resources: [{ uri, digest, size }] }`, digests `sha256:<hex>` over raw
 * bytes). `server.js` answers `skills/list`, `skills/get` and `resources/read` from it.
 *
 * It reads the files on every call, as the server re-reads the project: a skill edited while the
 * server runs is served with its new digests rather than a stale listing. Two files is cheap.
 *
 * **Markdown only.** WarpCad's skills carry no scripts (`TODO/ai-035`): a skill holding any
 * file that is not `.md` is refused as a whole, so nothing executable is ever handed to a host.
 *
 * **Trust.** Skill text is ours, shipped with the server, so it is instructions to the client's
 * model, unlike project text, which stays data (`docs/decisions/ai-partner.md` decision 7). A
 * skill must never tell the model to follow project text; `skills.spec.js` checks the wording.
 *
 * **The frontmatter parser is deliberately strict**: `key: value` lines, and one level of
 * indented `key: value` lines under a bare `key:` (for `metadata`). A plain value a YAML parser
 * would read as something other than the same string (a number, a boolean, a value holding
 * `: ` or ` #`, a block scalar) is refused with "quote it", so the JSON we list is what any host's
 * YAML parser makes of the file — SEP-2640 requires the two to be identical.
 *
 * Framework-free and dependency-free: plain Node.
 *
 * @module mcp/skills
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/** SEP-2640's extension id, declared under `capabilities.extensions`. */
export const SKILLS_EXTENSION = 'io.modelcontextprotocol/skills'

/** Where the shipped skills live: `mcp/skills/`, part of the MCP package. */
export const SKILLS_ROOT = join(dirname(fileURLToPath(import.meta.url)), 'skills')

/** The Agent Skills `name` rule: 1–64 of a–z, 0–9 and single hyphens, no hyphen at either end. */
const NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const NAME_MAX = 64
const DESCRIPTION_MAX = 1024
const COMPATIBILITY_MAX = 500

/** @typedef {string | Record<string, string>} FrontmatterValue */
/** @typedef {Record<string, FrontmatterValue>} Frontmatter */
/** @typedef {{ uri: string, digest: string, size: number }} SkillResource */
/** @typedef {{ uri: string, frontmatter: Frontmatter, resources: SkillResource[] }} SkillEntry */
/** @typedef {{ uri: string, path: string, mimeType: string }} SkillFile */
/**
 * @typedef {object} SkillCatalogue
 * @property {SkillEntry[]} skills Every valid skill, by name.
 * @property {Map<string, SkillFile>} files Every valid skill's files, by URI: the only files served.
 * @property {string[]} problems One sentence per skill directory that was refused, naming it.
 */

/**
 * Parse one plain or quoted YAML scalar, refusing what YAML would not read as the same string.
 *
 * @param {string} raw The text after `key: `, trimmed.
 * @param {string} key For the message.
 * @returns {string}
 */
function scalar(raw, key) {
  if (raw.startsWith('"')) {
    try {
      const value = JSON.parse(raw)
      if (typeof value === 'string') return value
    } catch {
      /* falls through to the refusal */
    }
    throw new Error(`frontmatter \`${key}\` has a double-quoted value that does not close cleanly.`)
  }
  if (raw.startsWith("'")) {
    // Inside single quotes YAML's only escape is a doubled quote; any other quote ends the string.
    const inner = raw.slice(1, -1)
    if (raw.length >= 2 && raw.endsWith("'") && !inner.replace(/''/g, '').includes("'")) return inner.replace(/''/g, "'")
    throw new Error(`frontmatter \`${key}\` has a single-quoted value that does not close cleanly.`)
  }
  const ambiguous =
    raw === '' ||
    /^[-?:,[\]{}#&*!|>%@`]/.test(raw) ||
    /: |:$| #/.test(raw) ||
    /^(true|false|yes|no|on|off|y|n|null|~)$/i.test(raw) ||
    /^[-+]?(\.?\d|\.(inf|nan)$)/i.test(raw)
  if (ambiguous) {
    throw new Error(`frontmatter \`${key}\` has a value YAML would not read as plain text (${JSON.stringify(raw)}): quote it.`)
  }
  return raw
}

/**
 * Split a `SKILL.md` into its frontmatter (as JSON) and its Markdown body.
 *
 * @param {string} text The whole file.
 * @returns {{ frontmatter: Frontmatter, body: string }}
 * @throws {Error} Naming the line or key that is not in the accepted subset.
 */
export function parseFrontmatter(text) {
  const lines = text.split('\n')
  if (lines[0].replace(/\r$/, '') !== '---') throw new Error('SKILL.md must begin with a `---` line opening its frontmatter.')
  const end = lines.findIndex((line, index) => index > 0 && line.replace(/\r$/, '') === '---')
  if (end === -1) throw new Error('SKILL.md has no closing `---` after its frontmatter.')

  /** @type {Frontmatter} */
  const frontmatter = {}
  /** @type {Record<string, string> | null} */
  let map = null
  let mapKey = ''
  for (const rawLine of lines.slice(1, end)) {
    const line = rawLine.replace(/\r$/, '')
    if (line.includes('\t')) throw new Error('frontmatter uses a tab: indent with spaces.')
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const nested = /^ {2}([A-Za-z0-9_./-]+):(?: (.*))?$/.exec(line)
    if (nested && map !== null) {
      const [, key, value = ''] = nested
      if (key in map) throw new Error(`frontmatter \`${mapKey}.${key}\` appears twice.`)
      map[key] = scalar(value.trim(), `${mapKey}.${key}`)
      continue
    }
    const top = /^([A-Za-z0-9_-]+):(?: (.*))?$/.exec(line)
    if (!top && map !== null && /^\s+- /.test(line)) throw new Error(`frontmatter \`${mapKey}\` holds a list; only \`key: value\` lines are accepted.`)
    if (!top) throw new Error(`frontmatter line ${JSON.stringify(line)} is not \`key: value\` (lists and nested blocks beyond one map are not accepted).`)
    const [, key, value = ''] = top
    if (key in frontmatter) throw new Error(`frontmatter \`${key}\` appears twice.`)
    if (value.trim() === '') {
      map = {}
      mapKey = key
      frontmatter[key] = map
    } else {
      map = null
      frontmatter[key] = scalar(value.trim(), key)
    }
  }
  for (const [key, value] of Object.entries(frontmatter)) {
    if (typeof value !== 'string' && Object.keys(value).length === 0) {
      throw new Error(`frontmatter \`${key}\` has no value: quote it, or give it indented \`key: value\` lines.`)
    }
  }
  return { frontmatter, body: lines.slice(end + 1).join('\n') }
}

/**
 * The Agent Skills rules a frontmatter must meet, for a skill in directory `dir`.
 *
 * @param {Frontmatter} frontmatter
 * @param {string} dir
 * @returns {string | null} What is wrong, or `null`.
 */
function frontmatterProblem(frontmatter, dir) {
  const { name, description, compatibility, metadata } = frontmatter
  if (typeof name !== 'string') return 'its frontmatter has no `name`.'
  if (name.length > NAME_MAX || !NAME.test(name)) {
    return `its name ${JSON.stringify(name)} breaks the Agent Skills naming rule (1–${NAME_MAX} of a–z, 0–9 and single hyphens, no hyphen at either end).`
  }
  if (name !== dir) return `its name ${JSON.stringify(name)} is not its directory’s (${JSON.stringify(dir)}); the two must match.`
  if (typeof description !== 'string' || description.trim() === '') return 'its frontmatter has no `description`, or an empty one.'
  if (description.length > DESCRIPTION_MAX) return `its description is ${description.length} characters; the limit is 1,024.`
  if (compatibility !== undefined && (typeof compatibility !== 'string' || compatibility.length > COMPATIBILITY_MAX)) {
    return 'its `compatibility` must be one string of at most 500 characters.'
  }
  if (metadata !== undefined && typeof metadata === 'string') return 'its `metadata` must be a map of `key: value` lines.'
  return null
}

/**
 * Every file under `dir`, as `/`-separated paths relative to it, dotfiles left out, sorted.
 *
 * @param {string} dir
 * @param {string} [prefix]
 * @returns {string[]}
 */
function filesUnder(dir, prefix = '') {
  /** @type {string[]} */
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...filesUnder(join(dir, entry.name), relative))
    else if (entry.isFile()) found.push(relative)
  }
  return found.sort()
}

/**
 * Read the skill directory and build the catalogue: every valid skill's entry, the files they
 * serve, and a sentence for each directory refused.
 *
 * @param {string} [root] The directory of skill directories; {@link SKILLS_ROOT} by default.
 * @returns {SkillCatalogue}
 */
export function loadSkills(root = SKILLS_ROOT) {
  /** @type {SkillCatalogue} */
  const catalogue = { skills: [], files: new Map(), problems: [] }
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    catalogue.problems.push(`the skills folder ${root} does not exist.`)
    return catalogue
  }
  const dirs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
    .map((entry) => entry.name)
    .sort()

  for (const dir of dirs) {
    const refuse = (/** @type {string} */ why) => catalogue.problems.push(`skill ${dir}: ${why}`)
    const skillDir = join(root, dir)
    const paths = filesUnder(skillDir)
    if (!paths.includes('SKILL.md')) {
      refuse('has no SKILL.md, so it is not a skill.')
      continue
    }
    const script = paths.find((path) => !path.endsWith('.md'))
    if (script !== undefined) {
      refuse(`carries ${script}; WarpCad skills are Markdown only, with no scripts.`)
      continue
    }
    const bytes = new Map(paths.map((path) => [path, readFileSync(join(skillDir, path))]))
    let frontmatter
    try {
      frontmatter = parseFrontmatter(String(bytes.get('SKILL.md'))).frontmatter
    } catch (error) {
      refuse(error instanceof Error ? error.message : String(error))
      continue
    }
    const problem = frontmatterProblem(frontmatter, dir)
    if (problem !== null) {
      refuse(problem)
      continue
    }

    const ordered = ['SKILL.md', ...paths.filter((path) => path !== 'SKILL.md')]
    catalogue.skills.push({
      uri: `skill://${dir}/SKILL.md`,
      frontmatter,
      resources: ordered.map((path) => {
        const content = /** @type {Buffer} */ (bytes.get(path))
        return {
          uri: `skill://${dir}/${path}`,
          digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
          size: content.length,
        }
      }),
    })
    for (const path of ordered) {
      catalogue.files.set(`skill://${dir}/${path}`, { uri: `skill://${dir}/${path}`, path: join(skillDir, path), mimeType: 'text/markdown' })
    }
  }
  return catalogue
}

/**
 * SEP-2640's `skills/get`: the entry for the skill whose `SKILL.md` is at `uri`.
 *
 * @param {string} uri
 * @param {string} [root]
 * @returns {SkillEntry | null} `null` when `uri` is not a served skill's `SKILL.md`.
 */
export function skillEntry(uri, root = SKILLS_ROOT) {
  return loadSkills(root).skills.find((skill) => skill.uri === uri) ?? null
}

/**
 * `resources/read` for a skill file. Looked up in the catalogue by exact URI, never joined onto
 * a path, so a URI can only ever reach a file the listing names.
 *
 * @param {string} uri
 * @param {string} [root]
 * @returns {{ uri: string, mimeType: string, text: string } | null}
 */
export function readSkillResource(uri, root = SKILLS_ROOT) {
  const file = loadSkills(root).files.get(uri)
  if (file === undefined) return null
  return { uri: file.uri, mimeType: file.mimeType, text: readFileSync(file.path, 'utf8') }
}

/**
 * `resources/list` entries for every served skill file. A `SKILL.md` carries its frontmatter's
 * `name` and `description` (SEP-2640, Resource Metadata); a supporting file is named by its path.
 *
 * @param {SkillCatalogue} catalogue
 * @returns {{ uri: string, name: string, description?: string, mimeType: string }[]}
 */
export function skillResourceList(catalogue) {
  return catalogue.skills.flatMap((skill) =>
    skill.resources.map((resource) =>
      resource.uri === skill.uri
        ? { uri: resource.uri, name: String(skill.frontmatter.name), description: String(skill.frontmatter.description), mimeType: 'text/markdown' }
        : { uri: resource.uri, name: resource.uri.slice(skill.uri.length - 'SKILL.md'.length), mimeType: 'text/markdown' }
    )
  )
}

/**
 * The text a skill writes as code: inline `…` spans and fenced blocks.
 *
 * @param {string} markdown
 * @returns {string[]}
 */
function codeIn(markdown) {
  const fenced = [...markdown.matchAll(/^```[^\n]*\n([\s\S]*?)^```/gm)].map((match) => match[1])
  const rest = markdown.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')
  const inline = [...rest.matchAll(/`([^`\n]+)`/g)].map((match) => match[1])
  return [...fenced, ...inline]
}

/**
 * The tool names a skill mentions, so a spec can check each against the one registry
 * (`TODO/ai-035` point 3: no second tool list). In code only: every snake_case word
 * (`describe_scene`; the rule `src/ai/mcpInstructions.spec.js` uses), and every lowercase word
 * written as a call, `name {` (`measure { ids }`). Skills therefore write a one-word tool as a
 * call, never bare.
 *
 * @param {string} markdown
 * @returns {string[]} Sorted, each once.
 */
export function mentionedToolNames(markdown) {
  const names = new Set()
  for (const code of codeIn(markdown)) {
    for (const match of code.matchAll(/\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/g)) names.add(match[0])
    for (const match of code.matchAll(/(?<![\w.:"])([a-z][a-z0-9]*) ?\{/g)) names.add(match[1])
  }
  return [...names].sort()
}

/**
 * The op names a skill mentions in code: `family.name` where `family` is one of `families`
 * (`boolean`, `modify`, …), so a param path like `jointOptions.stock` is not taken for an op.
 *
 * @param {string} markdown
 * @param {readonly string[]} families
 * @returns {string[]} Sorted, each once.
 */
export function mentionedOpNames(markdown, families) {
  const known = new Set(families)
  const names = new Set()
  for (const code of codeIn(markdown)) {
    for (const match of code.matchAll(/\b([a-z]+)\.([a-zA-Z][a-zA-Z0-9]*)\b/g)) {
      if (known.has(match[1])) names.add(match[0])
    }
  }
  return [...names].sort()
}
