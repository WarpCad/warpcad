---
title: The first Library drag after closing an Operations popover with Escape is ignored
category: ui
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

> **Resolved 2026-09-28.** Root cause: no code anywhere handled Escape for the
> Operations toolbar's three popovers (Snap/Align, Fillet/Chamfer,
> Enlarge/Fit/Bisect — one shared `openPopover` ref and backdrop). Escape did
> nothing, so the popover's full-viewport backdrop stayed mounted and
> intercepted the next `pointerdown`, closing itself instead of letting the
> drag through. Fixed with a single capture-phase `window` keydown listener in
> `OperationsToolbar.vue` that closes `openPopover` on Escape, covering all
> three popover types at the one shared point. See
> `TODO/done/ui-053-first-library-drag-after-escape-ignored.md`'s
> `TODO/ROADMAP.md` Completion Log entry for the full writeup.

## Problem

Found by `TODO/core-035`'s Step 6 re-drive of `TODO/ACCEPTANCE.md` scenario 12, and **not
caused by it**: reproduced identically against a `git archive` of HEAD before `core-035`
(2233c53), served on its own port.

At laptop 1440×900 Chromium, with real mouse input:

1. Drag a Cube from the Library into the viewport. It lands, selected.
2. Press **Fillet** on the Operations toolbar, type `4` in Radius.
3. Press **Esc**. The popover closes.
4. Drag another Cube from the Library to open grid.

Nothing is placed: no ghost commit, no new body, no message. A second, identical drag
right afterwards places the cube normally. Closing the popover with its own **Cancel**
button instead of Esc, or not opening it at all, and the first drag works.

| close the Fillet popover with | bodies after the next drag (expected 2) |
|---|---|
| Esc | **1** (current tree at Normal and at Legacy; HEAD) |
| Cancel | 2 |
| (popover never opened) | 2 |

To a user this reads as "the Library stopped working" for exactly one gesture, right after
the most natural way to dismiss a popover. The previous attempt's stop note is the same
class of failure: an interaction that silently does nothing.

## Interaction model

n/a. No new control. The existing drag-to-place trigger must work regardless of how the
previous popover was dismissed.

## Documentation

n/a. `docs/primitive-placement.md` already describes the drag; the fix makes it true.

## Affected files

Not root-caused (out of `core-035`'s scope). Likely somewhere in how Esc is handled for the
Operations popovers (`src/components/viewport/OperationsToolbar.vue`) interacting with the
placement gesture's start (`src/stores/placement.js` `begin`, and the Library row's
`pointerdown`). Candidates: a keydown handler leaving a flag or pointer capture set, or
focus remaining in the removed popover so the next `pointerdown` is consumed as a
"click outside".

## Proposed fix

Reproduce with a real-mouse Playwright script (the four steps above), instrument the
placement store's `begin` and the Library row's `pointerdown` to see which one does not
fire, then fix at that point. Do not add a retry.

## Effort

S-M.

## Testing

- **E2E**: the four steps above in `e2e/fillet-chamfer-operation.e2e.js` (or the placement
  spec), asserting the second body lands on the **first** drag, at all three viewports on
  Chromium and WebKit (touch: dismiss via the backdrop tap as well as Esc where a keyboard
  exists).
- **`TODO/ACCEPTANCE.md` scenarios to re-drive**: 1 (placement), 12 (steps 2 and 12 open and
  dismiss these popovers).
- **Closed-finding regression surface**: none known.
