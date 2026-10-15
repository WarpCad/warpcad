// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — reads the repo's files through Node; the app code it checks is typechecked.
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { buildHelp } from '../../scripts/help-build.mjs'
import { DEFAULT_TOPIC, TOPICS, resolveTopic } from './topics.js'

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs')
const built = buildHelp({ docsDir })

/**
 * The rot guard (`TODO/ui-061`): a docs page rename or a heading edit that strands a **?**
 * button fails here, not in a user's hands. Heading renames go in this map, not in each pop-up.
 */
describe('help topics', () => {
  it('the bundled docs build without a dead link', () => {
    expect(built.errors).toEqual([])
  })

  it('every topic points at a bundled page and an anchor that exists in it', () => {
    for (const [id, topic] of Object.entries(TOPICS)) {
      const page = built.pages[topic.page]
      expect(page, `topic "${id}" -> page "${topic.page}" is not in the bundle`).toBeDefined()
      if (topic.anchor !== undefined) {
        const ids = page.headings.map((h) => h.id)
        expect(ids, `topic "${id}" -> "${topic.page}#${topic.anchor}" has no such heading`).toContain(topic.anchor)
      }
    }
  })

  it('every topic has a tool name the button can announce', () => {
    for (const [id, topic] of Object.entries(TOPICS)) expect(topic.title.length, id).toBeGreaterThan(0)
  })

  it('covers the tool surfaces the TODO lists', () => {
    for (const id of [
      'boolean', 'group', 'align', 'mirror', 'fillet', 'chamfer', 'resize', 'bisect',
      'export', 'resolution', 'sketch', 'curve', 'slices', 'extrude', 'trace', 'scale', 'reference-image',
      'library', 'save-to-library', 'project-settings', 'assistant', 'file', 'split',
    ]) {
      expect(TOPICS, id).toHaveProperty(id)
    }
  })

  it('Snap and Align are one tool with one topic (TODO/ui-060)', () => {
    expect(TOPICS).not.toHaveProperty('snap')
    expect(TOPICS.align).toMatchObject({ page: 'snap-align', title: 'Align' })
  })

  it('resolves an unknown id to the Getting started page rather than throwing', () => {
    expect(resolveTopic('no-such-tool')).toEqual({ page: TOPICS[DEFAULT_TOPIC].page, anchor: undefined })
  })

  it('the default topic is Getting started', () => {
    expect(TOPICS[DEFAULT_TOPIC].page).toBe('getting-started')
  })
})
