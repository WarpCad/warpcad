---
title: Rename a body or group — a `style.rename` record that overrides the displayed name
category: core
kind: feature
priority: high
model: sonnet
milestone: M9
depends: [ui-049, ui-052]
status: open
---

## Goal

A body or group's name stops being fixed at placement. Dropping a bolt from the Library
still names it `Bolt 1` (`document.nextName`), but the user can replace that with
`Pi camera bolt`, and every place that shows a name — the Inspector, the object list, the
timeline row labels, the BOM, dependent-repair messages, refusal messages like
`Step 3 (Union) needs Cube 1` — shows the new one.

"Done" at this layer: `document.renameBody(id, name)` appends one undoable record; after it,
`bodies()` reports the new `Body.name`, `displayNameOf` returns it for every record in that
lineage, and a save → reload round-trips it. Undo restores the old name. Renaming to blank
clears the override and falls back to the generated name.

## Interaction model

n/a — pure `core`; the control is `ui-056`.

## Documentation

n/a — no user-visible control here; `ui-056` owns the docs page.

## Why a record, not an edit of `name`

`Body.name` is read from the lineage **root** record only, and `transform.js` explains why
transform and param-edit records must stay unnamed (a name on a `supersedes` record is
inert at best, a duplicate at worst — see the retirement notes in
`TODO/done/ui-029-editable-primitive-parameters.md` and `ui-027`). Mutating the root's
`name` would also rewrite history the user already saw and break undo scoping (CLAUDE.md:
every mutation goes through the command layer inside a transaction with an origin).

`style.recolor` (`RECOLOR_OP`, `colorOverridesOf` in `document.js`) already solved the
same shape of problem: a metadata record that supersedes nothing, applies to the whole
lineage, last one wins, and `null` clears. Mirror it.

## Design

- New op `style.rename` with a `name: string | null` payload field on the record (`null`
  clears). Label it `Rename` in the op-label table beside `style.recolor`.
- A `nameOverrideOf(lineage)` helper, parallel to `colorOverridesOf`: newest `style.rename`
  in the lineage wins.
- `Body.name` = override ?? root's name. `displayNameOf` walks the same rule, so refusal and
  repair messages pick it up without a second code path.
- **`nextName` is unchanged on purpose** — it numbers generated names (`Bolt 1`, `Bolt 2`)
  from the *root records'* names, so renaming `Bolt 1` to `Pi camera bolt` does not free the
  number and the next drop is `Bolt 2`, not a second `Bolt 1`. State this in a comment.
- Validation (framework-free, in `src/core/`): trim; max 60 chars; reject control
  characters; **duplicates are allowed** (two `Screw`s is legitimate) but
  `isDuplicateName(name)` is exported so the UI can warn without blocking.
- **Sub-parts.** A recipe's sub-part names (`usbc`, `head`, `thread`) are part of what the
  recipe *is* and stay fixed — they are addressed by name in booleans and colour overrides.
  Do not add `subPart` to `style.rename`. A part the user *composed* (a named body combined
  into a group by `ui-015`) keeps the name it had when combined, so renaming **before**
  combining carries into the group; renaming a member afterwards is out of scope — record it
  as a follow-up finding only if the user asks.
- Records that reference a body by *name* (check `dependents.js` `dependentName`,
  `condition.js` `refName`, `bom.js`) must read the display name, not `record.name` — grep
  for `\.name` reads in `src/core/` and route each through the one resolver.

## Affected files

- `src/core/document.js` (`RENAME_OP`, `nameOverrideOf`, `Body.name`, `displayNameOf`,
  `renameBody`, op-label table, replay/ingest allow-lists wherever `style.recolor` is listed)
- `src/core/dependents.js`, `condition.js`, `bom.js` (read the display name)
- new `src/core/naming.js` (+ `.spec.js`) — validation and `isDuplicateName`
- `src/core/ndjson.js` / `project.js` only if `style.recolor` is special-cased there

## Effort

M.

## Testing

- **Unit** (`document.spec.js`, `naming.spec.js`): rename → `bodies()` name; rename twice →
  newest wins; rename to `null`/blank → generated name returns; undo/redo; a rename on a
  lineage that was later moved, param-edited or snapped keeps its name (the `supersedes`
  chain is the degenerate case that matters); `nextName` skips over a renamed root's number;
  rename of a deleted body is refused by name; save/load round-trip; a union whose operand
  was renamed refuses by the *new* name; empty, whitespace-only, 61-char and control-char
  names.
- **E2E**: none at this layer (no UI surface); `ui-056` carries the spec.
- **Acceptance**: none re-driven here, but run the unit baseline first — this touches the
  fold path every scenario depends on. It extends the subsystem `ui-029`'s finding about
  `Body.params` was filed against (a body field read from the root while a later record
  changes it), so re-run that repro: edit a primitive's diameter, then rename it, then edit
  the height — diameter must not revert and the name must survive.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
