---
title: Port the remaining V1 .color(...) calls on raspberrypi.* recipe parts (the opaque ones core-026 left)
category: core
kind: finding
priority: medium
model: sonnet
milestone: M7
depends: [core-026]
status: open
---

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
