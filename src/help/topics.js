// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The tool-to-docs map (`TODO/ui-061`): one stable **topic id** per tool surface, mapped to the
 * bundled docs page and the `##` heading it should open on. A pop-up names a topic id — never a
 * URL or a page — so a docs rename touches this file and nothing else.
 *
 * `src/help/topics.spec.js` builds the real `docs/` and fails when a topic's page or anchor is
 * not in it; that is what keeps a **?** button from quietly rotting. A page slug is the file name
 * without `.md`; an anchor is GitHub's id for the heading (`slugify` in `scripts/help-build.mjs`).
 *
 * **Heading renames** (record them here, per the TODO): `TODO/ui-060` folded Snap and Align
 * into one Align tool, so the `snap` topic is gone and `align` is the only one for that page.
 *
 * @module help/topics
 */

/**
 * @typedef {object} HelpTopic
 * @property {string} page bundled page slug (`docs/<page>.md`)
 * @property {string} [anchor] heading id on that page; omitted opens the page at its top
 * @property {string} title the tool's name, as the button announces it ("Help: Align")
 */

/** The topic the main Help entry opens. */
export const DEFAULT_TOPIC = 'getting-started'

/** @type {Readonly<Record<string, HelpTopic>>} */
export const TOPICS = Object.freeze({
  'getting-started': { page: 'getting-started', title: 'Getting started' },
  contents: { page: 'readme', title: 'All pages' },
  updating: { page: 'help', anchor: 'updating-warpcad', title: 'Updating WarpCad' },
  // The Operations toolbar.
  boolean: { page: 'booleans', anchor: 'you-need-at-least-two-shapes-selected', title: 'Union, Subtract and Intersect' },
  group: { page: 'groups', anchor: 'you-need-at-least-two-shapes-selected', title: 'Group' },
  align: { page: 'snap-align', anchor: 'the-popovers-fields', title: 'Align' },
  mirror: { page: 'mirror', anchor: 'the-two-fields', title: 'Mirror' },
  fillet: { page: 'fillet-chamfer', anchor: 'the-popovers-fields', title: 'Fillet' },
  chamfer: { page: 'fillet-chamfer', anchor: 'the-popovers-fields', title: 'Chamfer' },
  resize: { page: 'resize-bisect', anchor: 'the-popovers-fields', title: 'Enlarge and Fit' },
  bisect: { page: 'resize-bisect', anchor: 'a-worked-example-bisect', title: 'Bisect' },
  split: { page: 'print-prep', anchor: 'the-split-sheet', title: 'Split' },
  repeat: { page: 'snap-align', anchor: 'repeating-a-placement-on-every-hole', title: 'Repeat' },
  // The File menu's popovers and dialogs.
  file: { page: 'save-load', anchor: 'the-file-menu', title: 'File menu' },
  export: { page: 'export', anchor: 'exporting-a-file-step-by-step', title: 'Export' },
  resolution: { page: 'resolution', anchor: 'the-four-settings', title: 'Resolution' },
  'project-settings': { page: 'design-intent', anchor: 'set-your-projects-standing-instructions', title: 'Project settings' },
  hosted: { page: 'save-load', anchor: 'keeping-a-copy-in-a-github-repository', title: 'Hosted storage' },
  // The header's Share sheet (`TODO/io-016`).
  share: { page: 'sharing', anchor: 'send-a-project', title: 'Share' },
  // Sketching.
  sketch: { page: 'sketch-mode', anchor: 'the-four-drawing-tools', title: 'Sketch' },
  slices: { page: 'sketch-mode', anchor: 'slices', title: 'Slices' },
  curve: { page: 'sketch-mode', anchor: 'curves-and-airfoils', title: 'Curve' },
  extrude: { page: 'sketch-mode', anchor: 'extrusion-methods', title: 'Extrude' },
  trace: { page: 'sketch-tracing', anchor: 'auto-trace', title: 'Trace' },
  scale: { page: 'sketch-tracing', anchor: 'setting-the-scale-from-the-ruler', title: 'Set scale' },
  'reference-image': { page: 'sketch-tracing', anchor: 'loading-the-photo', title: 'Reference image' },
  // The Library and saved parts.
  library: { page: 'primitive-placement', anchor: 'where-the-library-panel-is', title: 'Library' },
  'import-model': { page: 'user-library', anchor: 'importing-a-model-file', title: 'Import a model file' },
  'save-to-library': { page: 'user-library', anchor: 'a-worked-example-a-standoff', title: 'Save to library' },
  // The Inspector and its neighbours.
  variables: { page: 'variables', anchor: 'binding-a-field-to-a-variable', title: 'Variables' },
  // The Assistant.
  assistant: { page: 'ai-partner', anchor: 'asking-for-a-part', title: 'Assistant' },
  'assistant-key': { page: 'ai-partner', anchor: 'getting-a-key', title: 'Assistant key' },
  'assistant-subscription': { page: 'ai-partner', anchor: 'no-api-key-use-your-subscription', title: 'Claude Code route' },
  'claude-code': { page: 'mcp', anchor: 'live-mode-an-mcp-agent-edits-the-project-you-have-open', title: 'Live MCP access' },
})

/**
 * Resolve a topic id to the page and anchor to open. An unknown id never throws: a typo in a
 * pop-up must still give the user the docs, so it falls back to the Getting started page.
 *
 * @param {string} id
 * @returns {{ page: string, anchor: string | undefined }}
 */
export function resolveTopic(id) {
  const topic = TOPICS[id] ?? TOPICS[DEFAULT_TOPIC]
  return { page: topic.page, anchor: topic.anchor }
}

/**
 * The tool name a button announces for a topic id (falls back to the id itself).
 *
 * @param {string} id
 * @returns {string}
 */
export function topicTitle(id) {
  return TOPICS[id]?.title ?? id
}
