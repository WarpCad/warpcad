---
title: Give variables a description so the label stays short, and stop the Variables row squeezing its name into a sliver
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from an owner report (screenshot of an agent-made project)
depends: []
status: done
---

> **What shipped (2026-11-20).** As proposed, plus: the `⋯` button got its own CSS rule (it had been sharing `.vrow__input`'s `flex: 1` through a dangling selector, which the new title row exposed), the Variables row's `variable-name` testid sits on the identifier (or on the title when there is no label), and a `describe_variable` row went into `docs/mcp.md` and the generated `docs/agent-prompting.md` (no variable rows exist in `docs/webmcp.md`). Older builds refuse a record with `description`; recorded in `docs/decisions/project-variables.md` and asked as OWNER.md Q115. The owner's own project is not migrated: the next agent session can call `describe_variable` to split each long label. Acceptance 21, 23, 27 and 33 are covered by green specs (not hand-driven); `ui-145`'s focus-ring spec and `ai-014`'s `document_data` trust checks pass.

## Problem

An Opus agent defined a project's variables through the AI tools and put each variable's reasoning
into its `label`. In the Variables panel, the owner's screenshot (laptop width, inspector at its
default width) shows the row for `wall` as:

> Wall thickness (4 × 0.4 mm passes = 1.6) · wall    used by 43 · read by 3 formulas    ⋯

with the label broken one syllable per line ("Wall / thic / kne / ss / (4 × / 0.4 / mm / pas /
ses …"), 19 lines tall, and `fitClearance` ("Spigot-to-socket clearance per side") the same. Two
faults combine:

1. **There is nowhere else for the explanation to go.** A variable record has `name`, `label`,
   `unit`, `min`, `max` and `options` (`src/core/variables.js`, `var.define` and `var.derive`), and
   nothing for *why*. The AI tool schema calls `label` an "Optional display name for the Variables
   panel, at most 80 characters" (`src/ai/tools/variables.js:131` and `:165`), so an agent that
   wants to record its reasoning has only `label` to put it in, and 80 characters lets it. That
   reasoning is design intent, which `CLAUDE.md`'s AI Partner section says the document should
   keep. The fix is to give it its own field, not to throw it away.
2. **The row gives the name the least room.** `VariableRow.vue:163` renders
   `` `${label} · ${name}` `` in `.vrow__name` (`flex: 1; min-width: 0; overflow-wrap: anywhere`),
   and the usage text beside it is `white-space: nowrap` (`.vrow__used`). The usage text never
   shrinks, so the name column takes what is left, which here is about four characters, and
   `overflow-wrap: anywhere` then breaks mid-word. A short label would hide this at laptop width,
   but a 30-character label still breaks at phone width (390 px).

A person can't fix either fault from the app: the add form (`VariableAddForm.vue`) has no label
field and the row's `⋯` menu offers only Rename and Delete, so a label can be set only through
MCP, WebMCP or the Assistant.

## Interaction model

- **Precondition:** a project with at least one variable; the Variables section of the inspector
  is open.
- **Trigger:**
  - *Reading:* the row shows the label (or the name when there is no label) as its title, the
    `name` beneath it in the small monospace style used for identifiers, and the description beneath that in muted
    text, clamped to two lines with a **More** / **Less** toggle (`data-testid="variable-description-toggle-<name>"`)
    when it runs longer.
  - *Editing:* the row's `⋯` menu gains **Edit label and description…**
    (`data-testid="variable-describe-<name>"`), which opens an inline editor in the row, the same
    pattern as Rename: a one-line **Label** input and a multi-line **Description** textarea, with
    **Save** and **Cancel**. Enter in the label field saves, and Escape cancels.
  - *Creating:* the add form gains an optional **Description** textarea under Name (collapsed
    behind an "Add a description" link at phone width so the form stays short).
- **Feedback:** the row's title and description update at once. The change is one undoable step
  labelled `Describe <name>`, and Undo restores both fields. A label over the new length limit is
  refused inline with the limit and a pointer to the Description field, the same way a range is
  refused (`vrow__error`).
- **Placement:** n/a (no geometry).
- **Selection response:** n/a. The Variables panel doesn't depend on viewport selection.
- **Selection count:** n/a.
- **Small-screen behavior:** not the same as desktop. At every width the usage text ("used by 43
  · read by 3 formulas") wraps under the title instead of competing with it for the line, so the
  title always gets the full row width minus the `⋯` button. At phone width the usage text goes
  on its own line. The title never breaks mid-word (`overflow-wrap: break-word`, not `anywhere`).

## Documentation

- **Page:** `docs/variables.md`. Add a "Label and description" subsection, and update the
  `define_variable` / `define_formula` rows and the new `describe_variable` row in `docs/mcp.md`
  and `docs/webmcp.md`. `docs/agent-prompting.md` gets one sentence: keep labels short and put
  the reasoning in the description.
- **Example:** "Open the Variables section. On the `wall` row, tap **⋯ → Edit label and
  description…**. Type `Wall thickness` as the label and `4 × 0.4 mm nozzle passes = 1.6 mm` as
  the description, then tap **Save**. The row now reads **Wall thickness** with `wall` under it
  and the description below that. Press Undo (⌘Z / Ctrl+Z) and both go back."
- **Media:** re-shoot `docs/screenshots/variables-panel.png` (`e2e/docs/variables.docs.js`) with
  a labelled, described variable in it, and add `docs/screenshots/variable-describe.png` showing
  the inline editor, embedded in the new subsection.

## Affected files

- `src/core/variables.js`: `description?` on `var.define` and `var.derive` (validator's allowed-key
  sets at `:339` and `:438`, typedefs at `:141`, `:157`, `:212`). New `VARIABLE_LIMITS`
  entries: `maxDescriptionLength` (500) and `maxNewLabelLength` (40). A new command,
  `describeVariable(document, name, { label?, description? }, transaction)`, revises the record
  through `document.reviseRecords`, the same as `setVariableRange` (`:1633`).
- `src/ai/tools/variables.js`: `description` on `define_variable` and `define_formula`. A new
  `describe_variable` tool. `list_variables` returns `description` (inside the `document_data`
  block, like `label`). Rewrite the `label` property description (see Proposed fix).
- `src/ai/tools/limits.js`, `src/ai/tools/index.js`: register the new tool and its cap.
- `src/components/inspector/VariableRow.vue`: title/name/description layout, the CSS fix, the
  menu item and the inline editor (or a new `VariableDescribeForm.vue` if the row would pass
  about 30 template lines, per `CLAUDE.md`'s "Views stay thin").
- `src/components/inspector/VariableAddForm.vue`: the optional Description field.
- `src/composables/useVariableCommands.js`: wire `describeVariable` with the `user` origin.
- `src/core/gistReadme.js`: the Variables table gains a **Notes** column from `description`
  (one line, escaped and capped the way names already are).
- `mcp/server.spec.js`: the trust-model case at `:624` also covers `description`.

## Proposed fix

1. **Schema.** `description` is optional plain text, at most 500 characters, newlines allowed,
   on both `var.define` and `var.derive`. It never resolves, binds or folds; `document.js` routes
   variable records past the kernel already, so the fold is untouched. A file written by an older
   build has no `description` and loads unchanged. An older build that loads a newer file
   with one must not refuse the record: check whether the allowed-key check at `:339` / `:438`
   would refuse it. If it would, say so in the decision record (`docs/decisions/project-variables.md`),
   because it means the field needs the project-file version bump `data-011` describes and not a
   silent addition.
2. **Label length.** Keep the core validator at 80 so existing projects (including the owner's)
   still load. Enforce the new 40-character cap only where a label is *written*: the
   `define_*` and `describe_variable` tools and the UI editor. The refusal text says "labels are
   at most 40 characters; put the explanation in description".
3. **Agent guidance.** Change the `label` property description to: "Optional short display name,
   2–4 words, at most 40 characters (e.g. "Wall thickness"). No numbers or reasoning; put those
   in `description`." Give `description` this description: "Optional note on why this value: its
   source, the arithmetic behind it, what it must clear. Shown under the name in the Variables
   panel." Agents follow schema text, and this is the text that produced the screenshot.
4. **`describe_variable` tool.** `{ name, label?, description? }`, where `""` clears a field and
   omitting a field leaves it as it is. One `ai`/`mcp`/`webmcp`-origin transaction. Agents can then
   repair projects like the owner's without redefining anything.
5. **Row layout.** Title line: label or name, then the `⋯` button. The second line is the name,
   when a label is shown, followed by the usage text, wrapping as needed. The description goes
   below that. Drop `white-space: nowrap` from `.vrow__used` (or move it to its own line) and use
   `overflow-wrap: break-word` on the title. Keep every existing `data-testid`, and make
   `variable-name` still hold the name, because specs read it.
6. **Owner's project.** Nothing is migrated automatically. Once this lands, the next agent session
   can call `describe_variable` to split each long label. Note this in the closing message.

## Effort

M (a few hours): one schema field, one command, one tool, one row redesign, docs.

## Testing

- **Unit (`src/core/variables.spec.js`):** `description` accepted on both ops, 500 accepted
  and 501 refused, non-string refused, absent loads unchanged. `describeVariable` sets, clears and
  leaves fields as the call says, and is one undo step. The 81-character label in an existing
  record still loads, and a new 41-character label written through the command is refused.
- **Unit (`src/ai/tools/variables.spec.js`):** `define_variable` / `define_formula` carry
  `description`. `describe_variable` refuses an unknown name and a 41-character label with the
  pointer text. `list_variables` returns `description`. The `label` schema text names the
  40-character cap.
- **Unit (`mcp/server.spec.js`):** extend the `:624` case so a hostile `description` comes back
  only inside the `document_data` block.
- **Unit (`src/core/gistReadme.spec.js`):** the Notes column, with a description containing a
  pipe, a newline and Markdown.
- **E2E (`e2e/variables.e2e.js`, navigates to `/`):** define `wall` with the screenshot's long
  label through the page's test hook, then use **⋯ → Edit label and description…** to set a
  short label and a description. Assert the title's rendered height is one line at each viewport
  (the regression check for the sliver), that the name and description are shown, that the
  More/Less toggle shows the whole description and clamps it again, that Undo restores both, and
  that a save and reload keeps them. Runs at **all three viewports** with a snapshot of the row at
  each (the small-screen behavior differs). It also runs on **all three engines**, because it goes through
  IndexedDB persistence (`CLAUDE.md`, Browser Support).
- **Acceptance scenarios to re-drive:** 21 (create, bind, change, undo, save, reload a variable),
  33 (a formula variable, which also gets `description`), 27 (WebMCP agent, which drives the new
  tool) and 23 (MCP agent edits the open file).
- **Closed findings to re-run:** `ai-014` (project variable tools): re-run its tool-limit and
  `document_data` trust checks against the new tool. Also re-run `ui-145`'s "Edit variable" focus
  ring on a row with a description, so the inset border still doesn't shift the row.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
