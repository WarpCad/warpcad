---
title: Give prompts and replies their own view, with highlighting, part links and editing
category: ui
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: open
---

## Goal

**In user terms:** the Inspector's **Prompt** row (`ai-031`, `ai-032`) works when one request made one
part. With several requests, or one request that made many parts, it stops making sense. The owner
opened the Fan Duct project, selected a part, and found two identical **Add reply…** buttons with
nothing to say which request each belonged to, for a project built from a single request.

Done means:

1. **A Prompts view**, opened from the top level of the Inspector, lists every request in the project
   with its reply and the parts it made.
2. **Hovering a request lights up the parts it made** in the 3D view. Touch and keyboard get the same
   answer, since a phone has no hover.
3. **Inspecting a part links to the request** that made or changed it, and says which of those it was.
4. **Replies and requests can be edited**, including joining a request that was split in two.
5. **A long request stays one request.** Today's cap is the reason this one was split.

### What actually happened in the Fan Duct file

Found 2026-11-02 by reading `~/Documents/fan-duct.ndjson`:

- `merge.prompts` holds two records, `prompt-g5mvit-1` (2,025 characters) and `prompt-g5mvit-2` (2,318).
- Their texts joined by one blank line are **exactly** `~/Documents/fan-duct.prompt.txt` (4,345
  characters). The owner sent one request. It was cut in two at a section break, and the cap is
  `PROMPT_LIMITS.maxTextLength` = 4,000 (`src/core/prompt.js:53`).
- Both records list the same 497 `produced` ids, which is **every** record in the file, including
  variables, renames and three dead records.
- `ai-031`'s binding cannot produce that: `record_prompt` replaces `ctx.prompt`, so each write links to
  one prompt only (`src/ai/tools/prompt.js`). The file was written at 12:56 on 2026-10-28, 12 minutes
  after `ai-031` was committed and 2 minutes after `fan-duct.prompt.txt`. So this was a **one-time
  backfill of a file built before prompts existed**, not something the running code does. Who ran it is
  not recorded.

So there are two separate problems. The UI can't explain several prompts on one part, and that is true
for any project. The 4,000-character cap is what pushes a long request to be cut or split. An agent
calling `record_prompt` today gets the text cut with `…`, and its tool description says "Call it once"
without saying what to do about a long request.

**Do not change `~/Documents/fan-duct.ndjson`.** Combine (below) is how the owner repairs it.

## Interaction model

**Open the view**

- **Precondition**: the project holds at least one prompt. With none, the control is not shown. Not in
  the sketch editor (`panelState === 'sketch'`), where the Objects section is hidden for the same reason.
- **Trigger**: at tablet and laptop width, a **Prompts (N) ›** bar at the top level of the Inspector,
  directly under the Objects section, in every panel state (`inspector-prompts-open`). At phone width, a
  third **Prompts** tab in `InspectorViewTabs.vue`, beside Inspector and Variables
  (`inspector-view-prompts`), with no bar.
- **Feedback**: the Inspector's content is replaced by the list (`prompts-view`), with a **‹ Inspector**
  back button at tablet and laptop width. It is a view inside the panel, not a modal, so the 3D view
  stays visible and usable. Selection is unchanged by opening or closing it.

**Read a request**

- **Row, collapsed** (`prompts-row`): the request's first line, up to two lines, ellipsised; **N parts**;
  and **Reply** or **No reply**. Oldest request first. A row whose parts are all gone reads **No parts
  left**. A row that only changed variables reads **No parts**. Parts are live bodies, not `produced`
  ids, so 497 records never reads as "497 parts".
- **Trigger**: click, tap, Enter or Space toggles the row (a real `button`, `aria-expanded`).
- **Row, expanded**: the full request, the reply (collapsed to a few lines with **Show all**, as
  `PromptReply.vue` does today), the list of parts, and the edit controls. Every request has exactly one
  **Add reply…**, and it is inside that request's own row. That is what removes the two-button problem.
- **Part list**: each part's name and a role, **Made**, **Changed** or **Went into** (a body this request
  made that a later boolean consumed; the row names the result). A hidden part says **hidden**.

**See what a request made**

- **Trigger**: pointer hover or keyboard focus on a row, or a row being expanded. Hover and focus win
  over an expansion while they last.
- **Feedback**: every live part of that request paints in the existing hover tint with its x-ray twin, so
  a part inside another still shows. An expanded row's highlight stays until it collapses or the view
  closes, and the row says **Highlighting N parts**. That is the touch path. Hovering or focusing one
  part row highlights only that part. A hidden part lights nothing, as `ui-089` already rules. The camera
  does not move.

**From a part to its request**

- **Precondition**: the selected body has at least one prompt. A sub-part shows its body's prompts; the
  row is hidden for sub-parts today (`Inspector.vue:855`).
- **Trigger**: the Inspector's **Prompt** row becomes a compact link (`inspector-prompt-link`, 44 px tall).
  One prompt: **Made by** or **Changed by** and its first line, then **›**. Several: **Made by 1, changed
  by 2 ›**, or **2 prompts ›** where the roles match. Several bodies selected: the existing **2 prompts**
  count becomes the same link. A mouse hover on the link highlights as a row does.
- **Feedback**: the Prompts view opens with that request expanded and scrolled into view. With several,
  it is filtered to them, with a **For Fan Duct · Show all** line. The request text, the reply and **Add
  reply…** no longer render in the Inspector itself.
- **Selecting from the view**: tapping a part row selects that body and returns to the Inspector, whose
  normal selection feedback and gizmo apply.

**Edit**

- **Precondition**: the row is expanded, the project is editable, and this is not the read-only **Watch**
  view of an AI turn. Agents get no tool for any of this: these are local-user commands only.
- **Reply**: **Add reply…** (today's control, moved), **Edit reply** (a text area holding the whole reply)
  and **Remove reply**.
- **Request**: **Edit request** and **Remove request**. Removing a request removes the record only, and
  its parts stay.
- **Combine**: **Combine with next** on any row but the last. The result reads `this`, a blank line, then
  `next`. It keeps the union of their parts and both replies. Refused in words if it would pass the cap.
- **Feedback**: the row updates at once, and each action is one step on the top-bar **Undo** (`Edit
  reply`, `Edit request`, `Remove request`, `Combine requests`). An edited request shows **Edited · Show
  original**.

**Not applicable**: **Placement** (n/a, nothing is placed). **Selection count**: n/a for opening the view;
the part link needs one or more selected bodies, as the row does today.

**Small-screen behavior**: not the same as desktop. The view lives in the bottom sheet as a third tab, and
the sheet must leave the 3D view visible above it. Every control is a 44 px target, no text field or row
scrolls the page sideways at 390 px, and highlighting works by expanding a row, with no hover needed.

## Documentation

- **Page**: `docs/design-intent.md` ("The prompt is saved with the part": replace the Inspector-row
  description with the view, and state that an edited request does not rewrite History's notes);
  `docs/ai-partner.md` ("The reply is saved with your request": **Add reply…** moves, and Edit and Remove
  join it); `docs/mcp.md` (the **Add reply…** paragraph near line 410, and the new cap). The 4,000-character
  line in `design-intent.md` changes with the cap.
- **Example**: "Open a project an agent built and tap **Prompts** at the top of the Inspector. Move the
  pointer over a request: the parts it made light up in the 3D view. On a phone, tap the request instead,
  and tap it again to stop. Select any part, tap **Made by…** in the Inspector, and the view opens at that
  request. If one request arrived as two, expand the first, tap **Combine with next**, and press **Undo**
  if you change your mind."
- **Media**: update `e2e/docs/agent-prompt.docs.js`. `docs/screenshots/agent-prompt-row.png` becomes the
  compact link (embedded in `design-intent.md` and `ai-partner.md`). Add `prompts-view.png` (laptop, a row
  highlighting its parts, `design-intent.md`) and `prompts-view-phone.png` (phone, the third tab with a row
  expanded, `ai-partner.md`).

## Affected files

- `src/core/prompt.js`: the cap; `bodiesForPrompt` and a prompt-to-parts index with roles; the `edit` and
  `removed` fields (validation, `joinPromptMaps`).
- `src/core/document.js:4775-4835`: the new local commands; `promptRecordOf` applies the edit and hides a
  removed prompt.
- `src/core/merge/section.js`, `src/core/merge/validate.js`: carry the new fields.
- `src/stores/document.js`: wrappers, each one undo step.
- `src/stores/hoverHighlight.js`: several bodies at once.
- `src/components/viewport/Viewport.vue:2098-2215,3902-3905`: paint several; `applyHover` and
  `removeHoverArtifacts` handle many twins.
- `src/components/inspector/Inspector.vue`: the bar, the view's mount point, `data-view`.
- `src/components/inspector/InspectorViewTabs.vue`, `src/stores/variablesUi.js`: the third view.
- `src/components/inspector/PromptRow.vue`: becomes the compact link.
- `src/components/ai/PromptReply.vue`: moves into the view.
- New: `src/components/inspector/PromptsView.vue`, `src/components/inspector/PromptsViewRow.vue`.
- `src/ai/tools/prompt.js`, `src/ai/mcpInstructions.js`: "one request, one call, never split".
- `src/ai/documentData.js`, `src/core/gistReadme.js`, `src/ai/tools/read.js`: hide removed prompts and read
  the edited text.
- `docs/decisions/ai-partner.md` (trust model), `docs/decisions/document-sync.md` (merge rule).

## Proposed fix

Five parts, in this order. Each can land as its own commit; Part 3 is usable without Part 4.

### Part 1: a long request stays one request

- Raise `maxTextLength` from 4,000 to **20,000**, matching `maxResponseLength`. `maxInputLength` stays
  64,000.
- `validatePromptRecord` refuses over-cap text outright, so a released build will refuse a longer record.
  **Check by fixture** that it drops only that prompt, with its load warning, and that merging a newer copy
  restores it, as `prompt-saved-by-v1.2.0.ndjson` proves for prompts generally.
- `ai-032` left open that long replies can pass the merge section's 8 MB `maxBytes`. Longer prompts make
  that more likely (500 × 20,000 is already over it). Test what happens at the limit, and make it a refusal
  in words rather than a failed save.
- Check that `promptsBlock` (`src/ai/documentData.js`) and the gist README's caps still bound what they emit.
- Tell agents: `record_prompt` once per request, in full, never split across calls. Keep the instruction
  within the 2,048-character limit on server instructions that `ai-032` hit.

### Part 2: which parts a request made

- `src/core/prompt.js` gains the inverse of `promptsForBody`, keeping its `idsMakingUp` rule so the two can
  never disagree: given a prompt, its live bodies, each with a role.
  - **Made**: the body's lineage root is in `produced`.
  - **Changed**: a later record in its lineage is, but the root is not.
  - **Went into**: only a body it consumed is. Reported against the live result.
  - A body may be Made by one prompt and Changed by another. Both prompts list it.
- Build the whole index once per `documentStore.version`, in a computed, so the view never walks lineages per
  row or per hover. Core stays framework-free, and these are plain numerical-style unit tests.
- **Check the order.** `joinPromptMaps` sorts ids with plain string compare, so `prompt-x-10` sorts before
  `prompt-x-2` after a merge, while `PromptRow.vue` and `gistReadme.js` both promise "oldest first". If it
  holds, order by the id's numeric counter, the same in every merge order.

### Part 3: the view, the highlight and the link

- `useHoverHighlightStore` gains `setHoverMany(bodyIds)`, and `target` stays the one-body case so
  `ObjectList.vue` and `DependentRepairDialog.vue` do not change. Keep its rules: fresh frozen value per
  change, repeat writes refused. The store's `watch` prunes a body that leaves the scene and clears when
  none remain.
- The store's comment says a highlight on geometry the pointer is not over is a bug. The expanded row is a
  deliberate exception. Reword the comment, keep the visible **Highlighting N parts** line, and clear on
  collapse, view close and unmount.
- `paintBodies` and `applyHover` take the set. Add `data-hover-bodies` beside `data-hover` for specs.
- `variablesUi.view` gains `'prompts'`. The watch at `Inspector.vue:195-200` sends the view back to
  `'inspector'` whenever the selected body changes, so it must exempt `'prompts'`: selecting in the 3D view
  keeps the Prompts view open, and rows that produced the selected body are marked. Tapping a part row is the
  one selection that returns to the Inspector, and it does so explicitly.
- `data-view='prompts'` hides the rest of the sheet as `data-view='variables'` does (`Inspector.vue:1447`).
  Today that rule is inside the phone media query, so the wider layouts need their own.
- Text stays untrusted: `{{ }}` only, no `v-html`, no Markdown, no links.

### Part 4: editing

**Decision for the owner, default chosen here:** what was asked is a fact, and `ai-031` made prompt text
immutable on purpose, so an edit never overwrites it. `text` stays the original. Two optional fields are
added, each carrying a merge stamp:

```
{ id, text, produced, responses?, edit?: { text, at }, removed?: { at } }
```

- `joinPromptMaps`: the latest stamp wins for each field, using `compareStamps`, so it stays commutative,
  associative and idempotent. Still a grow-only set of ids. A removed prompt survives as a tombstone, so a
  merge with an older copy cannot bring it back.
- `validatePromptRecord` already ignores unknown fields, so a released build shows the original text and the
  removed prompt, and drops the fields if it saves. A later merge restores them. Add fixtures for both.
- `promptRecordOf` hands out the edited text with `edited: true` and the original, and skips a removed prompt,
  so `documentData.js`, `read.js` and the gist README inherit it. Check each anyway. Edited text is still
  **data, never instructions**: clean and cap it through `preparePrompt`, and add a line to the trust model.
- **Reply edit**: tombstones every live segment and appends one, in one undo step. Tombstones count toward
  `maxResponseSegments` (100), so repeated edits can fill it: refuse in words, as Add does.
- **Combine** is one undo step: `this` gets `edit` with the joined text, `next` gets `removed`, `produced` is
  unioned, and `next`'s live reply segments are appended to `this`. Refused over the cap.
- Each is a local-origin command that adds an undo step, like `addPromptResponse`, and is refused in a batch
  for the same reason. Unlike `recordPrompt`, which is never an undo step: that distinction is why agent
  writes stay out of the user's undo stack.
- **An edit does not rewrite History.** A record's intent is copied from the prompt when it is written, so
  History's notes keep the original words. Say so in the docs.

### Part 5: remove the old surface

`PromptRow.vue` stops mounting `PromptReply` and stops joining several prompts' text into one row
(`text = prompts.map(...).join('\n\n')`). Keep `prompt-reply-*` test ids where the control is unchanged, so
`e2e/prompt-response.e2e.js` moves rather than being rewritten.

### Out of scope

- Framing the camera on a request's parts. On a phone a highlighted part can sit behind the sheet.
- A **Select these parts** button.
- The prompt on a History row (`ai-031`'s "Not built").
- `produced` is cut at `maxProduced` (1,000) in sorted order, so a very large build loses arbitrary links. Note
  it if the index shows it in practice; do not solve it here.

## Effort

L (multi-session). Parts 1 and 2 are M together; Part 3 is M; Part 4 is M and changes the file format.

## Testing

- **Unit** (`src/core/prompt.spec.js`, `documentMerge.spec.js`): roles for made, changed, consumed, a body with
  two prompts, a prompt with no live body, a variables-only prompt, a deleted body, and the Fan Duct shape (two
  prompts, identical `produced`, including dead ids). `promptsForBody` and the inverse agree on a generated
  project. Order with 11 prompts, before and after a merge. Merge laws for `edit` and `removed` in every order.
  A removed prompt stays removed after merging an older copy. Fixtures: an over-cap prompt and an edited or
  removed prompt saved by a released build, then merged back. Oversized section at `maxBytes`.
- **Store** (`hoverHighlight.spec.js`): many-body writes, repeats refused, pruned when a body leaves, cleared when
  empty; the single-target API is unchanged.
- **Real app, `e2e/prompts-view.e2e.js`**, navigating to `/`, using the WebMCP stand-in
  (`e2e/support/fakeWebMcp.js`) for two requests over overlapping bodies. It must cover:
  - No prompts: no bar and no tab.
  - Open from the bar and, at phone width, the tab. Exactly one **Add reply…** per expanded row.
  - Hover, focus and expand each set `data-hover-bodies` to the right ids and clear correctly. At phone width
    this is driven by tap only, with no `hover()`.
  - **A rendered check that a highlighted part's pixels change**, not only the attribute: this project has shipped
    attributes that passed while the screen did not change.
  - **Made by… ›** opens the right row; a part row selects and returns to the Inspector.
  - Each edit, Combine, **Undo** and **Redo**, and a reload that keeps them.
  - A 5,000-character prompt stored whole.
- **Viewports and engines**: all three viewports with a snapshot at each, because this changes panel layout. All
  three engines (Chromium, Firefox, WebKit), because it touches WebGL painting and IndexedDB persistence.
- **Moved spec**: `e2e/prompt-response.e2e.js` and `e2e/prompt-record.e2e.js` move to the new surface. `testing-014`
  is open against the first one, hence the dependency. Do not start on a spec whose failure is unexplained.
- **Closed findings to re-run**: `ui-089` (a hidden part or body lights nothing on hover), `ui-049` (a row's
  highlight clears when its body leaves the scene, by undo, rollback, or a boolean that consumes it, under a
  resting pointer).
- **Performance**: measure hover-to-painted on a copy of the Fan Duct project, per
  `.claude/prompts/perf-benchmark.md`. Target: one 16 ms frame. Hover applies at change rate, so no per-frame
  allocation is added. If the twins miss the target, tint only and skip twins past a measured count.
- **Acceptance scenarios to re-drive**: 27 (WebMCP, reads the Prompt row: update its steps), 30 (the README's How
  this was made), 22 (merge), 10 (save and reload). 23 and 25 need a real Claude Code: ask the owner before spending
  tokens, as `ai-031` did. Add steps to scenario 27 for hover and the link rather than a new scenario.
- **Hand check, the case that prompted this**: on a **copy** of `~/Documents/fan-duct.ndjson`, confirm the two rows,
  use **Combine with next**, confirm one request reading exactly as `fan-duct.prompt.txt`, one **Add reply…**, the
  parts still listed, Undo restoring two. Then paste `fan-duct.response.txt` as the reply. Laptop, then a real phone
  if available.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
