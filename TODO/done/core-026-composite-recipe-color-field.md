---
title: Add a color field to composite-recipe OpRecords and port the V1 .color(...) calls this project silently dropped
category: core
kind: finding
priority: high
model: opus
milestone: M7
depends: [core-001]
status: done
---

> **What shipped (2026-09-25).** The field, as proposed: a numeric `0xRRGGBB` `color` plus
> `colorAlpha` (in `(0, 1]`, omitted when 1) on `OpRecord`. V1 names are converted once at
> the recipe boundary through `src/core/kernel/colors.js`'s `v1ColorToRecord`, backed by
> `V1_CSS_COLOR_HEX`. That is all 147 of V1's own names, and `colors.spec.js` re-reads the
> installed `jscad-utils-color.jscad` on every run to diff against it. `add()` takes
> `color`/`colorAlpha` alongside `hidden`. The fold passes both through one
> `partOptions(record)` on the fresh-build and cached paths. The evaluated `Group` carries a
> `colors` map through every function that rebuilds a group (`addHole`, `pick`, `mapGeometry`,
> `translate`/`snap`/`align`, `enlarge`/`fit`, and subpart flattening). **Two things went
> beyond the listed files, both on purpose:** `transport.js` carries `colors` across the
> worker boundary (otherwise the field would be dropped silently one hop later), and
> `hardware.bolt` was ported too (gray head, silver thread, red tap and all `tap-*` parts).
> Bolt was not listed, but it had dropped its calls exactly like the washer.
>
> **Premise corrections, from re-reading V1 source rather than memory:** `hardware.nut`,
> `kit.board` and `kit.boardFrame` never called `.color()` in V1, and `hardware.bearing`
> has no V1 factory at all. Nothing was dropped, so their records stay uncoloured, and a
> spec plus a module-doc line pin that. The real drops were `washer` (gray/red), `bolt` and
> `kit.anchor` (red hole, purple post). The washer/nut/bolt colours are **measured**: the
> three `scripts/generate-v1-*-fixture.cjs` generators now load V1's real `.color()` instead
> of an identity stub, and the regenerated fixtures differ from the old ones only in the
> added `color` keys. Every dimension is byte-identical.
>
> **raspberrypi.\*: alpha case only.** All nine V1 alpha calls are ported: `mb`
> green/darkgreen 0.75 on bplus, hat, piTFT22, piTFT24 and hyperPixel4, and `board` green
> 0.75 on all five camera models. The ~150 opaque per-part calls are filed as
> `TODO/core-033`.
>
> **Scope boundary, as the TODO asked:** record level only. There is **no render-path
> change**, and bodies still draw in the theme palette. `data-005` (document model),
> `ui-037` (Inspector) and a per-body material in `src/render/mesh.js` consume this
> later.

## Problem

`.color(name)`/`.color(name, alpha)` is used in ~65 of ~80 surveyed real `~/src/jscad/`
projects — more consistently than fillet/chamfer or snap/align, both already treated as
core surface in this project. Grepping `src/core/kernel/` and `src/render/mesh.js`
directly (not assumed) confirms there is **no color field anywhere** in the document
model, the op registry, or the Inspector — `createBodyMaterial()` exists in
`src/render/mesh.js:119` but is invoked only three times, all from
`Viewport.vue:1806-1808`, each with one of three fixed theme-palette colors
(`palette.body`/`.selected`/`.secondary`) shared across every body regardless of
identity. There is no per-body color anywhere in the render path.

**This is a regression, not just a missing feature.** `hardware.washer.js`'s own module
doc (confirmed by reading it directly) discusses at length why V1's `clearance` part
became `hidden: true` here, but says nothing about the fact that V1's own source
(quoted in that same doc comment) calls `.color('gray')` on the *visible* `washer` part
— that information was dropped silently during the V1→V3 port, with no note recording
the decision to drop it (unlike `hidden`, which got a deliberate, documented
divergence). The same applies to `hardware.nut.js`'s `.color('yellow')`(or equivalent)
call, `hardware.bearing.js`, and `kit.board.js`/`kit.boardFrame.js`/`kit.anchor.js`.
`jscad-raspberrypi` goes further and uses the alpha channel
(`Parts.Board(...).color('green', 0.75)`), which this project has no representation for
at all — not even a place to put it once color exists.

This task is **kernel-only, scoped narrower than the full user-facing feature on
purpose**: it adds the *field* and re-ports the *already-dropped* calls in
already-shipped recipes. It does **not** add a document-model per-body override
(`data-005`) or an Inspector control (`ui-037`) — those are separate tasks per
`TODO/README.md`'s "one suggestion per file" rule, and this task's own registry-level
`color` field is exactly what `data-005` needs to exist first.

## Affected files

- `src/core/kernel/index.js:217` — the exact line `hidden` already threads through
  (`group = add(group, value, record.name, { hidden: record.hidden === true })`) needs
  a sibling `color: record.color` passed the same way.
- `src/core/kernel/group.js:418` (`add()`) — needs to accept and carry a `color` option
  alongside its existing `hidden` one, attaching it to the resulting part/body metadata
  for `src/render/mesh.js` to eventually read (once `data-005`/`ui-037` exist to write
  one).
- `src/core/kernel/recipes/hardware.washer.js`, `hardware.nut.js`, `hardware.bearing.js`,
  `kit.board.js`, `kit.boardFrame.js`, `kit.anchor.js` — each needs its V1 source
  re-read for the exact `.color(...)` call it dropped (per this task's own Problem
  section, confirmed present in at least `washer`/`nut`'s own quoted V1 source) and
  the matching `color`/`colorAlpha` param added to its own emitted records.
- Each recipe's own `.spec.js` — new assertions that the emitted records carry the
  correct color, diffed against the same measured-V1-output fixtures these recipes
  already use for size/volume (per `CLAUDE.md`'s "always verify by running, not just
  reading" precedent this exact function class has already needed twice —
  `core-019`/`core-021`'s bisect sign errors).

## Proposed fix

1. Re-read each affected recipe's own already-quoted V1 source (already present in
   several of these files' own module docs, e.g. `hardware.washer.js`'s doc block
   quoted in this file's Problem section) for the exact color name/alpha it uses.
2. Add `color: string` (and `colorAlpha: number`, defaulting to `1`, for the
   `raspberrypi.*` alpha-channel case) as an accepted param on the affected `OpRecord`s,
   threaded through `add()`/`kernel/index.js:217` alongside `hidden`.
3. **Decide a color representation** before writing any code: V1 uses CSS-ish color
   *names* (`'gray'`, `'green'`); this project's own `src/render/mesh.js` uses numeric
   three.js colors (`MeshStandardMaterial({ color, ... })`, a hex/numeric value). Pick
   one canonical representation for the document model (recommend numeric, matching
   `mesh.js`'s existing convention, since a name→hex table is a small, one-time lookup
   at the recipe boundary rather than a recurring cost at render time) and convert V1's
   named colors at the recipe boundary, naming the conversion table explicitly (mirrors
   `CLAUDE.md`'s "name every conversion at its boundary" rule).
4. This task stops at the **record level** — no render-path change, since there is no
   consumer yet (that's `data-005` carrying it into the document model, `ui-037` writing
   it from the Inspector, and `src/render/mesh.js`'s eventual per-body material change).
   State this scope boundary explicitly in the retirement note.

## Effort

M — mechanical once each recipe's V1 source is re-read (the pattern to follow,
`hidden`'s existing threading, is already fully proven), but `model: opus` per
`TODO/README.md`'s guidance on numerical/data-fidelity work where a subtle error (the
wrong color, or silently dropping the alpha channel) is easy to write and hard to see
by eye — the same class of risk that made `core-019`/`core-021`'s V1-diff fixtures
necessary rather than optional.

## Testing

- Extend each affected recipe's `.spec.js`: the emitted record for the previously-
  undocumented `.color(...)` call now carries the correct color value, diffed against
  a freshly-read V1 source quote (not reconstructed from memory) the same way size/
  volume already are.
- `group.spec.js`: `add()`'s new `color` option is carried through correctly, alongside
  the existing `hidden` coverage.
- No `*.e2e.js` — no UI surface yet, stated explicitly per `TODO/README.md`'s rule and
  this task's own scope-cut Goal.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly (kernel-only, no UI surface). **Re-run
  each ported recipe's own V1-diff fixture** (`core-010`/`011`/`012`/`023`'s own
  established fixtures) since this changes what every one of them emits — the exact
  regression-surface instruction this task's own roadmap row names.
- **Closed-finding regression surface**: `core-020`'s repro, re-run against at least one
  affected composite (e.g. `hardware.washer`) post-change, since this modifies the exact
  record-building code path that finding was filed against.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
