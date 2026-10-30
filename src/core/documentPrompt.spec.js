// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/ai-031`: the prompt an agent was given, as its own document record — `{ id, text,
 * produced }` — beside the project's other metadata.
 *
 * What this file pins down:
 *
 * 1. **The command layer.** `recordPrompt` / `addPromptProduced` need an origin, clean and cap the
 *    text, bump the version, and are not undo steps (a prompt is what was asked, a fact Undo does
 *    not take back — like the gist).
 * 2. **The file.** Prompts ride in the state line's merge section as `merge.prompts` — like
 *    `merge.gist`, never under `merge.registers` — so record lines stay byte-identical, and a
 *    released build (which ignores an unknown section key) still opens the file.
 * 3. **Merge.** Two replicas that each add a prompt keep both; deleting the produced body leaves
 *    the prompt.
 * 4. **Load.** A malformed record is dropped with a warning naming why, never half-loaded; a
 *    `prompts` that is not a list refuses the file by name.
 * 5. **Older build.** A file written by this build, opened and saved by v1.2.0 (a committed
 *    fixture produced by running that release's own code), loses the prompts the way it loses a
 *    gist — and merging the newer copy back restores them.
 * 6. **A body's prompts**, followed through a boolean that consumed the produced bodies.
 */
import { describe, expect, it } from 'vitest'

import { createDocument } from './document.js'
import { canonicalJSON } from './merge/state.js'
import { mergeStates } from './merge/merge.js'
import { readMergeSection } from './merge/validate.js'
import { ProjectFormatError, parseProject, serializeProject } from './project.js'
import { PROMPT_LIMITS, PROMPT_OP, promptsForBody } from './prompt.js'
import { withProjectId } from './shareCopy.js'
import { parseNdjson, serializeNdjson } from './ndjson.js'

const fixtures = import.meta.glob(['./__fixtures__/prompt-*.ndjson'], { query: '?raw', import: 'default', eager: true })

const local = { origin: 'local' }
const mcp = { origin: 'mcp' }

/** @param {any} document @param {number} [x] */
function placeCube(document, x = 0) {
  const id = document.nextId('cuboid')
  document.append(
    { id, op: 'primitive.cuboid', name: document.nextName('Cube'), params: { size: [20, 20, 20], center: [x, 0, 10] } },
    mcp,
  )
  return id
}

/**
 * @param {string} text
 * @param {Parameters<typeof createDocument>[0]} [options]
 */
function open(text, options = {}) {
  const parsed = parseProject(text)
  const document = createDocument(options)
  document.loadEntries(parsed.entries, parsed.rollbackAt, parsed.resolution, parsed)
  return document
}

/** @param {string} text */
const stateLineOf = (text) => JSON.parse(/** @type {string} */ (text.trimEnd().split('\n').at(-1)))

/** @param {string} text */
const recordLinesOf = (text) => text.trimEnd().split('\n').filter((line) => !line.includes('"warpcad":"project-state"'))

/**
 * Rewrite a file's merge section.
 *
 * @param {string} text
 * @param {(merge: Record<string, any>) => Record<string, any>} edit
 */
function withMerge(text, edit) {
  const lines = text.trimEnd().split('\n')
  const state = JSON.parse(/** @type {string} */ (lines.at(-1)))
  state.merge = edit(state.merge)
  lines[lines.length - 1] = JSON.stringify(state)
  return lines.join('\n') + '\n'
}

describe('a prompt through the command layer', () => {
  it('records the cleaned text with an id, and needs an origin', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const version = document.version
    expect(() => document.recordPrompt({ text: 'x' }, /** @type {any} */ ({}))).toThrow(/origin/)
    expect(document.version).toBe(version)

    const stored = document.recordPrompt({ text: '  a fan duct‮, 1.6 mm walls ' }, mcp)
    expect(stored).toEqual({ id: expect.stringMatching(/^prompt-aaaaaa-\d+$/), text: 'a fan duct, 1.6 mm walls', produced: [] })
    expect(document.prompts()).toEqual([stored])
    expect(document.promptOf(stored.id)).toEqual(stored)
    expect(document.version).toBe(version + 1)
  })

  it('refuses an empty prompt, a non-string and a 1 MB string, by name, changing nothing', () => {
    const document = createDocument()
    for (const text of ['', '  ', 42, 'a'.repeat(1024 * 1024)]) {
      expect(() => document.recordPrompt({ text: /** @type {any} */ (text) }, mcp)).toThrow(/empty|text|over the cap/)
    }
    expect(document.prompts()).toEqual([])
  })

  it('links produced ids, sorted and once each, and is not an undo step', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'two cubes' }, mcp)
    const a = placeCube(document)
    const b = placeCube(document, 30)
    document.addPromptProduced(prompt.id, [b, a, a], mcp)
    expect(document.promptOf(prompt.id)?.produced).toEqual([a, b].sort())
    const version = document.version
    document.addPromptProduced(prompt.id, [a], mcp)
    expect(document.version).toBe(version)
    expect(() => document.addPromptProduced('no-such-prompt', [a], mcp)).toThrow(/no prompt/)
    // Neither write reached the local undo stack.
    document.appendAll([{ id: 'own', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [0, 50, 2.5] } }], local)
    document.undo()
    expect(document.prompts()).toHaveLength(1)
  })

  it('hands out copies: changing what prompts() returned changes nothing', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'x' }, mcp)
    const read = /** @type {any} */ (document.prompts()[0])
    read.text = 'changed'
    read.produced.push('evil')
    expect(document.promptOf(prompt.id)).toEqual(prompt)
  })

  it('caps the number of prompts a project holds', () => {
    const document = createDocument()
    for (let i = 0; i < PROMPT_LIMITS.maxPrompts; i += 1) document.recordPrompt({ text: `p${i}` }, mcp)
    expect(() => document.recordPrompt({ text: 'one more' }, mcp)).toThrow(new RegExp(String(PROMPT_LIMITS.maxPrompts)))
  })
})

describe('a prompt in the file', () => {
  it('rides in merge.prompts on a version-2 line; record lines stay byte-identical', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const cube = placeCube(document)
    const plain = serializeProject(document)
    const prompt = document.recordPrompt({ text: 'a <b>cube</b>' }, mcp)
    document.addPromptProduced(prompt.id, [cube], mcp)
    const text = serializeProject(document)
    expect(recordLinesOf(text)).toEqual(recordLinesOf(plain))
    const state = stateLineOf(text)
    expect(state.version).toBe(2)
    expect(state.merge.prompts).toEqual([{ id: prompt.id, text: 'a <b>cube</b>', produced: [cube] }])
    expect(state.prompts).toBeUndefined()
    expect(state.merge.registers?.prompts).toBeUndefined()

    const reopened = open(text)
    expect(reopened.prompts()).toEqual([{ id: prompt.id, text: 'a <b>cube</b>', produced: [cube] }])
    expect(serializeProject(reopened)).toBe(text)
  })

  it('a file with no prompt is unchanged', () => {
    const document = createDocument()
    placeCube(document)
    expect(JSON.stringify(stateLineOf(serializeProject(document)).merge ?? {})).not.toContain('prompts')
  })

  it('survives a recipient’s copy (Make my own copy keeps everything but the id and the gist)', () => {
    const document = createDocument()
    const cube = placeCube(document)
    const prompt = document.recordPrompt({ text: 'keep me' }, mcp)
    document.addPromptProduced(prompt.id, [cube], mcp)
    const records = parseNdjson(serializeProject(document)).records
    const copy = serializeNdjson(withProjectId(/** @type {any} */ (records), 'other-project-id'))
    expect(open(copy).prompts()).toEqual([{ id: prompt.id, text: 'keep me', produced: [cube] }])
  })
})

describe('load-time validation', () => {
  /** A file with one good prompt, to corrupt. */
  function goodFile() {
    const document = createDocument({ replica: 'aaaaaa' })
    const cube = placeCube(document)
    const prompt = document.recordPrompt({ text: 'good' }, mcp)
    document.addPromptProduced(prompt.id, [cube], mcp)
    return { text: serializeProject(document), id: prompt.id, cube }
  }

  it('drops a malformed record with a warning naming it and why; the rest of the file loads', () => {
    const { text, id } = goodFile()
    const hostile = withMerge(text, (merge) => ({
      ...merge,
      prompts: [
        ...merge.prompts,
        { id: 'prompt-bad-1', text: 'a‮b' },
        { id: 'prompt-bad-2', text: 42 },
        { id: 'bad id', text: 'x' },
        'not even an object',
      ],
    }))
    const parsed = parseProject(hostile)
    expect(parsed.entries).toHaveLength(1)
    expect([...(parsed.merge?.prompts?.keys() ?? [])]).toEqual([id])
    const warnings = parsed.warnings.filter((warning) => warning.op === PROMPT_OP)
    expect(warnings).toHaveLength(4)
    expect(warnings[0]).toMatchObject({ id: 'prompt-bad-1', message: expect.stringMatching(/prompt.*removed.*control/) })
    expect(warnings[1].message).toMatch(/text/)
    expect(open(hostile).prompts().map((p) => p.id)).toEqual([id])
  })

  it('drops a second record with the same id', () => {
    const { text, id } = goodFile()
    const twice = withMerge(text, (merge) => ({ ...merge, prompts: [...merge.prompts, { id, text: 'other' }] }))
    const parsed = parseProject(twice)
    expect([...(parsed.merge?.prompts ?? [])]).toEqual([[id, { text: 'good', produced: expect.any(Array) }]])
    expect(parsed.warnings.some((warning) => warning.op === PROMPT_OP && /already/.test(warning.message))).toBe(true)
  })

  it('refuses the file, by name, when prompts is not a list', () => {
    const { text } = goodFile()
    for (const prompts of ['x', 3, { a: 1 }, null]) {
      const hostile = withMerge(text, (merge) => ({ ...merge, prompts }))
      expect(() => parseProject(hostile)).toThrow(ProjectFormatError)
      expect(() => parseProject(hostile)).toThrow(/prompts/)
    }
  })

  it('drops the prompts past the per-project cap, with one warning', () => {
    const { text } = goodFile()
    const many = Array.from({ length: PROMPT_LIMITS.maxPrompts + 3 }, (_, i) => ({ id: `p-${i}`, text: 't' }))
    const parsed = parseProject(withMerge(text, (merge) => ({ ...merge, prompts: many })))
    expect(parsed.merge?.prompts?.size).toBe(PROMPT_LIMITS.maxPrompts)
    expect(parsed.warnings.filter((warning) => warning.op === PROMPT_OP)).toHaveLength(1)
  })

  it('an older reader ignores merge.prompts: an unknown section key, not a register', () => {
    // What a released build does with the section (`documentGist.spec.js` pins the same rule).
    expect(() => readMergeSection({ somethingNewer: [{ id: 'p', text: 'x' }] }, new Set())).not.toThrow()
    expect(() => readMergeSection({ registers: { prompts: [3, 'aaaaaa'] } }, new Set())).toThrow(/not a register/)
  })
})

describe('prompts merge as a set', () => {
  /** Two replicas of one project: A made it, B opened A's file. */
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    const cube = placeCube(a)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    return { a, b, cube }
  }

  it('two replicas each add a prompt: both survive, in both merge orders, and through the file', () => {
    const { a, b } = twoCopies()
    const pa = a.recordPrompt({ text: 'from A' }, mcp)
    const pb = b.recordPrompt({ text: 'from B' }, mcp)
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))

    a.mergeFrom(sb, { origin: 'merge' })
    b.mergeFrom(sa, { origin: 'merge' })
    for (const document of [a, b, open(serializeProject(a))]) {
      expect(document.prompts().map((p) => p.text).sort()).toEqual(['from A', 'from B'])
      expect(document.promptOf(pa.id)?.text).toBe('from A')
      expect(document.promptOf(pb.id)?.text).toBe('from B')
    }
  })

  it('one replica deletes the produced body: the prompt remains, naming the deleted id', () => {
    const { a, b, cube } = twoCopies()
    const prompt = a.recordPrompt({ text: 'a cube' }, mcp)
    a.addPromptProduced(prompt.id, [cube], mcp)
    b.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    b.deleteBodies([cube], local)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.bodies()).toHaveLength(0)
    expect(a.prompts()).toEqual([{ id: prompt.id, text: 'a cube', produced: [cube] }])
    expect(open(serializeProject(a)).prompts()).toEqual([{ id: prompt.id, text: 'a cube', produced: [cube] }])
  })

  it('produced lists grown on two replicas are unioned', () => {
    const { a, b } = twoCopies()
    const prompt = a.recordPrompt({ text: 'shared' }, mcp)
    b.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    const onA = placeCube(a, 40)
    a.addPromptProduced(prompt.id, [onA], mcp)
    const onB = placeCube(b, -40)
    b.addPromptProduced(prompt.id, [onB], mcp)
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.promptOf(prompt.id)?.produced).toEqual([onA, onB].sort())
  })

  it('a failed merge puts the prompts back', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    document.recordPrompt({ text: 'mine' }, mcp)
    const before = document.prompts()
    const other = createDocument({ replica: 'cccccc' })
    placeCube(other)
    other.recordPrompt({ text: 'theirs' }, mcp)
    expect(() => document.mergeFrom(other.mergeState(), { origin: 'merge' })).toThrow()
    expect(document.prompts()).toEqual(before)
  })
})

/**
 * The two fixtures were made by running real code, not by hand:
 *
 * 1. `prompt-written.ndjson` — this build: `recordPrompt`, two cubes and a Subtract, linked, then
 *    `serializeProject` (replica `aaaaaa`).
 * 2. `prompt-saved-by-v1.2.0.ndjson` — `git archive v1.2.0 src package.json` into a scratch folder
 *    (with this repo's `node_modules` linked in), then that release's own `parseProject`,
 *    `createDocument().loadEntries(…)` and `serializeProject` on file 1. It opened with no warning.
 *
 * Regenerate both the same way if the format changes; never edit them by hand.
 */
describe('an older build (v1.2.0) meets the record', () => {
  const written = /** @type {string} */ (fixtures['./__fixtures__/prompt-written.ndjson'])
  const savedByOlder = /** @type {string} */ (fixtures['./__fixtures__/prompt-saved-by-v1.2.0.ndjson'])

  it('the fixtures are present', () => {
    expect(written).toBeTypeOf('string')
    expect(savedByOlder).toBeTypeOf('string')
  })

  it('it opened the file and saved it with every record line intact, dropping only the prompts', () => {
    expect(recordLinesOf(savedByOlder)).toEqual(recordLinesOf(written))
    expect(stateLineOf(written).merge.prompts.length).toBeGreaterThan(0)
    expect(JSON.stringify(stateLineOf(savedByOlder))).not.toContain('prompts')
    // This build still opens what the older one saved.
    expect(open(savedByOlder).prompts()).toEqual([])
  })

  it('merging the newer copy back restores the prompts', () => {
    const older = open(savedByOlder, { replica: 'dddddd' })
    older.mergeFrom(open(written).mergeState(), { origin: 'merge' })
    expect(older.prompts()).toEqual(open(written).prompts())
  })
})

describe('promptsForBody', () => {
  it('finds the prompt that produced a body, and none for a body made by hand', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    const cube = placeCube(document)
    document.addPromptProduced(prompt.id, [cube], mcp)
    const mine = placeCube(document, 60)
    expect(promptsForBody(document, cube)).toEqual([document.promptOf(prompt.id)])
    expect(promptsForBody(document, mine)).toEqual([])
  })

  it('a boolean that consumed produced bodies does not orphan the prompt: the result shows it', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'two cubes, unioned by hand later' }, mcp)
    const a = placeCube(document)
    const b = placeCube(document, 10)
    document.addPromptProduced(prompt.id, [a, b], mcp)
    const union = document.nextId('bool')
    document.append({ id: union, op: 'boolean.union', name: 'Union 1', target: a, operands: [b], consumes: [a, b] }, local)
    expect(document.bodies().map((body) => body.id)).toEqual([union])
    expect(promptsForBody(document, union).map((p) => p.id)).toEqual([prompt.id])
  })

  it('a later edit of a produced body still shows its prompt', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    const cube = placeCube(document)
    document.addPromptProduced(prompt.id, [cube], mcp)
    document.append({ id: 'mv', op: 'transform.translate', supersedes: cube, target: cube, params: { vector: [5, 0, 0], rotation: [0, 0, 0] } }, local)
    expect(promptsForBody(document, cube).map((p) => p.id)).toEqual([prompt.id])
  })
})

/**
 * `TODO/ai-032`: the agent's reply, appended to the prompt it answers as ordered segments, each
 * its own stamped merge entry inside the prompt's record in `merge.prompts`.
 */
describe('a reply through the command layer', () => {
  it('appends a segment, leaving text and produced intact, and needs an origin', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    const cube = placeCube(document)
    document.addPromptProduced(prompt.id, [cube], mcp)
    const version = document.version
    expect(() => document.addPromptResponse(prompt.id, 'x', /** @type {any} */ ({}))).toThrow(/origin/)
    expect(document.version).toBe(version)

    const added = document.addPromptResponse(prompt.id, '  Done.‮ ', mcp)
    expect(added).toEqual({ id: expect.stringMatching(/^reply-aaaaaa-\d+$/), text: 'Done.', truncated: false })
    expect(document.version).toBe(version + 1)
    expect(document.promptOf(prompt.id)).toEqual({ id: prompt.id, text: 'a cube', produced: [cube], responses: [{ id: added.id, text: 'Done.' }] })
  })

  it('a second call appends; a prompt with no reply has no responses field', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    expect(document.promptOf(prompt.id)).not.toHaveProperty('responses')
    document.addPromptResponse(prompt.id, 'first', mcp)
    document.addPromptResponse(prompt.id, 'second', mcp)
    expect(document.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['first', 'second'])
    expect(document.prompts()[0].responses).toHaveLength(2)
  })

  it('refuses no prompt, an empty or non-string reply, changing nothing', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    expect(() => document.addPromptResponse('no-such-prompt', 'x', mcp)).toThrow(/no prompt/)
    for (const text of ['', '  ', 42, 'a'.repeat(1024 * 1024)]) {
      expect(() => document.addPromptResponse(prompt.id, /** @type {any} */ (text), mcp)).toThrow(/empty|text|over the cap/)
    }
    expect(document.promptOf(prompt.id)).not.toHaveProperty('responses')
  })

  it('cuts the segment that reaches the cap with …, then refuses further appends with a reason', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    document.addPromptResponse(prompt.id, 'a'.repeat(PROMPT_LIMITS.maxResponseLength - 10), mcp)
    const cut = document.addPromptResponse(prompt.id, 'b'.repeat(50), mcp)
    expect(cut.truncated).toBe(true)
    expect(cut.text.endsWith('…')).toBe(true)
    const total = (document.promptOf(prompt.id)?.responses ?? []).reduce((sum, r) => sum + r.text.length, 0)
    expect(total).toBe(PROMPT_LIMITS.maxResponseLength)
    const version = document.version
    expect(() => document.addPromptResponse(prompt.id, 'more', mcp)).toThrow(/full|cap/)
    expect(document.version).toBe(version)
  })

  it('hands out copies', () => {
    const document = createDocument()
    const prompt = document.recordPrompt({ text: 'x' }, mcp)
    document.addPromptResponse(prompt.id, 'reply', mcp)
    const read = /** @type {any} */ (document.promptOf(prompt.id))
    read.responses[0].text = 'changed'
    read.responses.push({ id: 'evil', text: 'evil' })
    expect(document.promptOf(prompt.id)?.responses).toEqual([{ id: expect.any(String), text: 'reply' }])
  })
})

describe('a reply in the file', () => {
  it('rides inside its prompt in merge.prompts, stamped; it round-trips byte-identical', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    const cube = placeCube(document)
    const plain = serializeProject(document)
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    const reply = document.addPromptResponse(prompt.id, 'Done.\n\nProblems met: none', mcp)
    const text = serializeProject(document)
    expect(recordLinesOf(text)).toEqual(recordLinesOf(plain))
    const [stored] = stateLineOf(text).merge.prompts
    expect(stored).toEqual({ id: prompt.id, text: 'a cube', responses: [{ id: reply.id, text: 'Done.\n\nProblems met: none', at: [expect.any(Number), 'aaaaaa'] }] })
    const reopened = open(text)
    expect(reopened.promptOf(prompt.id)).toEqual(document.promptOf(prompt.id))
    expect(serializeProject(reopened)).toBe(text)
    void cube
  })

  it('after a reload, a new reply is stamped later than the ones in the file', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    document.addPromptResponse(prompt.id, 'first', mcp)
    const reopened = open(serializeProject(document), { replica: 'bbbbbb' })
    reopened.addPromptResponse(prompt.id, 'second', mcp)
    expect(reopened.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['first', 'second'])
    const [first, second] = stateLineOf(serializeProject(reopened)).merge.prompts[0].responses
    expect(second.at[0]).toBeGreaterThan(first.at[0])
  })

  it('a hostile segment drops the whole prompt record with a warning, never half of it', () => {
    const document = createDocument({ replica: 'aaaaaa' })
    placeCube(document)
    const prompt = document.recordPrompt({ text: 'a cube' }, mcp)
    document.addPromptResponse(prompt.id, 'fine', mcp)
    const hostile = withMerge(serializeProject(document), (merge) => ({
      ...merge,
      prompts: [
        ...merge.prompts,
        { id: 'prompt-bad-1', text: 'ok', responses: [{ id: 'r', text: 'a‮b', at: [1, 'aaaaaa'] }] },
        { id: 'prompt-bad-2', responses: [{ id: 'r', text: 'orphan reply', at: [1, 'aaaaaa'] }] },
      ],
    }))
    const parsed = parseProject(hostile)
    expect([...(parsed.merge?.prompts?.keys() ?? [])]).toEqual([prompt.id])
    expect(parsed.warnings.filter((warning) => warning.op === PROMPT_OP).map((w) => w.id)).toEqual(['prompt-bad-1', 'prompt-bad-2'])
  })
})

describe('replies merge', () => {
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    const prompt = a.recordPrompt({ text: 'shared' }, mcp)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    return { a, b, prompt }
  }

  it('two replicas replying to one prompt keep both, in stamp order, in both merge orders and through the file', () => {
    const { a, b, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'from A', mcp)
    b.addPromptResponse(prompt.id, 'from B', mcp)
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))
    expect(canonicalJSON(mergeStates(sa, sb))).toContain('from A')
    a.mergeFrom(sb, { origin: 'merge' })
    b.mergeFrom(sa, { origin: 'merge' })
    const expected = a.promptOf(prompt.id)
    expect(expected?.responses?.map((r) => r.text).sort()).toEqual(['from A', 'from B'])
    expect(b.promptOf(prompt.id)).toEqual(expected)
    expect(open(serializeProject(a)).promptOf(prompt.id)).toEqual(expected)
    expect(expected?.text).toBe('shared')
  })

  it('a reply merged into a copy that lost the prompt brings the whole record back, never half of it', () => {
    const { a, b, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'done', mcp)
    // B's copy was saved by an older build, which dropped the prompts.
    const lost = withMerge(serializeProject(b), (merge) => {
      const { prompts, ...rest } = merge
      void prompts
      return rest
    })
    const older = open(lost, { replica: 'cccccc' })
    expect(older.prompts()).toEqual([])
    older.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    expect(older.promptOf(prompt.id)).toEqual(a.promptOf(prompt.id))
  })

  it('undo, delete and a failed merge leave the reply alone', () => {
    const { a, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'mine', mcp)
    a.appendAll([{ id: 'own', op: 'primitive.cuboid', name: 'Mine', params: { size: [5, 5, 5], center: [0, 50, 2.5] } }], local)
    a.undo()
    const before = a.prompts()
    expect(before[0].responses).toHaveLength(1)
    const other = createDocument({ replica: 'dddddd' })
    placeCube(other)
    expect(() => a.mergeFrom(other.mergeState(), { origin: 'merge' })).toThrow()
    expect(a.prompts()).toEqual(before)
  })
})

/**
 * `TODO/ai-032` decision 4: **Add reply…** appends through the command layer as the local user,
 * so it is an undo step. Undo leaves a tombstone — `{ id, at, removed: true }`, its text gone —
 * that the merge honours, so a replica still holding the segment cannot bring it back.
 */
describe('a reply added by hand is undoable', () => {
  function twoCopies() {
    const a = createDocument({ replica: 'aaaaaa' })
    placeCube(a)
    const prompt = a.recordPrompt({ text: 'shared' }, mcp)
    return { a, prompt }
  }

  it('a local reply is one undo step; Undo removes it, Redo puts the text back', () => {
    const { a, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'by an agent', mcp)
    expect(a.canUndo()).toBe(false)
    a.addPromptResponse(prompt.id, 'pasted by hand', { origin: 'local', label: 'Add reply' })
    expect(a.pendingUndo()?.label).toBe('Add reply')
    const version = a.version
    a.undo()
    expect(a.version).toBeGreaterThan(version)
    expect(a.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['by an agent'])
    expect(a.canRedo()).toBe(true)
    a.redo()
    expect(a.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['by an agent', 'pasted by hand'])
    a.undo()
    expect(a.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['by an agent'])
  })

  it('undoing the only segment leaves no responses field, and a tombstone without text in the file', () => {
    const { a, prompt } = twoCopies()
    const added = a.addPromptResponse(prompt.id, 'secret paste', local)
    a.undo()
    expect(a.promptOf(prompt.id)).not.toHaveProperty('responses')
    const text = serializeProject(a)
    expect(text).not.toContain('secret paste')
    expect(stateLineOf(text).merge.prompts[0].responses).toEqual([{ id: added.id, at: [expect.any(Number), 'aaaaaa'], removed: true }])
    const reopened = open(text)
    expect(reopened.promptOf(prompt.id)).not.toHaveProperty('responses')
    expect(serializeProject(reopened)).toBe(text)
  })

  it('the undo survives a merge with a replica that still has the segment, in both directions', () => {
    const { a, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'kept', mcp)
    a.addPromptResponse(prompt.id, 'taken back', local)
    const b = open(serializeProject(a), { replica: 'bbbbbb' })
    expect(b.promptOf(prompt.id)?.responses).toHaveLength(2)
    a.undo()
    a.mergeFrom(open(serializeProject(b)).mergeState(), { origin: 'merge' })
    expect(a.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['kept'])
    b.mergeFrom(open(serializeProject(a)).mergeState(), { origin: 'merge' })
    expect(b.promptOf(prompt.id)?.responses?.map((r) => r.text)).toEqual(['kept'])
    const sa = open(serializeProject(a)).mergeState()
    const sb = open(serializeProject(b)).mergeState()
    expect(canonicalJSON(mergeStates(sa, sb))).toBe(canonicalJSON(mergeStates(sb, sa)))
    expect(canonicalJSON(mergeStates(sa, sa))).toBe(canonicalJSON(sa))
  })

  it('a removed segment does not count against the cap', () => {
    const { a, prompt } = twoCopies()
    a.addPromptResponse(prompt.id, 'a'.repeat(PROMPT_LIMITS.maxResponseLength), local)
    a.undo()
    const again = a.addPromptResponse(prompt.id, 'b'.repeat(PROMPT_LIMITS.maxResponseLength), local)
    expect(again.truncated).toBe(false)
  })

  it('removePromptResponse needs an origin, names a missing prompt or segment, and is idempotent', () => {
    const { a, prompt } = twoCopies()
    const added = a.addPromptResponse(prompt.id, 'x', mcp)
    expect(() => a.removePromptResponse(prompt.id, added.id, /** @type {any} */ ({}))).toThrow(/origin/)
    expect(() => a.removePromptResponse('nope', added.id, mcp)).toThrow(/no prompt/)
    expect(() => a.removePromptResponse(prompt.id, 'reply-zzzzzz-9', mcp)).toThrow(/no reply segment/)
    expect(a.removePromptResponse(prompt.id, added.id, mcp)).toBe(true)
    expect(a.removePromptResponse(prompt.id, added.id, mcp)).toBe(false)
    expect(a.promptOf(prompt.id)).not.toHaveProperty('responses')
    expect(a.canUndo()).toBe(false)
  })

  it('a local reply is refused inside a batch, which stays atomic', () => {
    const { a, prompt } = twoCopies()
    expect(() => a.batch((doc) => doc.addPromptResponse(prompt.id, 'x', local))).toThrow(/batch/)
    expect(a.promptOf(prompt.id)).not.toHaveProperty('responses')
  })

  it('a tombstone that still carries text, or a removed flag that is not true, drops the record with a warning', () => {
    const { a, prompt } = twoCopies()
    const added = a.addPromptResponse(prompt.id, 'x', local)
    a.undo()
    for (const segment of [
      { id: added.id, at: [3, 'aaaaaa'], removed: true, text: 'smuggled' },
      { id: added.id, at: [3, 'aaaaaa'], removed: 'yes' },
    ]) {
      const hostile = withMerge(serializeProject(a), (merge) => ({ ...merge, prompts: [{ ...merge.prompts[0], responses: [segment] }] }))
      const parsed = parseProject(hostile)
      expect(parsed.merge?.prompts?.size ?? 0).toBe(0)
      expect(parsed.warnings.some((warning) => warning.op === PROMPT_OP)).toBe(true)
    }
  })
})

/**
 * The previous builds meet a reply. `prompt-response-written.ndjson` is this build's
 * `recordPrompt` + two cubes + two `addPromptResponse` calls, then a third added as `local` and
 * Undone — a tombstone — serialised (replica `aaaaaa`);
 * `prompt-response-saved-by-v1.4.0.ndjson` is that file opened and saved by v1.4.0's own code
 * (`git archive v1.4.0 src package.json`, this repo's `node_modules` linked in) — the release
 * that knows prompts but not replies. Never edit them by hand.
 */
describe('a previous build meets the reply', () => {
  const written = /** @type {string} */ (fixtures['./__fixtures__/prompt-response-written.ndjson'])
  const savedByV14 = /** @type {string} */ (fixtures['./__fixtures__/prompt-response-saved-by-v1.4.0.ndjson'])
  const savedByV12 = /** @type {string} */ (fixtures['./__fixtures__/prompt-saved-by-v1.2.0.ndjson'])

  it('the fixtures are present, and the written one has a reply and a tombstone', () => {
    expect(written).toBeTypeOf('string')
    expect(savedByV14).toBeTypeOf('string')
    const responses = stateLineOf(written).merge.prompts[0].responses
    expect(responses.filter((/** @type {any} */ r) => r.removed !== true).length).toBeGreaterThan(0)
    expect(responses.filter((/** @type {any} */ r) => r.removed === true)).toEqual([{ id: expect.any(String), at: expect.any(Array), removed: true }])
    expect(open(written).prompts()[0].responses).toHaveLength(2)
    expect(serializeProject(open(written))).toBe(written)
  })

  it('a legacy file with no reply, and one with replies but no tombstone, load and save unchanged', () => {
    const legacy = /** @type {string} */ (fixtures['./__fixtures__/prompt-written.ndjson'])
    expect(serializeProject(open(legacy))).toBe(legacy)
    expect(open(legacy).prompts()[0]).not.toHaveProperty('responses')
    const noTombstone = withMerge(written, (merge) => ({
      ...merge,
      prompts: merge.prompts.map((/** @type {any} */ p) => ({ ...p, responses: p.responses.filter((/** @type {any} */ r) => r.removed !== true) })),
    }))
    expect(serializeProject(open(noTombstone))).toBe(noTombstone)
  })

  it('the tombstone holds through v1.4.0: merging its copy (which still has nothing) back does not revive it', () => {
    const older = open(savedByV14, { replica: 'dddddd' })
    older.mergeFrom(open(written).mergeState(), { origin: 'merge' })
    expect(stateLineOf(serializeProject(older)).merge.prompts[0].responses.some((/** @type {any} */ r) => r.removed === true)).toBe(true)
    expect(older.prompts()[0].responses?.map((r) => r.text)).not.toContain('Pasted by hand, then undone.')
  })

  it('v1.4.0 kept every record line and the prompt, dropping only the reply', () => {
    expect(recordLinesOf(savedByV14)).toEqual(recordLinesOf(written))
    expect(JSON.stringify(stateLineOf(savedByV14))).not.toContain('responses')
    const reopened = open(savedByV14).prompts()
    expect(reopened.map((p) => p.text)).toEqual(open(written).prompts().map((p) => p.text))
    expect(reopened[0]).not.toHaveProperty('responses')
  })

  it('merging the newer copy back restores the reply; the other way round keeps it', () => {
    const older = open(savedByV14, { replica: 'dddddd' })
    older.mergeFrom(open(written).mergeState(), { origin: 'merge' })
    expect(older.prompts()).toEqual(open(written).prompts())
    const newer = open(written, { replica: 'eeeeee' })
    newer.mergeFrom(open(savedByV14).mergeState(), { origin: 'merge' })
    expect(newer.prompts()).toEqual(open(written).prompts())
  })

  it('a project with a reply survives a merge with v1.2.0’s fixture', () => {
    const document = open(/** @type {string} */ (fixtures['./__fixtures__/prompt-written.ndjson']), { replica: 'ffffff' })
    const [prompt] = document.prompts()
    document.addPromptResponse(prompt.id, 'the reply', mcp)
    const replied = document.promptOf(prompt.id)
    document.mergeFrom(open(savedByV12).mergeState(), { origin: 'merge' })
    expect(document.promptOf(prompt.id)).toEqual(replied)
  })
})
