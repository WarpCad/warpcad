---
title: A linked Repeat step — one timeline row that re-places a body's steps at every matching part, and follows the first body's edits
category: core
kind: feature
priority: medium
model: opus
depends: []
status: open
---

## Goal

The document half of the user's 2026-10-15 request (the full quote and the UI are in
`TODO/ui-069-repeat-placement-across-matching-parts.md`): finish one M2.5 bolt on a Pi's `hole1`
(dropped, rotated, aligned to `hole1`, snapped to `mb` with a −5 mm offset), then have the same
bolt on `hole2`, `hole3` and `hole4` — **linked**, not copied. The user chose linked on 2026-10-15:
editing the first bolt's steps updates every repeat.

This task adds a new record, `pattern.repeat`, and everything the rest of the app needs to treat
its result as ordinary geometry: evaluation, `bodies()`, the BOM, the change-a-model repair dialog,
save/reload, merge, and one AI tool shared by the MCP server and BYOK chat. It has no UI of its own;
`ui-069` adds the button and the recording panel on top.

**Done looks like:** appending one `pattern.repeat` record against `Bolt 1` with seed `hole1` and
targets `hole2`–`hole4` produces one new body, *Bolt 1 ×3*, whose three members sit on holes 2, 3
and 4 exactly as Bolt 1 sits on hole 1. Changing Bolt 1's **Size** or **Length** in the Inspector,
or editing its Align's offset in History, moves or resizes all three. Changing the Pi to a model
without `hole3` opens the existing repair dialog with a row for that one member. The BOM counts
four bolts.

## Design decisions (made here, so `/fix-todo` doesn't re-derive them)

1. **One record, one body, one member per target.** `bodies()` reports exactly one Body per lineage
   (`src/core/document.js:38-41`), and that rule is load-bearing for selection, merge and delete.
   So `pattern.repeat` is a **new lineage root** whose body is a *group*, with one member per target,
   each member named after its target (`hole2`, `hole3`, `hole4`). Each member is the source body's
   evaluated result (itself a group for a bolt: head, thread, tap), re-placed. This reuses the
   group/sub-part machinery: drilling into a member is the ordinary `{ id, pieces: 'hole3' }`
   address (`core-024`), so a nut can be snapped to one repeated bolt with no new addressing.
   *Rejected:* one record producing several bodies (breaks the one-body-per-lineage rule above);
   consuming Bolt 1 into a 4-member body (Bolt 1 would stop being the thing you edit).
2. **The record.**
   ```json
   { "op": "pattern.repeat",
     "params": { "source": "<Bolt 1 root id>",
                 "seed": { "id": "<Pi root id>", "pieces": "hole1" },
                 "targets": ["hole2", "hole3", "hole4"] } }
   ```
   `source` and `seed.id` are **lineage roots**, not record ids, so a later edit to either lineage
   is picked up. `targets` are part names on `seed.id`. The record does **not** store a copy of
   Bolt 1's steps; that is what makes it linked.
3. **Evaluation: replay the source lineage with the seed swapped.** For each target, take the
   source's lineage **as it stands at the repeat row's position in the timeline** (root first,
   `lineageOf`), and evaluate it with every operand equal to `seed` rewritten to
   `{ id: seed.id, pieces: target }`. Every other operand (here, `{ id: Pi, pieces: 'mb' }`) is
   left alone, which is why the Z snap stays on `mb`. Runs in the kernel worker like any other
   fold. The creation record's solid is the same for every target, so evaluate it once per fold
   and reuse it; only the placement steps re-run per target.
4. **What "linked" covers, and what it doesn't.** Anything that *revises* a step already in Bolt 1's
   lineage before the repeat row carries to every member: an Inspector param edit (the replace path,
   `data-007`/`ui-052`), a History edit of the Align or Snap, a variable bound to the bolt's length
   (`M12`). A step **appended** to Bolt 1 *after* the repeat row (dragging Bolt 1 with the gizmo
   later) moves Bolt 1 alone, because a timeline row only consumes what came before it. This
   follows from the linear-timeline model in `CLAUDE.md` and is documented as such, not worked
   around.
5. **Refusals at append time** (thrown with a reason, nothing appended): `source` is not a live
   body; `seed.id` is not a live body or has no part `seed.pieces`; a target is missing, duplicated,
   or equal to the seed; `targets` is empty or over the limit (decision 9); the source's lineage
   never mentions `seed` ("Nothing in Bolt 1's steps refers to hole1, so every repeat would land on
   Bolt 1"); `source === seed.id`.
6. **Members are derived, not editable on their own.** The repeat body's Inspector names its source
   and offers **Go to Bolt 1** (that is where edits happen) and **Detach** (decision 7). Its
   Parameters are read-only. Colour follows the source's colour; a `style.recolor` on the repeat body
   itself overrides it for every member. A transform on the repeat body (the gizmo) is refused with
   *"Move Bolt 1 or the Pi; the repeats follow them"*: a move would silently break the link the user
   asked for. Rename works on the whole repeat body (`style.rename`, `core-038`). The default name
   is `<source name> ×<n>`, e.g. *Bolt 1 ×3*.
7. **Removing one member and detaching.** Deleting one member (drilled into `hole3`, Delete) is a
   `data-004` **replace** of the repeat record with `hole3` removed from `targets`: one Undo step.
   Removing the last target deletes the repeat body. **Detach** replaces the repeat record with one
   independent lineage per member (the substituted records from decision 3, written out), in one
   transaction: the escape hatch for "this one bolt needs to be different".
8. **Dependents and repair.** A target that stops existing (the Pi becomes a model without `hole3`)
   is the same "part went away" case as a broken Snap. Extend `src/core/dependents.js` so
   `pattern.repeat` is a placement-like op: the repair dialog (`docs/snap-align.md`, "When the part
   you snapped to goes away") gets one row per broken member, offering **Remap to another part…**,
   **Remove this repeat** (drop the target, decision 7), **Only when …** (the existing conditional
   fix) and **Leave broken**. A broken member is not drawn and the body's Inspector says which.
   If `source` itself is deleted, the repeat body is broken as a whole and **Detach** is not offered
   (there is nothing to detach from); the dialog offers **Delete the repeats** or **Leave broken**.
9. **BOM.** `useBillOfMaterials` counts a repeat body's members as copies of the source's line:
   Bolt 1 plus *Bolt 1 ×3* is one row, **4 × M2.5 bolt**. A broken or conditional-off member is not
   counted.
10. **Save, reload, merge.** The record is an ordinary NDJSON record line: no schema-version bump,
    byte-identical round trip. Merge treats it like any other record param edit under `docs-022`'s
    state-based merge: two replicas each removing a different target is a concurrent replace of one
    record, resolved by the existing rule (and shown by the existing conflict banner if it applies).
    An older build that doesn't know `pattern.repeat` drops it with the existing unknown-op warning
    (`project.spec.js`'s "drops %s with a warning"), loading the rest.
11. **AI tool.** One new tool, `repeat`, in the shared registry (`src/ai/tools/repeat.js`, registered
    in `src/ai/tools/index.js`), so the MCP server and BYOK chat both get it with no transport code
    of their own (`docs/decisions/ai-partner.md`). Input:
    `{ source, seedBody, seedPart, targets, request }`. It appends one `pattern.repeat` through the
    same command-layer call `ui-069` uses, inside the turn's own origin (`ai` or `mcp`), so it lands
    in **Undo AI turn**, never the local undo stack. Same refusals as decision 5, returned as tool
    errors with nothing written. Hard limit: `targets` ≤ 64, added to `src/ai/tools/limits.js`. The
    description tells the model to call `describe_body` first to read the seed body's part names.
    `describe_scene` / `describe_body` report a repeat body's source, seed and targets, so the model
    can read an existing pattern back rather than guess at it.

## Interaction model

n/a for this file: no control. The button, recording panel, and every on-screen state are
`ui-069`'s. The user-visible *consequences* of decisions 6–9 (read-only members, **Go to Bolt 1**,
**Detach**, the repair-dialog rows, the BOM count) are specified above; `ui-069` owns the controls
that reach them and their docs.

## Documentation

- **Page**: `docs/mcp.md` and `docs/ai-partner.md`: add `repeat` to the tool list, with the example
  below. The user-facing explanation of Repeat (the panel, linked edits, Detach, repair rows) is
  `ui-069`'s `docs/snap-align.md` section; this task does not write it.
- **Example**: *"Ask Claude: 'Put the same screw on the other three holes.' With Bolt 1 already on
  `hole1`, Claude calls `describe_body` on the Pi, then `repeat` with `source: Bolt 1`,
  `seedBody: Raspberry Pi 1`, `seedPart: hole1`, `targets: [hole2, hole3, hole4]`. One History row,
  Bolt 1 ×3, appears; **Undo AI turn** takes it away."*
- **Media**: none; the docs media for Repeat are `ui-069`'s.

## Affected files

- `src/core/kernel/registry.js`: register `pattern.repeat` (no `ui`, so it never shows up as a
  Library or toolbar entry; `ui-069` owns the trigger).
- `src/core/repeat.js` (new, framework-free): `substituteSeed(record, seed, target)`,
  `repeatRefusal(doc, params)`, `nameFamily(partNames, seed)` (used by `ui-069`).
- `src/core/document.js`: the fold for `pattern.repeat` (decision 3); `referencedIdsOf` must report
  `source` and `seed.id` so a delete or merge sees the dependency; `DETACHABLE_OPS` /
  label tables (`'pattern.repeat': 'Repeat'`).
- `src/core/dependents.js`: decision 8.
- `src/core/timelineLabel.js`: `Repeat → hole2, hole3, hole4`.
- `src/core/paramEdit.js`: read-only Parameters for a repeat body; the target-removal replace.
- `src/composables/useBillOfMaterials.js`: decision 9.
- `src/composables/useTransformCommands.js`: refuse a transform on a repeat body (decision 6).
- `src/ai/tools/repeat.js` (new), `src/ai/tools/index.js`, `src/ai/tools/limits.js`,
  `src/ai/tools/read.js` (describe a repeat body).
- `docs/mcp.md`, `docs/ai-partner.md`.

## Proposed fix

Test-first, in this order: `repeat.js`'s pure substitution and refusals → the fold and `bodies()`
→ dependents/repair → BOM → transform refusal and detach → the AI tool. Use
`src/core/__fixtures__/piScenes.js` for a real Pi 5 + Touchscreen 2 throughout.

## Effort

L. A new record kind touching the fold, dependents, BOM, paramEdit and the tool registry.

## Testing

- **Unit.**
  - `repeat.spec.js`: substitution rewrites only the seed operand (`hole1` → `hole2`), leaves
    `{ id: Pi, pieces: 'mb' }` and every other operand alone; `nameFamily` (`hole1` → four holes,
    `mb` → none, `hole1` does not match `hole10`); every refusal in decision 5.
  - **The user's scenario, with numbers** (`document.spec.js` or a new `repeat.fold.spec.js`): Pi 5
    seated on a Touchscreen 2's posts, M2.5 bolt rotated, aligned to `hole1` on `xy`, snapped to `mb`
    on `z` with `deltaMm: -5`, then `pattern.repeat` for `hole2`–`hole4`. Each member's axis x/y
    equals its hole's axis x/y, and its Z extents equal Bolt 1's, `toBeCloseTo(…, 6)` mm.
  - **Linked**: change Bolt 1's length through the replace path → every member's Z extent changes
    to match; edit the Align's `deltaMm` → every member moves; move the Pi → every member follows.
    **Not linked**: an appended translate of Bolt 1 after the repeat row moves Bolt 1 only.
  - Dependents: switch the Pi to a model without `hole3` → one broken member reported, others
    unaffected; remap, remove, conditional and leave-broken fixes each produce the documented result.
    Delete `source` → whole repeat body broken.
  - Detach: produces three independent lineages whose evaluated positions equal the members'
    exactly, in one transaction; undo restores the single repeat record.
  - BOM: Bolt 1 + 3 members → one row, count 4; a broken member → count 3.
  - Round trip: save/load byte-identical; merge of two replicas each removing a different target.
  - Degenerate: a source that is a bare primitive (no parts); a seed part that is itself a group;
    `targets` at the limit (64) and over it; a source whose lineage includes a Fillet.
  - `src/ai/tools/repeat.spec.js`: append through the `ai` and `mcp` origins, refusal returns an
    error and writes nothing, limit enforced, `describe_body` reports source/seed/targets.
- **E2E**: no control in this task, so the reachability gate is `ui-069`'s
  (`e2e/repeat-placement.e2e.js`), which depends on this one. This task's MCP path gets a
  Node-side test against `mcp/server.js` on a fixture project file (the existing MCP test pattern),
  not a browser spec. Chromium only for anything browser-side here; no viewport or engine surface.
- **Acceptance scenarios to re-drive by hand**, PASS/FAIL each: **10** (save, reload, nothing
  changed), **12** (edit a step mid-history), **15** (change a part's model under a dependent),
  **22** (merge a copy), **23** (Claude Code edits the open file, using `repeat`).
- **Closed findings whose repro to re-run verbatim**: `data-007` (snapped dependents follow a
  resize; this task extends the same re-fold), `ui-052` (composite replace path), `core-024`
  (sub-part operand addressing), `ui-063` (both-sides sub-part Align), `ui-038` (BOM counts),
  `ai-022` (the snap tool's side description, which the `repeat` tool's description must not
  contradict).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
