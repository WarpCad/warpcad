// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-035`: the skill catalogue the MCP server serves. Nothing is mocked: every case
 * writes a real skill directory under a temp folder, or reads the skills we ship in `mcp/skills/`.
 *
 * The shape is SEP-2640's (the `io.modelcontextprotocol/skills` extension): one entry per skill,
 * `{ uri, frontmatter, resources: [{ uri, digest, size }] }`, every file a `skill://<name>/<file>`
 * resource, the URI's last path segment equal to the frontmatter `name`, digests `sha256:<hex>`
 * over the raw bytes. The skills are ours, so the tools they name must be the registry's.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createToolRegistry } from '../src/ai/tools/index.js'
import {
  SKILLS_EXTENSION,
  SKILLS_ROOT,
  loadSkills,
  mentionedOpNames,
  mentionedToolNames,
  parseFrontmatter,
  readSkillResource,
  skillEntry,
} from './skills.js'

/** @type {string} */
let root

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'warpcad-skills-'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

/**
 * Write `files` (relative path → text) into `root/<dir>/`.
 *
 * @param {string} dir
 * @param {Record<string, string>} files
 */
function writeSkill(dir, files) {
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, dir, path)
    mkdirSync(join(target, '..'), { recursive: true })
    writeFileSync(target, text)
  }
}

/** @param {string | Buffer} bytes */
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`

const GOOD = '---\nname: drill-holes\ndescription: Drill a hole pattern. Use when asked for bolt holes.\n---\n\n# Drill holes\n\nCall `describe_scene`.\n'

describe('the extension id', () => {
  it('is SEP-2640’s', () => {
    expect(SKILLS_EXTENSION).toBe('io.modelcontextprotocol/skills')
  })
})

describe('parseFrontmatter', () => {
  it('reads plain scalars, quoted strings, a metadata map, and returns the body after it', () => {
    const text = [
      '---',
      '# a comment',
      'name: add-clearances',
      'description: "Open a gap: 0.2 mm per side, for parts that fit together."',
      "license: 'CC-BY-SA-4.0'",
      '',
      'metadata:',
      '  author: warpcad',
      '  version: "1.0"',
      '---',
      '# Body',
      '',
    ].join('\n')
    const { frontmatter, body } = parseFrontmatter(text)
    expect(frontmatter).toEqual({
      name: 'add-clearances',
      description: 'Open a gap: 0.2 mm per side, for parts that fit together.',
      license: 'CC-BY-SA-4.0',
      metadata: { author: 'warpcad', version: '1.0' },
    })
    expect(body).toBe('# Body\n')
  })

  it('takes a doubled quote inside a single-quoted string', () => {
    expect(parseFrontmatter("---\nname: a\ndescription: 'it''s fine'\n---\n").frontmatter.description).toBe("it's fine")
  })

  it.each([
    ['no opening fence', 'name: a\ndescription: b\n---\n', /must begin with a `---` line/],
    ['no closing fence', '---\nname: a\ndescription: b\n', /no closing `---`/],
    ['a number YAML would not read as a string', '---\nname: a\nversion: 1.0\n---\n', /version.*quote it/],
    ['a boolean YAML would not read as a string', '---\nname: a\ndraft: true\n---\n', /draft.*quote it/],
    ['a plain value holding ": "', '---\nname: a\ndescription: gap: 0.2 mm\n---\n', /description.*quote it/],
    ['a block scalar', '---\nname: a\ndescription: |\n  two lines\n---\n', /description.*quote it/],
    ['a list', '---\nname: a\ntags:\n  - x\n---\n', /tags/],
    ['a duplicate key', '---\nname: a\nname: b\n---\n', /name.*twice/],
    ['a tab', '---\nname: a\n\tdescription: b\n---\n', /tab/],
  ])('refuses %s, by name', (_case, text, message) => {
    expect(() => parseFrontmatter(text)).toThrow(message)
  })
})

describe('loadSkills', () => {
  it('lists a skill as SEP-2640 does: SKILL.md uri, verbatim frontmatter, every file with digest and size', () => {
    const reference = '# Hole sizes\n\nM3 clearance is 3.4 mm, ±0.1 — Ø.\n'
    writeSkill('drill-holes', { 'SKILL.md': GOOD, 'references/SIZES.md': reference })

    const { skills, problems } = loadSkills(root)

    expect(problems).toEqual([])
    expect(skills).toEqual([
      {
        uri: 'skill://drill-holes/SKILL.md',
        frontmatter: { name: 'drill-holes', description: 'Drill a hole pattern. Use when asked for bolt holes.' },
        resources: [
          { uri: 'skill://drill-holes/SKILL.md', digest: sha256(GOOD), size: Buffer.byteLength(GOOD) },
          { uri: 'skill://drill-holes/references/SIZES.md', digest: sha256(reference), size: Buffer.byteLength(reference) },
        ],
      },
    ])
    // Bytes, not characters: the reference holds multi-byte characters.
    expect(skills[0].resources[1].size).toBeGreaterThan(reference.length)
    expect(skills[0].resources[0].digest).toMatch(/^sha256:[0-9a-f]{64}$/)
  })

  it('orders skills by name and ignores dotfiles', () => {
    writeSkill('zeta', { 'SKILL.md': GOOD.replace('drill-holes', 'zeta') })
    writeSkill('alpha', { 'SKILL.md': GOOD.replace('drill-holes', 'alpha'), '.DS_Store': 'junk' })
    writeFileSync(join(root, '.hidden'), 'x')

    const { skills, problems } = loadSkills(root)

    expect(problems).toEqual([])
    expect(skills.map((skill) => skill.uri)).toEqual(['skill://alpha/SKILL.md', 'skill://zeta/SKILL.md'])
    expect(skills[0].resources).toHaveLength(1)
  })

  it('refuses a skill whose name is not its directory’s, naming both', () => {
    writeSkill('drill', { 'SKILL.md': GOOD })
    const { skills, problems } = loadSkills(root)
    expect(skills).toEqual([])
    expect(problems).toEqual([expect.stringMatching(/drill.*"drill-holes".*directory/)])
  })

  it.each([
    ['missing', '---\nname: drill-holes\n---\n'],
    ['empty', '---\nname: drill-holes\ndescription: ""\n---\n'],
  ])('refuses a skill whose description is %s', (_case, text) => {
    writeSkill('drill-holes', { 'SKILL.md': text })
    const { skills, problems } = loadSkills(root)
    expect(skills).toEqual([])
    expect(problems).toEqual([expect.stringMatching(/drill-holes.*description/)])
  })

  it.each([
    ['upper case', 'Drill'],
    ['a doubled hyphen', 'drill--holes'],
    ['a leading hyphen', '-drill'],
    ['65 characters', 'a'.repeat(65)],
  ])('refuses a name with %s (the Agent Skills naming rule)', (_case, name) => {
    writeSkill(name, { 'SKILL.md': GOOD.replace('drill-holes', name) })
    const { skills, problems } = loadSkills(root)
    expect(skills).toEqual([])
    expect(problems).toEqual([expect.stringMatching(/name/)])
  })

  it('refuses a description over 1,024 characters', () => {
    writeSkill('drill-holes', { 'SKILL.md': `---\nname: drill-holes\ndescription: ${'x'.repeat(1025)}\n---\n` })
    expect(loadSkills(root).problems).toEqual([expect.stringMatching(/description.*1,024/)])
  })

  it('refuses a skill directory with no SKILL.md, and still serves the others', () => {
    writeSkill('notes', { 'README.md': '# Not a skill\n' })
    writeSkill('drill-holes', { 'SKILL.md': GOOD })
    const { skills, problems } = loadSkills(root)
    expect(skills.map((skill) => skill.frontmatter.name)).toEqual(['drill-holes'])
    expect(problems).toEqual([expect.stringMatching(/notes.*no SKILL\.md/)])
  })

  it('refuses a skill that carries a script: WarpCad skills are Markdown only', () => {
    writeSkill('drill-holes', { 'SKILL.md': GOOD, 'scripts/drill.py': 'print(1)\n' })
    const { skills, problems } = loadSkills(root)
    expect(skills).toEqual([])
    expect(problems).toEqual([expect.stringMatching(/drill-holes.*scripts\/drill\.py.*Markdown only/)])
  })

  it('refuses a SKILL.md whose frontmatter does not parse, with the parser’s reason', () => {
    writeSkill('drill-holes', { 'SKILL.md': '---\nname: drill-holes\ndescription: gap: 2\n---\n' })
    expect(loadSkills(root).problems).toEqual([expect.stringMatching(/drill-holes.*quote it/)])
  })

  it('reports a missing root as a problem, not a throw', () => {
    const { skills, problems } = loadSkills(join(root, 'absent'))
    expect(skills).toEqual([])
    expect(problems).toEqual([expect.stringMatching(/absent/)])
  })

  it('gives a file a new digest and size when it changes, and leaves the others alone', () => {
    writeSkill('drill-holes', { 'SKILL.md': GOOD, 'references/SIZES.md': '# Sizes\n' })
    const before = loadSkills(root).skills[0].resources

    writeFileSync(join(root, 'drill-holes', 'references', 'SIZES.md'), '# Sizes\n\nM4: 4.5 mm.\n')
    const after = loadSkills(root).skills[0].resources

    expect(after[0]).toEqual(before[0])
    expect(after[1].digest).not.toBe(before[1].digest)
    expect(after[1].size).not.toBe(before[1].size)
  })
})

describe('skillEntry and readSkillResource', () => {
  beforeEach(() => {
    writeSkill('drill-holes', { 'SKILL.md': GOOD, 'references/SIZES.md': '# Sizes\n' })
    writeSkill('broken', { 'SKILL.md': '---\nname: broken\n---\n', 'secret.md': 'x' })
    writeFileSync(join(root, 'outside.md'), 'not a skill file\n')
  })

  it('skillEntry answers for a SKILL.md URI with the listing’s entry', () => {
    expect(skillEntry('skill://drill-holes/SKILL.md', root)).toEqual(loadSkills(root).skills[0])
  })

  it.each([
    ['a supporting file', 'skill://drill-holes/references/SIZES.md'],
    ['an unknown skill', 'skill://absent/SKILL.md'],
    ['a broken skill', 'skill://broken/SKILL.md'],
    ['another scheme', 'warpcad://guide'],
  ])('skillEntry returns null for %s', (_case, uri) => {
    expect(skillEntry(uri, root)).toBeNull()
  })

  it('reads a listed file’s exact text, with its MIME type', () => {
    expect(readSkillResource('skill://drill-holes/SKILL.md', root)).toEqual({
      uri: 'skill://drill-holes/SKILL.md',
      mimeType: 'text/markdown',
      text: GOOD,
    })
    expect(readSkillResource('skill://drill-holes/references/SIZES.md', root)?.text).toBe('# Sizes\n')
  })

  it.each([
    ['an unlisted file', 'skill://drill-holes/absent.md'],
    ['a path out of the skill', 'skill://drill-holes/../outside.md'],
    ['an encoded path out of the skill', 'skill://drill-holes/%2E%2E/outside.md'],
    ['a file of a broken skill', 'skill://broken/secret.md'],
  ])('reads nothing for %s', (_case, uri) => {
    expect(readSkillResource(uri, root)).toBeNull()
  })
})

describe('mentionedToolNames and mentionedOpNames', () => {
  const text = [
    'Call `describe_scene`, then `measure { ids: [part] }` and `check_clearance { a, b }`.',
    'A typo like `mesure_scene` is still a tool name. Plain words in code (`pieces`, `deltaMm`, `x`) are not.',
    'Cut with `operate { op: "boolean.subtract" }`, or move with `transform.translate`;',
    '`jointOptions.stock` is a param path, not an op, and snake_case outside code (like_this) is prose.',
    '```',
    'apply_records { steps: [{ operate: { op: "modify.enlarge" } }] }',
    '```',
  ].join('\n')

  it('finds every snake_case word and every `name {` call in code, and nothing else', () => {
    expect(mentionedToolNames(text)).toEqual(['apply_records', 'check_clearance', 'describe_scene', 'measure', 'mesure_scene', 'operate'])
  })

  it('finds dotted op names in code whose family is a real one', () => {
    expect(mentionedOpNames(text, ['boolean', 'modify', 'transform'])).toEqual(['boolean.subtract', 'modify.enlarge', 'transform.translate'])
  })
})

describe('the skills we ship', () => {
  const catalogue = loadSkills()
  const registry = createToolRegistry()
  const tools = new Set(registry.definitions('mcp').map((definition) => definition.name))
  const listOps = registry.toolsFor('mcp').find((tool) => tool.name === 'list_ops')
  const summary = /** @type {{ create: { op: string }[], operate: { op: string }[] }} */ (listOps?.run(/** @type {any} */ ({}), { detail: 'summary' }))
  const ops = new Set([...summary.create, ...summary.operate].map((entry) => entry.op))
  const families = [...new Set([...ops].map((op) => op.split('.')[0]))]

  it('live in mcp/skills/ and all load', () => {
    expect(SKILLS_ROOT).toMatch(/mcp[/\\]skills$/)
    expect(catalogue.problems).toEqual([])
  })

  it('include the first two: add-clearances and create-enclosure', () => {
    expect(catalogue.skills.map((skill) => skill.uri)).toEqual(
      expect.arrayContaining(['skill://add-clearances/SKILL.md', 'skill://create-enclosure/SKILL.md'])
    )
  })

  describe.each(catalogue.skills.map((skill) => [skill.frontmatter.name, skill]))('%s', (name, skill) => {
    const text = readFileSync(join(SKILLS_ROOT, String(name), 'SKILL.md'), 'utf8')

    it('is Markdown only, licensed as prose (CC BY-SA 4.0), with the SPDX marker last', () => {
      for (const resource of skill.resources) expect(resource.uri).toMatch(/\.md$/)
      expect(skill.frontmatter.license).toBe('CC-BY-SA-4.0')
      expect(text.trimEnd().split('\n').at(-1)).toBe('<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->')
    })

    it('ends with a “check your work” step', () => {
      const headings = text.split('\n').filter((line) => /^#{2,} /.test(line))
      expect(headings.at(-1)).toMatch(/check your work/i)
    })

    it('names only tools the MCP registry lists (one registry, no second tool list)', () => {
      const named = mentionedToolNames(text)
      expect(named.length).toBeGreaterThan(2)
      for (const tool of named) expect(tools.has(tool), `${name} names ${tool}, which is not an MCP tool`).toBe(true)
    })

    it('names only ops the catalogue has', () => {
      for (const op of mentionedOpNames(text, families)) expect(ops.has(op), `${name} names ${op}, which list_ops does not have`).toBe(true)
    })

    it('never tells the model to follow project text', () => {
      expect(text).not.toMatch(/follow (the )?(project|standing instructions|intent|body names)/i)
    })
  })
})
