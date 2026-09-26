---
title: Port the remaining V1 .color(...) calls on raspberrypi.* recipe parts (the opaque ones core-026 left)
category: core
kind: finding
priority: medium
model: sonnet
milestone: M7
depends: [core-026]
status: done
---

> **What actually shipped.** All twelve `raspberrypi.*.js` recipe files were ported
> (the file's own "eleven" undercounts by one against the real
> `src/core/kernel/recipes/raspberrypi.*.js` listing — `activeCoolingFan` was missing
> from that count). 113 `v1ColorToRecord(...)` call sites landed across the twelve
> implementation files; a 22-variant sweep (every `raspberrypi.*` op × its real model
> params) found 237 individual records that gained or changed a `color`/`colorAlpha`
> field, with **zero** non-colour-field differences against the pre-task output —
> `core-025`'s own byte-identical-expansion check, re-run rather than assumed.
>
> `rpi-recipe-kit.js`'s `placeUnion`/`placeBoolean` were extended with the same
> `{ color, colorAlpha }` options `place()` already had (core-026), exactly as this
> file's Affected files section asked.
>
> **The "leave uncoloured, and say why" case (this file's own `miniPiTFT.js:59-60`
> example) came up repeatedly, not just once**: `raspberrypi.bplus`'s `avjack`/
> `powerswitch`, `raspberrypi.piTFT22`'s `buttonN`, `raspberrypi.piTFT24`'s `hat`/
> `buttonN`/`buttonCapN`, `raspberrypi.cameraModule`'s `avjack`/`tripodMount`,
> `raspberrypi.hatStandoff`'s `standoff`, and `raspberrypi.touchDisplay7inch`'s
> `piMountingPadN` all union two differently-coloured V1 solids and stay uncoloured,
> each with an inline comment and a module-doc or spec note citing this task.
> `raspberrypi.activeCoolingFan`'s `board` is the same call for a different reason —
> V1's `.color('silver')` gets unioned *over* by a later `black` housing block with no
> further recolour, a two-tone result by construction rather than by two named
> operands — documented the same way.
>
> **A genuine V1 asymmetry, ported rather than smoothed over**:
> `raspberrypi.cameraModule`'s v1/v2 classic family colours only `hole0` yellow
> (`hole1`-`3` are built identically but never get a `.color()` call in the V1 source),
> while v3's `Hole()` factory colours all four red. Both are reproduced exactly, with a
> spec assertion guarding the asymmetry itself so a future refactor doesn't
> "fix" it into uniformity.
>
> **The spec's "no render change" line no longer held** by the time this task ran —
> `render-003` (landed after this file was written) made `Group.colors` actually paint,
> so this task **does** visibly change how every `raspberrypi.*` body renders. Driven
> live against the real dev server (not the checked-in e2e suite) at laptop 1440x900
> Chromium and phone 390x844 WebKit: a Raspberry Pi 5 + Camera Module V3 combination
> renders with the translucent green board still readable underneath sensible-looking
> lightgray/orange/gray connector colours (screenshots inspected by eye); a Pi 4's
> `hole1` sub-part (orange, `#ffa500`) was recoloured blue via the Inspector and Reset
> correctly returned it to `#ffa500`, not the app's theme default — the same
> recipe-colour-then-Reset contract `render-003`/`ui-037` established. One new,
> unscoped finding surfaced by that drive and filed rather than fixed inline, the same
> way `render-004` was filed off `render-003`'s own Step 6:
> `TODO/render-005-visible-nogo-keepout-touchdisplay7inch.md` —
> `raspberrypi.touchDisplay7inch`'s `noGoPower` is a V1-faithful opaque red block that
> V1 itself adds **visible**, unlike every other clearance/keep-out in this catalogue.
>
> Verified: `npm run typecheck` clean; 1832 unit tests (was 1734, +98); full
> non-Firefox Playwright matrix 1299 passed / 280 skipped / 0 failed (Firefox
> environment-blocked, as every task since `ui-028`, `TROUBLESHOOTING.md`
> 2026-09-17). `core-020`'s repro re-run live against `raspberrypi.bplus` through
> `createDocument`/`append` (not just `evaluate`) — the incrementally-appended
> composite's stored group holds exactly its own 33 parts, no leak of an
> earlier-placed body. Acceptance: scenarios 3, 13 and 1 driven live and their own
> **Re-checked** entries appended to `TODO/ACCEPTANCE.md`.

## Problem

`core-026` added a `color`/`colorAlpha` field to composite-recipe op records and ported
every dropped `.color(...)` call in `hardware.*` and `kit.*`. For `raspberrypi.*` it
ported only the **alpha-channel** calls, which was the case that TODO named. Those are
the board parts: `bplus`/`hyperPixel4Rectangular` `mb` green 0.75, `hat`/`piTFT22`/`piTFT24`
`mb` darkgreen 0.75, and `cameraModule` `board` green 0.75 for all five models.

`jscad-raspberrypi@62a8e3b` has **169 `color(` calls under `src/`** (`git grep -n
"color(" 62a8e3b -- src` in `~/src/jscad/jscad-raspberrypi`, counted for core-026). The
roughly 150 that are opaque are still dropped. Examples: `bplus.js`'s `lightgray` jacks
with `red` clearances, `yellow`/`darkorange` headers, `silver` on the Pi 5's parts;
`active-cooling-fan.js`'s `orange`/`blue`/`silver`/`black`; the cameras' `black`/`gray`/
`gold`/`beige` lenses and `red` keep-outs; `pi-tft24.js`'s `deepskyblue` buttons. That is
the same silent V1→V3 loss core-026 fixed for hardware, just not yet ported for these
recipes.

## Affected files

- `src/core/kernel/recipes/raspberrypi.*.js` (all eleven): pass
  `v1ColorToRecord(name)` to each `builder.place(...)` / `placeUnion` / `placeBoolean`
  for the part V1 coloured. `rpi-recipe-kit.js`'s `place()` already accepts
  `{ color, colorAlpha }` (core-026). `placeUnion`/`placeBoolean` do **not** yet, so
  extend them the same way.
- Each recipe's `.spec.js`: assert the colour per named part against a freshly re-read
  V1 source quote, the way core-026's alpha-case blocks do.

## Proposed fix

1. For each recipe, walk its V1 source file at `62a8e3b` part by part and map every
   `.color(...)` onto the V3 part name it became. Several V1 colours sit on
   intermediates that V3 unions or subtracts. Where a named V3 part is built from
   **differently** coloured V1 solids (e.g. a `union` of a `yellow` and a `green` solid in
   `miniPiTFT.js:59-60`), leave it uncoloured and say so in the module doc. A record can
   carry one colour, not a mix. Don't pick one arbitrarily.
2. `V1_CSS_COLOR_HEX` (`src/core/kernel/colors.js`) already holds all 147 V1 names, so no
   table change is expected. `v1ColorToRecord` throws on an unknown name, so a typo
   fails loudly.
3. Stop at the record level, as core-026 did. There is no render change.

## Effort

M: mechanical, but ~150 call sites across eleven recipes, each needing its V1 part
mapped to a V3 part name by hand.

## Testing

- Per-recipe `.spec.js` assertions: each coloured named record carries V1's colour,
  diffed against a V1 source quote (`62a8e3b`, file:line).
- No `*.e2e.js`: there's no UI surface (render path unchanged). State this explicitly.
- **`TODO/ACCEPTANCE.md` scenarios**: none directly. Re-drive scenario 3 (kit assembly)
  placement to confirm the recipes still place and render complete.
- **Closed-finding regression surface**: re-run `core-020`'s repro against one rpi
  composite (e.g. `raspberrypi.bplus`), since this changes those recipes' records, and
  re-run `core-025`'s byte-identical-expansion check (only the colour fields should differ).
