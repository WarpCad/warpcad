---
title: Inspector "Hidden parts" section — show a selected body's hidden parts on demand
category: ui
kind: feature
priority: high
model: sonnet
milestone: M7
depends: [render-004, ui-016, ui-037]
status: done
---

**Done 2026-09-26.** Landed as scoped, with two Step 2 decisions this file left open,
now answered: (1) `hiddenParts` lists every part in `parts` absent from `names`,
**unfiltered** — a bolt shows all four (`tap-head`, `tap-thread`, `tap-headClearSpace`,
`tap`), not a curated subset — matching the exact set the Objects list's own ▸
disclosure already lists (`hiddenNamesOf()`, promoted out of `src/core/kernel/group.js`
and shared by both). (2) a shown hidden part **is** directly pickable as its own
sub-part in the viewport, no raycast exclusion. **Not built**: the Objects-row
indicator this file's Interaction model section asked for ("a shown-hidden body needs
a small indicator... so a clearance left on isn't mistaken for real geometry") — it
was outside this file's own Affected files list, and the Inspector's own toggle is the
primary feedback surface; logged as a `TODO/VERIFY.md` follow-up instead of silently
dropped. See `TODO/ROADMAP.md`'s Completion Log for the full accounting.

## Goal

Requested by the user on 2026-09-26, right after `render-004` hid `hardware.bolt`'s
`tap` clearance by default: *"When an object is selected the 'hidden' parts should have
an option to show them in the info panel."*

Hidden parts, such as a bolt's `tap` clearance or a washer's `clearance`, are real,
addressable geometry. They drive the correctly sized hole in a Subtract
(`ACCEPTANCE.md` scenario 5). Since `render-004`, nothing on screen says they exist,
unless the user already knows to open the Objects list's ▸ disclosure. "Done" looks
like this:
- Select a Bolt, and the Inspector lists its hidden parts (`tap`, and the `tap-*`
  children if they're meaningful to a user).
- One control shows those parts in the viewport, drawn in their recipe colour but
  translucent, so the head and thread still read through the red clearance (the look
  `render-004` removed).
- Tapping a listed part drills into it (`ui-016`'s single-part selection), ready to use
  as a Subtract operand.

## Interaction model

- **Precondition**: exactly 1 body selected, and that body's evaluated `Group` has at
  least one hidden part. The section is absent, not just disabled, for a body with no
  hidden parts (a Cube or a Pi board), so it doesn't add noise to every Inspector.
- **Trigger**: a new **Hidden parts** section in `Inspector.vue`, following the
  existing `inspector__section` pattern and sitting after Color. It holds:
  - a **Show hidden parts** toggle (a switch or checkbox with a ≥44px tap target), and
  - a list of the hidden part names, each tappable to drill into that part.
- **Feedback**:
  - While shown, each hidden part renders translucent in its recipe colour
    (`render-003`'s `paintColorOf`, forced to alpha of about 0.35 regardless of the
    recipe's alpha). It has `depthWrite: false`, like `render-003`'s translucent parts.
  - The toggle reads as on, and the Objects list's `hidden` label is unchanged.
  - Toggling adds **no** document record and **no** Undo step. It is a view state,
    like the camera.
- **Selection response**: this is part of "selecting an object shows that object's
  controls and dimensions". Tapping a listed name selects that part, and the breadcrumb
  shows `Bolt 1 ▸ tap`, exactly as the Objects list disclosure does today.
- **Selection count**: exactly 1.
- **Scope of the toggle (decide at Step 2 and state it):** is "shown" per body and
  persistent until switched off, or only while that body is selected? The
  **recommendation is per body, persistent for the session, UI-only**: a
  `stores/hiddenPartVisibility.js` Set of body ids, not persisted and not in the
  document. That lets a user see a bolt's clearance while positioning a shell around it
  with the bolt deselected. A shown-hidden body needs a small indicator (for example on
  its Objects row) so a clearance left on isn't mistaken for real geometry.
- **Small-screen behaviour**: lives in the phone/tablet Inspector sheet. Confirm the
  toggle and list rows meet tap-target size at 390px and that the section doesn't push
  Color/Parameters out of reach.

## Documentation

- **Page**: `docs/selection-and-inspector.md` (a new "Hidden parts" section), plus a
  cross-link from `docs/booleans.md`'s clearance-hole walkthrough, which `render-004`
  rewrote to route through the Objects list disclosure.
- **Example**: "Drop a Bolt and select it. Under **Hidden parts** the Inspector lists
  `tap`, the bolt's clearance. Turn on **Show hidden parts** and a translucent red
  cylinder appears around the bolt: that is the hole it needs. Tap `tap` to select just
  the clearance, then add the shell to the selection and press Subtract for a
  clearance-fit hole."

## Affected files

- `src/components/inspector/Inspector.vue`: the new section.
- `src/core/inspector.js`: `describeBody` reports `hiddenParts: string[]` (names in
  group order), framework-free and unit-tested.
- `src/stores/hiddenPartVisibility.js` (new, UI-only).
- `src/render/mesh.js`: the per-part mesh path currently **skips** hidden parts. When a
  body is in the shown set, build their meshes with a translucent material from the
  existing colour-keyed cache (`createColorMaterialCache`), and make sure they are **not
  pickable as the body itself**. A tap on the translucent clearance must keep selecting
  the bolt or drilling into `tap`, never something odd. Decide at Step 2 whether a
  shown hidden part is directly pickable as its sub-part (it probably should be).
- `src/components/viewport/Viewport.vue`: pass the shown set into `syncBodies`.
- `docs/selection-and-inspector.md`, `docs/booleans.md`.

## Proposed fix

Mirror `ui-037`'s shape: framework-free description in `core/inspector.js`, a thin
section in `Inspector.vue`, and a UI-only store for the view state. The render work
reuses `render-003`'s precedence and material cache, with no new material management.
Hidden-part meshes are built only when shown, so the default (nothing shown) costs
exactly what it does today.

## Relationship to scenario 5 (read before starting)

`render-004` changed what a plain whole-bolt Subtract cuts: it now cuts the **metal**
(an undersized hole), and only an explicit `tap` operand cuts the clearance.
`ACCEPTANCE.md` scenario 5's literal Steps (select shell + bolt → Subtract) no longer
meet its Expect as written. Whatever the user decides about that (see `TODO/BUDGET.md`
2026-09-26), this task is the discoverability half: it makes the clearance visible and
one tap away from being the Subtract operand. Re-read scenario 5's current text and the
user's decision before writing its re-drive.

## Effort

M. The Inspector and store are small and follow `ui-037`. The real work is
`mesh.js` building hidden-part meshes on demand with correct picking.

## Testing

- `inspector.spec.js`: `describeBody` lists a bolt's hidden parts, a washer's
  `clearance`, and an empty list for a Cube.
- `mesh.spec.js`: a body not in the shown set builds no hidden-part meshes (regression
  guard, with identical mesh count to today). A shown body adds translucent meshes with
  `depthWrite: false`, and turning it off disposes them.
- New `e2e/inspector-hidden-parts.e2e.js` (a required new reachable control, navigating
  to `/`):
  - Drop a Bolt and select it, and the Hidden parts section lists `tap`.
  - Toggle on, and the canvas pixels around the bolt change (translucent red appears).
  - Toggle off, and they revert.
  - Tap `tap`, and the breadcrumb reads `Bolt 1 ▸ tap`.
  - A Cube shows no Hidden parts section.
  - Runs at all three viewports and all three engines (a WebGL material/picking path).
- **`TODO/ACCEPTANCE.md`**: scenario 5 (the clearance hole via the new route),
  scenario 13 (colour on a shown hidden part still follows precedence), and scenario 1.
- **Closed-finding regression surface**: `ui-041`'s x-ray twin (selection inside an
  enclosing shell) must still work with a translucent clearance drawn, and `core-020`'s
  repro must pass.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
