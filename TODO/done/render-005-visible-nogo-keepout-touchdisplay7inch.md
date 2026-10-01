---
title: Decide whether raspberrypi.touchDisplay7inch's visible `noGoPower` clearance solid should stay opaque red
category: render
kind: finding
priority: low
model: sonnet
milestone: M7
depends: [core-033, render-003, render-004]
status: done
---

> **What actually shipped.** The user chose option 3 (2026-10-01): `noGoPower` now carries
> `hidden: true` in `raspberrypi.touchDisplay7inch.js` (colour kept). The `z: 1` vs `z: 7`
> "mismatch" was a misreading — V1's source at `touch-display-7inch.js:139` is
> `{ x: 15, y: 10, z: 1 }`, and the real-V1 bounds spec confirms 1 mm, so the size is
> unchanged. The default `names` list now omits `noGoPower`; the spec's V1 part-set check
> excludes it as a named divergence. No UI control added, so no docs page.

## Problem

`TODO/core-033` ported every opaque `.color(...)` call `jscad-raspberrypi@62a8e3b`'s
`raspberrypi.*` recipes dropped, including `touch-display-7inch.js:138-148`'s
`noGoPower` — `Parts.Cube({ x: 15, y: 10, z: 7 }).color('red')`, added with V1's own
`false` hidden flag (**visible by default**, unlike every other `clearance-*`/`*-nogo`
volume in this catalogue, which V1 itself hides). `src/core/kernel/recipes/
raspberrypi.touchDisplay7inch.js`'s `noGoPower` record now carries `color: 0xff0000`
and no `hidden` flag, exactly reproducing that.

This is the same shape of finding `render-003` filed as `render-004` for
`hardware.bolt`'s `tap`: an opaque, V1-faithful clearance solid that used to render
invisibly (dropped colour, palette-blue like everything else) and now renders as a
plain red block, because `render-003` made recipe colours actually paint.

**Measured, not just reasoned about**: dropping a `raspberrypi.touchDisplay7inch` alone
and driving the real app (laptop 1440x900 Chromium) shows the red block, though it
reads as a fairly small, thin sliver from most camera angles — see the caveat below.

## The caveat this finding should carry, stated rather than glossed

While reading `touch-display-7inch.js:139` to port the colour, the block's V1 size is
`{ x: 15, y: 10, z: 7 }`, but this port's own `NO_GO_POWER_MM.sizeMm` (this file,
`:159-162`) already recorded `[15, 10, 1]` — a pre-existing `z` mismatch (1 mm instead
of 7 mm) that predates this task and is **not** a colour-porting question, so it was
not touched here. It is worth someone's attention regardless: at the correct 7 mm
height the block would be far more visually prominent than what this task's own Step 6
screenshot shows, which makes "is this too obtrusive to leave opaque" a judgment call
that should be made against the *right* geometry, not the currently-undersized one.

## Proposed fix (not decided — same three options `render-004` posed)

1. Leave it exactly as V1 has it (opaque, visible) — it is real product information V1
   itself chose to show, not a rendering bug.
2. Give it a render-only translucency default, the way `render-003` did for the Pi
   boards' own `mb`/`board` alpha.
3. Hide it by default (`hidden: true`, `raspberrypi.touchDisplay7inch.js`'s own
   `noGoPower` record), the same divergence `render-004` chose for `hardware.bolt`'s
   `tap` — with or without a "show clearance" toggle, per that same task's own deferred
   half.

Whoever picks this up should also decide whether to fix the `z: 1` vs `z: 7` dimension
mismatch above in the same pass, since option 3's visual case is weaker at the wrong
(thinner) height than at the real one.

## Testing

Whichever option is picked, re-run this file's own regression surface: `core-020`'s
repro against `raspberrypi.touchDisplay7inch`, and re-drive `ACCEPTANCE.md` scenario 3
(the touch display isn't one of that scenario's own named parts, but it shares the
kernel/render pipeline core-033 and render-003/004 already touched) plus scenario 13 on
a `raspberrypi.touchDisplay7inch` sub-part, screenshotted at laptop Chromium and phone
WebKit, the same discipline `render-004`'s own retirement note used.
