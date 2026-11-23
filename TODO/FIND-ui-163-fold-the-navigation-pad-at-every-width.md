---
title: Let the user fold the navigation pad away at every width, and remember it
category: ui
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, requested by the owner 2026-11-23
depends: []
status: open
---

## Problem

The owner, 2026-11-23, on an iPad in landscape: "the orbit controls at the bottom left take up a lot of room too, so making it
possible to open/close it would be nice."

`NavigationChrome.vue` (Orbit / Pan / Select, the gear, the direction pad, and + / −) is always fully open except in one case. When
an open phone sheet raises it (`raised`, ≤ 640 px, `ui-046`), it folds to the `nav-expand-toggle` button (**✥ View**, `ui-128`). On
the owner's iPad the open cluster is about 230×190 CSS px of the 3D view's lower left, and there is no way to put it away.

On a touch device most users won't need it once they know the gestures. A one-finger drag orbits, two fingers pan and pinch zoom,
and the view cube snaps. The pad has to stay *reachable without a keyboard* (CLAUDE.md, viewport navigation rule). It doesn't have
to stay *open*: `ui-046` already showed that a folded pad behind one labelled tap meets the rule.

## Interaction model

- **Precondition** — nothing. Available whenever the pad is shown, at every width, sketching or not.
- **Trigger** —
  - **Fold:** a new button at the cluster's top-right corner (`data-testid="nav-fold"`, a ⌄ or "Hide" glyph, at `--tap` size on a
    coarse pointer, `aria-label="Hide navigation controls"`).
  - **Unfold:** the existing `nav-expand-toggle` (**✥ View**) in the same corner the cluster folds into, as `ui-046` and `ui-128`
    built it.
- **Feedback** — the cluster shrinks to the single **✥ View** button in the bottom-left corner, `aria-expanded="false"`. Unfolding
  brings back the whole cluster in the same drag mode it was in. The fold state is remembered across reloads on this device.
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — the same control at every width. On a phone, `ui-046`'s raise still forces the fold whenever a
  sheet opens. When the sheet closes, the pad goes back to the user's remembered state, not always open.

## Documentation

- **Page** — `docs/viewport-navigation.md` (the navigation pad section) and `docs/mobile.md` (which describes the phone's folded
  pad today).
- **Example** — "To clear the lower-left corner of the 3D view, tap **⌄** at the top-right of the navigation pad. The pad folds to
  a single **✥ View** button. One-finger drag still orbits and a pinch still zooms. Tap **✥ View** to bring the pad back. WarpCad
  remembers which way you left it."
- **Media** — a new still pair, `docs/screenshots/nav-chrome-folded-tablet.png` and `.dark`, from `e2e/docs/viewport-navigation.docs.js`
  or `mobile.docs.js`. Refresh `nav-chrome-folded-phone` and `nav-chrome-open-phone` if the fold button changes the open
  cluster's look. Use a scoped run, never `docs:gifs`.

## Affected files

- `src/components/viewport/NavigationChrome.vue` — the fold button. The `expanded` ref becomes "user folded" (persisted) OR'd with
  `ui-046`'s "raised" (transient). Update the doc comment on `raised`.
- `src/stores/settings.js` — a `navFolded` setting under a new `localStorage` key (`warpcad.navFolded`), read and written inside
  the store's existing try/catch boundary, defaulting to unfolded.
- `e2e/` — a new or extended spec (below). The helpers in `boolean-operations`, `group-combine` and `gizmo-transform` that unfold
  "the phone-only toggle" stay correct, but their comments now describe the wrong case.

## Proposed fix

1. Add `navFolded` (boolean, default `false`) and `setNavFolded()` to the settings store, following `setMouseNavPreset`'s
   `localStorage` pattern. A throwing store falls back to unfolded.
2. In `NavigationChrome.vue`, the cluster is folded when `settings.navFolded || (raised && !expanded)`. `ui-046`'s reset-on-raise
   watch keeps its meaning (an expansion made over one sheet doesn't come back over the next). The user's own fold is not reset by
   a raise, a sketch or a reload.
3. The fold button sits in the cluster's top-right corner so it doesn't move the pad's buttons. **✥ View** takes the same corner
   when folded, so a fold and an unfold are two taps in nearly the same place.
4. The default is unfolded on first visit, so the pad stays discoverable. This is a reversible default taken while writing the
   task. Folding by default on coarse pointers is the alternative if the owner prefers it.
5. Keep `ui-124` (the cluster doesn't cover the scale readout) and `ui-135`/`ui-149` (44 px mode buttons on a phone).

## Testing

- **Unit**: `settings.spec.js` — `navFolded` round-trips, a corrupt or throwing `localStorage` falls back to `false`.
- **E2E**: a `nav-chrome-fold.e2e.js` that navigates to `/` and, at all three viewports and all three engines (touch input and
  persistence are both involved): folds, checks that the folded control is no bigger than 60 px each way and that the canvas under
  the old cluster area takes a tap, orbits with a one-finger drag while folded, reloads, checks it is still folded, unfolds, and
  checks the drag mode survived. On a phone, open and close an Inspector sheet and confirm the remembered state wins. Add one
  landscape case at 1180×820 in the tablet project, which is the owner's iPad.
- **Re-run closed findings**: `ui-046` (raised cluster folds, the body under it stays tappable), `ui-128` (the folded toggle says
  View), `ui-124` (scale readout not covered), `ui-149` (44 px mode buttons).
- **Acceptance**: re-drive scenario 7 at 820×1180 and 1180×820 with touch only. Run steps 2–4 once with the pad unfolded from the
  folded state, so the fold sits on the path scenario 7 takes.

## Effort

S

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
