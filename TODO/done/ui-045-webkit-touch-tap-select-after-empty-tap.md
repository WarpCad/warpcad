---
title: WebKit touch — after one tap on empty viewport space, tapping a body no longer selects it
category: ui
kind: finding
priority: high
model: sonnet
depends: []
status: done
---

> ## What actually shipped, and why this closes as a diagnosis rather than a confirmed fix
>
> **No bug was found in `Viewport.vue`'s pointer-handling or raycasting code.** Extensive
> controlled reproduction (Playwright webkit-phone/tablet and chromium-phone/tablet, both
> `page.touchscreen.tap` and synthetic `canvas.dispatchEvent`, with temporary `console.log`
> instrumentation of `onPointerUp` and `pickAt`'s `raycastHit` result, removed before this
> commit) never found a case where a trusted tap that genuinely reached the canvas
> (`isClick: true`, `pickAt` actually called) raycast differently than a synthetic tap at
> the identical point and state. Every reproduction that looked like this file's symptom
> turned out, on inspection, to be a stray tap landing on `NavigationChrome` (once raised
> above an open bottom sheet) or the transform gizmo *instead of* the canvas — confirmed by
> a capture-phase `window` listener logging `event.target`. Because every existing spec's
> selection helper (`clickViewportAt`, `dragRowIntoViewport`) dispatches `PointerEvent`s
> directly on the canvas *node*, bypassing real DOM hit-testing entirely, none of them —
> and no synthetic-event comparison, including this file's own — could ever have
> distinguished "the raycast is wrong" from "the tap's real target wasn't the canvas."
>
> **Shipped**: `event.preventDefault()` on `Viewport.vue`'s `onPointerDown`, which is the
> spec-defined way to suppress WebKit's post-touch compatibility `click` — the concrete
> artifact this file's own event log flagged as suspicious, even though no listener in this
> codebase was found to react to it. Also shipped: new `page.touchscreen.tap`-based
> (trusted touch) coverage in `e2e/selection-inspector.e2e.js`, at coordinates verified
> clear of every overlay band, covering exactly this file's Testing section's ask — a gesture
> no existing spec drove with real touch input before.
>
> **This is reported honestly as a diagnosis plus a defensive mitigation, not a confirmed
> fix**: the new test was checked explicitly (via `git stash`) to pass identically with the
> `preventDefault()` change present or absent, so it does not prove the original defect is
> resolved — only that it could not be reproduced in this sandbox once DOM occlusion is
> controlled for. The `TODO/VERIFY.md` real-device row this file's own Testing section
> already named is what actually settles it. See `TROUBLESHOOTING.md`'s 2026-09-24 entry for
> the full step-by-step diagnostic trail (five hypotheses ruled out in turn), and
> `TODO/ui-046-nav-chrome-raised-position-can-overlap-canvas-content.md` for a real, separate
> defect found along the way and filed rather than folded in here.

## Problem

Found by `TODO/core-031`'s Step 6 re-drive of `TODO/ACCEPTANCE.md` scenario 1 at **phone
390×844 in WebKit, with Playwright's real `page.touchscreen.tap`**. It is **pre-existing**:
the same probe against a production build of `65b86de` (the tree before `core-031`)
fails identically. `core-031` changed no selection, pointer or viewport code.

Scenario 1 step 4 ("click empty viewport space to clear selection, then click the cube,
then click the cylinder"), driven by touch:

1. Drop a Cube and a Cylinder from the Library. The Cylinder is selected.
2. Tap empty grid **on the viewport canvas** (at phone width, above the Inspector sheet,
   e.g. (372, 240) px). The selection clears, correctly.
3. Tap the Cube, then the Cylinder, where they visibly are ((135, 290) and (268, 255) px).
   **Nothing is selected, either time.** Waiting 0.3 s or 1.5 s between taps makes no
   difference.

What was measured, all at phone WebKit on the production build:

| | result |
|---|---|
| Trusted touch taps on bodies, **before** any tap on empty canvas | select correctly (Cube, then Cylinder) |
| Trusted touch taps on bodies **after** one trusted tap on empty canvas | select nothing |
| Synthetic `PointerEvent` press, `pointerType: 'mouse'`, same point, same state | selects the Cube |
| Synthetic `PointerEvent` press, `pointerType: 'touch'`, same point, same state | selects the Cylinder |
| Canvas event log for a failing trusted tap | `pointerdown:0:touch@135,290`, `pointerup:0:touch@135,290`, then WebKit's compatibility `click:1:mouse`. The coordinates are exact and there is no `pointermove` in between |
| Same sequence, **Chromium** phone with touch emulation | works: Cube, then Cylinder |
| Canvas rect after the clear | 390×791, correct |

So raycasting and picking are fine, the events arrive at the right place, and the failure
is specific to **trusted** touch input in WebKit, after a trusted tap on empty space. Every
existing e2e spec drives selection with *synthetic* mouse-type `PointerEvent`s even on the
phone projects (`e2e/selection-inspector.e2e.js`'s `clickViewportAt`), which is why none
of them catch it.

Not yet known: whether a **real iPhone/iPad** reproduces it, or whether it is specific to
Playwright's WebKit touch emulation. iOS Safari is WebKit, and this is the second
attempt's exact failure class ("I tried to keep up on my iphone and ipad … nothing really
worked"), so it is filed high until a real device rules it in or out
(`TODO/VERIFY.md`, `core-031` entry).

Candidates to check first in `src/components/viewport/Viewport.vue` `onPointerDown` /
`onPointerUp`:
- state the trusted path sets and the synthetic path never does. `setPointerCapture`
  succeeds only for a trusted pointer.
- the compatibility `click` WebKit fires after `pointerup`, and anything listening for it
  (a document-level or gizmo handler that could clear or toggle the selection just set).

## Affected files

- `src/components/viewport/Viewport.vue`: the canvas pointer handlers and `pickAt`
- `e2e/selection-inspector.e2e.js` (or a new spec): a **trusted**-touch tap sequence

## Proposed fix

Reproduce with `page.touchscreen.tap` in a `webkit-phone` e2e spec: drop two bodies, tap
empty canvas, tap each body, and expect exactly that body selected each time. Then find
which of the candidates above differs between the trusted and synthetic paths, and fix
it there. Whatever the cause, keep the real-touch spec so this path is covered.

## Effort

**S-M.** Mostly diagnosis.

## Testing

- A real-app `*.e2e.js` spec using `page.touchscreen.tap` (trusted touch), on
  `webkit-phone`, `webkit-tablet`, `chromium-phone` and `chromium-tablet`. Firefox has no
  touch emulation.
- `TODO/ACCEPTANCE.md`: scenario 1 (step 4, by touch) and scenario 7 (touch-only
  navigation), plus scenario 4's selection steps by touch.
- On a real iPhone and iPad: the `TODO/VERIFY.md` row from `core-031`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
