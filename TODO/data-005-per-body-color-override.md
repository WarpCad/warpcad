---
title: Document-model support for a per-body (and optionally per-part) color override
category: data
kind: feature
priority: medium
model: sonnet
milestone: M7
depends: [core-002, core-026]
status: open
---

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
