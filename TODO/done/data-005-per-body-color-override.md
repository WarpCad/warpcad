---
title: Document-model support for a per-body (and optionally per-part) color override
category: data
kind: feature
priority: medium
model: sonnet
milestone: M7
depends: [core-002, core-026]
status: done
---

> **What shipped (2026-09-25).** Per-part, chosen and built — not just left open for
> `ui-037` to decide later. A new supersedes-based record kind, `style.recolor`
> (`src/core/kernel/registry.js`, `wholeGroupNative(1, …)`, identity passthrough — it
> reads its operand and hands it straight back, exactly the "kernel is incurious about
> what `hidden`/`color` mean" precedent `core-026` set), carries `colorOverride`
> (`0xRRGGBB`), optional `colorAlpha` (`(0, 1]`, omitted when 1) and optional `subPart`
> (a single part name) on the `OpRecord` itself — siblings of `hidden`/`color`, not
> nested in `params`. `document.js` gained `setColorOverride(id, override, tx)`
> (validates, resolves the lineage's live terminal via the existing `currentIdOf`,
> appends an **unnamed** record — `ui-029`'s "why transform records are unnamed"
> precedent, followed rather than re-derived) and a new `Body.colorOverrides` array,
> computed by `colorOverridesOf(lineage)`: one entry per distinct `subPart` (plus at
> most one whole-body entry, keyed by `undefined`), each overwritten independently by a
> later override targeting the same key. So overriding `usbc` then `ethernet` tracks
> both; re-overriding `usbc` again replaces only its own entry. `undefined` — the
> existing default — when a lineage has never carried one.
>
> **The per-part decision, stated as the file asked.** `subPart` is a single string,
> deliberately **not** `core-024`'s comma-list `pieces` — a colour override always
> targets exactly one part, never a set, so reusing the plural operand-addressing shape
> here would claim a capability this does not have. It composes with `core-024` by
> staying out of its way (a different field, a different record shape) rather than by
> sharing a field. No kernel-side validation that a named `subPart` actually exists on
> the body's `Group` — the kernel stays exactly as incurious about this as it already is
> about `hidden`/`color`; that check, if wanted, is `ui-037`'s to add once it knows what
> UI affordance needs it.
>
> **A real, unlisted defect found and fixed on the way**: `paramEdit.js`'s
> `paramEditability` — the guard that freezes a body's Parameters panel (`ui-029`) when
> anything other than a `transform.*` sits between its creation record and its terminal
> — did not know about `style.recolor` and would have frozen Parameter editing on
> **every** body that ever received a colour override, the instant `ui-037` could create
> one. Unlike a fillet, a colour override never touches geometry, and `colorOverridesOf`
> reads it off *every* record in the walked lineage, not just the terminal's own build —
> so a rebuild loses nothing by skipping past it, a **stronger** case than a transform's
> (which merely gets re-applied afterwards). Fixed by extending `paramEditability`'s
> skip condition; covered by a new case in `paramEdit.spec.js`'s existing read-only-guard
> describe block, using the same hand-built-lineage style as its `modify.filletRim` case.
> This is the one place this task's scope genuinely grew past its own Affected-files
> list, and it grew because leaving it unfixed would have silently regressed an
> already-shipped, tested capability the moment `ui-037` landed — exactly the class of
> gap `CLAUDE.md`'s Verification section exists to catch before it ships, not after.
>
> **`src/core/kernel/index.js` needed no change at all**, despite being named in this
> file's own Affected files. `evaluate()`'s native-op dispatch is already fully generic
> over the registry — a new op needs a registry entry (`registry.js`) and nothing else.
> The registry entry's own doc comment explains why `wholeGroupNative` rather than plain
> `native` matters here: a `native` entry would flatten a composite's `Group` to a solid
> via `combine()` on the way in, discarding the very part breakdown a per-part override
> needs `Body.geometry` to still have afterwards.
>
> **Persistence needed no change**: `src/core/project.js`/`ndjson.js` serialise whole
> records generically (confirmed by reading them, not assumed), so `colorOverride`/
> `colorAlpha`/`subPart` round-trip through save/reload exactly like `hidden`/`color`
> already do, with zero new code.
>
> **Verified against the real kernel, not just a fake registry**: one `document.spec.js`
> case builds a real `hardware.bolt` composite after two ordinary primitives (mirroring
> `core-020`'s own reproduction), overrides its `tap` sub-part, and confirms the bolt's
> `names`/`parts` and the two earlier bodies are all untouched — the exact regression
> surface this file's Testing section named. Undo/redo (`data-003`/`core-030`) and the
> `core-031` fold cache (cached vs. `foldCache: null`, compared for equality) both get
> their own targeted case.
>
> **Step 6, driven**: no UI exists to create an override yet, so scenario 13 stays "not
> yet built", unchanged, per this file's own Testing section. Scenario 1 (hand-driven,
> jittery real `PointerEvent` drags) and scenario 12's step-6/12 Edit mechanism (hand-
> driven: a Cylinder's Diameter edited 40→20 through the Inspector, confirming the
> *unchanged* `paramEditability` behaviour for a body with no override) both re-checked
> and logged in `ACCEPTANCE.md`, alongside a full non-Firefox Playwright matrix re-run —
> **1245 passed, 202 skipped, 0 failed**.

## Goal

`core-026` adds a `color` field composite recipes can emit for their own parts. This
task is the document-model half `TODO/ACCEPTANCE.md` scenario 13 actually needs: a way
for the **user** to override a placed body's color after the fact — not just a recipe's
own baked-in default. "Done" looks like: a creation/composite record can carry a
user-set color override the same way `hidden` already is on a part record, with a
sensible default (no override → render exactly as today) so every existing body keeps
its current appearance unchanged.

**Optionally per-part**: since `ui-016` already exposes a Group's named sub-parts
individually (drill-in selection), this task should investigate at Step 2 whether the
override applies to a whole body only, or can also target one drilled-in sub-part (e.g.
recoloring just a Pi board's `usbc` part without recoloring the whole board) — state
whichever is chosen explicitly, since `ui-037`'s control needs to know before it can be
built.

## Interaction model

n/a directly — this is the document-model field, not a control. `ui-037` is the control
that writes it. State explicitly per `TODO/README.md`.

## Documentation

n/a directly — no UI surface of its own; `ui-037`'s Documentation section owns the
end-user page once a real control exists.

## Affected files

- `src/core/document.js` — a new optional field on a body/record (recommend
  `colorOverrideMm`... no, color has no unit — recommend plain `colorOverride: number |
  undefined`, absent meaning "use the recipe/theme default," present meaning "use this
  instead"), following the exact precedent `hidden` already sets for an optional,
  default-false-equivalent field that doesn't disturb any existing body when absent.
- `src/core/kernel/index.js` — the fold needs to know an override exists (though it
  doesn't need to *interpret* color itself, the same way it doesn't interpret `hidden`'s
  visual meaning — that's `src/render/mesh.js`'s job) so it can be read back by
  `Body`'s reported shape for the Inspector/render path to consume.
- New `document.spec.js` coverage.

## Proposed fix

Mirror `hidden`'s existing shape as closely as possible: a plain optional field on the
record, threaded through the fold unchanged, defaulting to "no override" for every
record that doesn't set it (so this task, like `core-026`, needs zero changes to any
existing recipe or existing body's rendered appearance). The record this override lives
on should be a **new kind of record appended via `supersedes`** (the same shape `ui-029`
already uses for a param edit — a small, focused mutation on top of an existing body's
lineage) rather than a mutation of the original creation record, so the color-edit
history stays visible in the timeline (`ui-032`) the same way a param edit already does.

**The per-part question** (Goal, above): if per-part is adopted, the override record
needs a `subPart` field mirroring `ui-016`'s existing `body.subPart` addressing —
confirm this composes with `core-024`'s eventual sub-part-addressing decision for
booleans rather than inventing a third, incompatible addressing scheme.

## Effort

M — closely mirrors an already-established pattern (`hidden`, and `ui-029`'s
supersedes-based edit-record shape), with one real but bounded design question (per-
part or not). `model: sonnet` per `TODO/README.md`'s guidance that work closely
mirroring an established pattern stays sonnet even at effort M.

## Testing

- `document.spec.js`: a body with no color override renders/reports exactly as before
  (regression guard); a color-override record appended via `supersedes` reports the new
  color while every other field (params, position) is unchanged; if per-part is
  adopted, an override on one sub-part doesn't affect its siblings.
- No `*.e2e.js` — no UI surface yet, stated explicitly.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly (document-model only, no UI
  surface) — feeds scenario 13 once `ui-037` lands.
- **Closed-finding regression surface**: `core-020`'s repro, re-run after appending a
  color-override record on a composite body, confirming the override doesn't disturb
  the composite's own part list or absorb an unrelated earlier body.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
