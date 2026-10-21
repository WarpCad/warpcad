// SPDX-License-Identifier: AGPL-3.0-or-later
// @ts-nocheck — reads the repo's files through Node; the app code it checks is typechecked.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { TOPICS } from './topics.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const componentsDir = join(root, 'src', 'components')

/** @param {string} dir @returns {string[]} */
function walk(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : name.endsWith('.vue') ? [full] : []
  })
}

const files = walk(componentsDir).map((full) => ({
  path: relative(root, full).split('\\').join('/'),
  source: readFileSync(full, 'utf-8'),
}))

/** Does the source render a pop-up, popover, sheet or dialog of its own? */
const isPopup = (source) => /role="dialog"|aria-modal|<ModalShell|ops__popover"|<Teleport/.test(source)

/**
 * Pop-ups that show a tool or settings surface carry a **?** (`HelpButton`, or a `helpTopic` on
 * `ModalShell`). These are the ones that deliberately do not, each with its reason — a
 * confirmation that asks one yes/no question has nothing to document, and the File menu is
 * itself where Help lives. A new pop-up fails here until it is either wired or named.
 */
const EXCEPTIONS = Object.freeze({
  'src/components/storage/ModalShell.vue': 'the frame itself: it renders the button for any dialog that passes helpTopic',
  'src/components/storage/FileMenu.vue': 'the menu that holds the Help entry; its dialogs are listed below',
  'src/components/storage/ReplaceConfirmDialog.vue': 'a one-question confirm; nothing to document beyond its own text',
  'src/components/storage/DiskChangeDialog.vue': 'a one-question confirm about a changed file',
  'src/components/storage/ConflictDialog.vue': 'a conflict prompt documented by the page it links from, not by a tool',
  'src/components/inspector/DependentRepairDialog.vue': 'a repair prompt named by what is broken, not a tool',
  'src/components/inspector/VariableUsageDialog.vue': 'a delete-confirm',
  'src/components/layout/UserPartMenu.vue': 'a row menu with rename/delete confirms',
  'src/components/layout/HelpSheet.vue': 'the help itself',
  'src/components/layout/LibraryRowPopout.vue': 'one Library row\'s settings; the rail\'s own ? (LibraryPanel) is the help for the Library',
})

/** Surfaces with headers that are not caught by the pop-up test above but are named in the TODO. */
const SURFACES = Object.freeze([
  'src/components/viewport/OperationsToolbar.vue',
  'src/components/viewport/AlignPopover.vue',
  'src/components/storage/ExportPopover.vue',
  'src/components/storage/ResolutionPopover.vue',
  'src/components/storage/ProjectSettingsDialog.vue',
  'src/components/storage/ConnectDialog.vue',
  'src/components/sketch/SketchPanelSheet.vue',
  'src/components/sketch/ReferenceImagePanel.vue',
  'src/components/sketch/TraceTool.vue',
  'src/components/sketch/ScaleTool.vue',
  'src/components/layout/LibraryPanel.vue',
  'src/components/layout/SaveToLibrarySheet.vue',
  'src/components/features/SplitSheet.vue',
  'src/components/viewport/RepeatSheet.vue',
  'src/components/ai/ChatPanel.vue',
  'src/components/ai/KeySheet.vue',
  'src/components/ai/SubscriptionRoute.vue',
  'src/components/ai/ConnectClaudeCode.vue',
])

describe('every tool pop-up carries a help button (TODO/ui-061)', () => {
  it('the named surfaces each use HelpButton or pass helpTopic', () => {
    for (const path of SURFACES) {
      const file = files.find((f) => f.path === path)
      expect(file, `${path} exists`).toBeDefined()
      const wired = /<HelpButton\b/.test(file.source) || /\bhelp-topic=|\bhelpTopic=|:help-topic=/.test(file.source)
      expect(wired, `${path} has a help button`).toBe(true)
    }
  })

  it('any other component that renders a pop-up is a named exception', () => {
    const unnamed = files
      .filter((f) => isPopup(f.source))
      .filter((f) => !SURFACES.includes(f.path) && !(f.path in EXCEPTIONS))
      .map((f) => f.path)
    expect(unnamed, 'wire a HelpButton, or add the file to EXCEPTIONS with a reason').toEqual([])
  })

  it('the exceptions still exist, so the list cannot rot either', () => {
    for (const path of Object.keys(EXCEPTIONS)) expect(files.some((f) => f.path === path), path).toBe(true)
  })

  it('every topic id a component names exists in the topic map', () => {
    for (const file of files) {
      const literal = [
        ...file.source.matchAll(/<HelpButton\b[^>]*?\stopic="([\w-]+)"/g),
        ...file.source.matchAll(/\shelp-topic="([\w-]+)"/g),
      ].map((m) => m[1])
      // A bound topic (`:topic="a ? 'x' : 'y'"`): every quoted literal in the expression.
      const bound = [...file.source.matchAll(/<HelpButton\b[^>]*?:topic="([^"]*)"/g)].flatMap((m) =>
        [...m[1].matchAll(/'([\w-]+)'/g)].map((q) => q[1]),
      )
      const ids = [...literal, ...bound]
      for (const id of ids) expect(TOPICS, `${file.path} names unknown topic "${id}"`).toHaveProperty(id)
    }
  })
})
