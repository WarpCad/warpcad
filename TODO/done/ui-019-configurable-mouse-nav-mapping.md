---
title: Configurable mouse-button mapping for viewport pan/orbit, persisted in localStorage
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M1
depends: [ui-018]
status: done
---

## Goal

`ui-018` hardcodes one specific desktop convention: Shift+left-drag or right-drag pans,
plain left-drag orbits. That is a reasonable default, but mouse-button conventions for
3D navigation genuinely vary across the tools people already use (some put pan on a
held modifier, some swap which button orbits vs. pans entirely), and a hardcoded scheme
will fight some users' muscle memory no matter which one is chosen. This task makes
`ui-018`'s button/modifier mapping a **stored preference**: a small set of presets a
user can pick from, persisted to `localStorage` so the choice survives a reload, with
`ui-018`'s default remaining the out-of-the-box behavior for anyone who never opens it.

**Explicitly out of scope**: a fully general per-action key/button rebinding UI (bind
any gesture to any of orbit/pan/zoom independently). That is a much larger surface with
its own conflict-resolution questions (what if two actions get bound to the same
trigger?) — this task ships a small, fixed list of presets covering the conventions
people actually asked for, and names a follow-up task if free-form rebinding turns out
to be needed later.

**Done when**: a settings control reachable from the viewport chrome opens a short list
of navigation presets (at minimum: `ui-018`'s default — Shift+Left or Right-drag pans —
and one alternate — plain Left-drag pans, Right-drag orbits, matching tools that put
pan on the primary button); picking one takes effect immediately on the next drag, is
written to `localStorage`, and is read back and applied on the next app load without
requiring the user to reselect it.

## Interaction model

- **Precondition**: none — reachable regardless of selection state, same as the
  existing `Orbit`/`Pan` mode toggle it sits beside.
- **Trigger**: a small settings control (e.g. a gear icon) added to the
  `NavigationChrome` cluster, opening a short preset list (a popover or an inline
  expand — match `NavigationChrome`'s existing visual language rather than introducing
  a new control style). Selecting a preset in the list applies it.
- **Feedback**: the selected preset is visibly marked as active in the list (so
  re-opening it shows the current choice, not a blank picker). The very next drag
  gesture behaves according to the newly selected preset — no reload required.
- **Placement / Selection response**: n/a.
- **Selection count**: n/a.
- **Small-screen behavior**: the control must fit into `NavigationChrome`'s existing
  responsive layout at phone width (390px) without pushing other chrome controls off
  screen or below tap-target size — collapse it behind the same kind of overflow/menu
  pattern the chrome already uses if space is tight, rather than shrinking icons below
  the tap-target floor `CLAUDE.md`'s Responsive Layout section requires. Note that the
  preset choice itself is largely moot on touch (no Shift key, no right button — see
  `ui-018`), so this control's *value* on a phone is mostly to stay consistent/visible,
  not to change touch behavior.

## Documentation

- **Page**: update `docs/viewport-navigation.md` — add a short section on the
  navigation-preset control, alongside the mouse-controls section `ui-018` updates.
- **Example**: "Click the gear icon in the navigation chrome, choose 'Left-drag pans,
  right-drag orbits' from the list. Your next drag in the viewport pans immediately,
  and the choice is remembered the next time you open the app."

## Affected files

- `src/stores/settings.js` (new — a small Pinia store wrapping a `mouseNav` preset id,
  reading from and writing to `localStorage` at a namespaced key, mirroring the
  existing stores' shape in `src/stores/`; this is the project's first `localStorage`
  use, so this file is also where the read/write boundary — try/catch around a
  disabled or full `localStorage`, e.g. a private-browsing context that throws — is
  established for future settings to reuse)
- `src/stores/settings.spec.js` (new — mock `localStorage` per `CLAUDE.md`'s
  "always mock at the boundary" convention; cover: default preset when nothing is
  stored, a stored preset is read back, and a corrupt/unknown stored value falls back
  to the default rather than throwing)
- `src/components/viewport/NavigationChrome.vue` (edit — add the settings control)
- `src/components/viewport/Viewport.vue` (edit — read the active preset from
  `settings.js` instead of `ui-018`'s hardcoded Shift/right-button condition, so the
  same effective-drag-mode logic branches on the stored preset)
- `e2e/viewport-scaffold.e2e.js` (edit)
- `docs/viewport-navigation.md` (edit)

## Proposed fix

`src/stores/settings.js` holds a small typed preset id (e.g. `'shift-or-right-pans'` |
`'left-pans'`), defaulting to `ui-018`'s scheme, read once at store creation from
`localStorage.getItem('warpcad.mouseNav')` inside a try/catch (never let a blocked or
throwing `localStorage` — private browsing, a locked-down browser setting — crash
startup; fall back to the default preset and proceed), and written back on every change.
`Viewport.vue`'s effective-drag-mode computation from `ui-018` takes the current preset
as an input rather than hardcoding which button/modifier means pan, so adding a future
third preset only ever touches the mapping table in one place, not the pointer-handling
logic itself.

## Effort

M (a few hours) — mostly the new store plus its localStorage boundary tests; the chrome
control and the `Viewport.vue` parameterization are both small once `ui-018` exists.

## Testing

`src/stores/settings.spec.js` per Affected files above, with a mocked `localStorage`.

Extend `e2e/viewport-scaffold.e2e.js`: open the settings control, switch to the
alternate preset, assert a plain left-drag now pans (reusing `ui-018`'s spec
assertions with the roles swapped) and a right-drag now orbits; reload the page and
assert the alternate preset is still active without reselecting it (the actual
`localStorage`-persistence claim — Playwright's real browser storage is the right test
surface here, not the mocked unit test, since the point is surviving a real reload).

Runs against all three engines (this task extends `ui-018`'s pointer-handling code path,
which is already flagged WebGL/engine-sensitive; a `localStorage` read/write is itself
a persistence-sensitive path per `CLAUDE.md`'s Browser Support section). Runs at all
three reference viewports (this adds a new chrome control whose phone-width layout
behavior is explicitly not "same as desktop" per the Small-screen behavior bullet
above), with a snapshot at each showing the settings control fits the chrome without
crowding or hiding other controls.

**`TODO/ACCEPTANCE.md` scenarios this could plausibly affect**: scenario 7 (touch-only
viewport navigation) — re-drive it to confirm the new chrome control doesn't crowd or
cover the existing orbit/pan/zoom/orientation-gizmo controls scenario 7 already
exercises at the iPad viewport. No closed finding exists yet against the camera/pointer
or settings subsystem to re-check (this is the first task to touch `localStorage` at
all in this project).
