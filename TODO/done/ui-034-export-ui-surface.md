---
title: Export UI surface — trigger, format picker, and scope choice
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [io-003]
status: done
---

> ## What actually shipped, 2026-09-21
>
> **File ▾ → Export…, built to `data-002` §12 (which overrode this file's Operations-toolbar text),
> with these decisions the Q&A left to the building task** (recorded in
> `docs/decisions/interaction-model-qa.md` §12's "Settled while building" bullet):
>
> - **(a) The document changing under an open popover** — Ctrl+Z, a programmatic edit or a hosted pull
>   can all do it (the backdrop stops a pointer, not those). Every line is **derived live** from the
>   document and selection rather than snapshotted at open; the file is built from `raw.bodies()` at
>   the moment of the press; a scope the user chose **explicitly** and that has since vanished
>   **blocks** Export (`The selection changed — choose what to export`) instead of widening to the whole
>   scene, while an untouched *default* just follows the selection. Unit-tested and driven with a real
>   Ctrl+Z in `e2e/export-ui.e2e.js`.
> - **(b) One download path.** `storage/download.js` (`<a download>` on a Blob URL, revoked after 30 s)
>   is now what `Download copy` uses too — `fileSystem.js`'s private copy was replaced, not duplicated.
> - **(c) Placement.** Export… is last in the "this device" group. Measured old tree against new at all
>   three viewports: the header cluster is identical, Save/Open… rows are at the same y, and only the
>   Hosted group moved (by exactly the new row); the menu is 242 px tall at 390.
> - **(d) Accessibility.** The dimmed item is `aria-disabled`, not `disabled` (still focusable), with its
>   reason **printed under the label** (a `title` never shows on a phone), wired as its accessible
>   description via `aria-describedby`.
> - **Availability precedence**: previewing beats empty (`Return to the latest step to export`). A
>   refusal is shown **by name inside the popover, which stays open**, not on the chip; success goes to
>   the chip. `Preparing…` shows on the button for any glTF export while it is in flight.
> - **Filename rule, one deviation from `ACCEPTANCE.md` scenario 11's original wording**: `io-003`
>   names a file by *body count* (one body → its name, several → `warpcad-scene.<ext>`), so a whole
>   scene of ONE body exports as `union-1.obj`, not `warpcad-scene.obj` as the scenario said. The
>   popover's summary line states the exact filename before the press, and the scenario was corrected
>   to match rather than the rule changed (io-003 shipped and tested it).
>
> **Found by driving, not fixed here:** `io-003`'s "0 unmatched edges" does not hold in general — the
> STL/OBJ of a hand-built cylinder ∪ cube has 9 of 300 edges unmatched and a placed bolt ~40 of 302
> (T-junctions; the volume is right). A pre-existing serializer property, not a regression from this
> task: filed as `TODO/io-004`. Also noted, out of scope: `HistoryControls.vue`'s Ctrl+Z guard treats any
> `<input>` — including a radio — as text entry, so the undo shortcut is a no-op while focus is on one of
> the popover's radios (it works from any button).
>
> **Not done, and not claimed:** no real slicer, mesh viewer or glTF viewer has opened any exported file
> (`TODO/VERIFY.md`). Firefox projects were not run (launch failure in this sandbox,
> `TROUBLESHOOTING.md`); the claim is Chromium + WebKit at all three viewports.
> `e2e/export.e2e.js` (the name the `io-003` note used) shipped as `e2e/export-ui.e2e.js`.

> **`io-003` is done (2026-09-19) — the mechanism this task calls exists.** Read
> `TODO/done/io-003-export-stl-obj-gltf.md`'s "What actually shipped" note first: it lists the
> exact surface (`resolveExportScope`, `exportFilename`, `exportBodies`, `exportGltf`,
> `EXPORT_FORMATS`, `ExportError` codes), states that several bodies are **one combined file**
> (so the popover's scope line can say so), and that `docs/export.md` is already written and
> says the button is still to come — **update it as part of this task** to describe the real
> control. This task also owns the `e2e/export.e2e.js` download-interception spec and driving
> `ACCEPTANCE.md` scenario 11 (recorded there as not driveable until now), and adds the
> `VERIFY.md` glTF size/orientation check's precondition.

## Goal

`io-003` builds the STL/OBJ/glTF serialization mechanism. This task is its control
surface: a trigger, a format picker, and the selection-vs-whole-scene choice, per
`data-002`'s confirmed answers. "Done" looks like: select a body (or nothing), trigger
Export, pick a format, and a file downloads — matching `TODO/ACCEPTANCE.md` scenario
11's concrete bar exactly.

## Interaction model

> **Superseded by `data-002`** (`docs/decisions/interaction-model-qa.md` section 12;
> confirmed by the user 2026-09-19). Where this section disagrees, that document wins:
> Export is **not** an Operations-toolbar button — it is **File ▾ → Export…** in the header
> bar, opening a popover with a Scope choice (defaults to the selection when one exists,
> otherwise the whole scene; always overridable) and a Format choice (STL default, OBJ,
> glTF `.glb`). It **is** disabled: with no bodies to export, and while previewing a past
> timeline state. The "never disabled" gating shape and the `OperationsToolbar.vue` edit
> described below no longer apply.

- **Precondition** — none in the disabled/enabled sense (0 or 1+ selected are both
  valid, with different scope per `io-003`'s Goal); an Operation-shaped control
  regardless (it acts on existing geometry, never creates any), so it belongs on the
  Operations toolbar alongside Union/Subtract/Fillet/etc., not the Library panel.
- **Trigger** — a new Operations-toolbar button (per `data-002`'s confirmed answer),
  opening a small format-picker popover (STL/OBJ/glTF) mirroring the existing
  Snap/Align/Fillet/Bisect popover mechanism.
- **Feedback** — a browser file download; the popover closes on commit, same as every
  other toolbar popover.
- **Placement** — n/a.
- **Selection response** — n/a beyond scope.
- **Selection count** — **0 or more** — genuinely different from every other toolbar
  control, which are gated at exactly-1 or 2+/2. This is worth naming explicitly as a
  new gating shape `OperationsToolbar.vue`'s existing `exactOneDisabled`/`isExactOneOp`
  computed properties don't cover — Export is **never disabled** by selection count,
  only its *scope* changes.
- **Small-screen behavior** — same phone/tablet popover-teleport pattern as every other
  toolbar popover.

## Documentation

- **Page** — `docs/export.md` (created by `io-003`; this task adds the control's
  walkthrough).
- **Example**: "Select a body (or select nothing to export everything), click Export on
  the Operations toolbar, choose a format, and the file downloads immediately."

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — a new, **never-disabled** button
  and popover, alongside the existing exactly-1/2+ gated ones — the toolbar's first
  control with this gating shape, worth a short comment noting the deliberate
  divergence from the existing `exactOneDisabled` pattern so a future reader doesn't
  assume it's a bug.
- Wiring to `io-003`'s exported export function.
- `docs/export.md`.

## Proposed fix

Pure UI wiring once `io-003` exists, mirroring the established popover pattern. The one
real design note: adding a sixth-or-so button to an already width-constrained toolbar —
`ui-015`'s and `ui-027`'s own retirement notes both name real cross-engine toolbar-width
regressions found only by hand-driving at narrow viewports (Firefox's wider button-label
rendering overlapping the orientation gizmo). Budget real driving time for this at
tablet width specifically, not just trust the existing `max-width`/wrap CSS to absorb a
new button without checking.

## Effort

M — UI wiring against an already-built serialization mechanism, reusing the established
popover pattern, with one real named cross-engine layout risk to verify by hand rather
than assume away. `model: sonnet`.

## Testing

- Extend `OperationsToolbar.spec.js`: the Export button is never disabled regardless of
  selection count (0, 1, 2+); the popover's format choice is passed correctly to the
  export call.
- New `e2e/export-ui.e2e.js` (required, new reachable control) — place two solids,
  union them, select the result, trigger Export, choose STL, confirm a file downloads
  (Playwright's download interception). Runs at all three reference viewports (toolbar-
  width risk named above, specifically re-check tablet per the cited precedent) and all
  three engines (touches the rendered/kernel geometry export path).
- **`TODO/ACCEPTANCE.md` scenario 11** by name, in full, per its own Steps — this
  control is the scenario's explicit trigger.
- **Closed-finding regression surface**: the toolbar-width-vs-orientation-gizmo defect
  `ui-015` found and `ui-027` re-confirmed the fix held for — re-run that same check
  (a button-count increase on this toolbar, driven by hand at tablet width in Firefox)
  since this task is the next one to add a button to the same toolbar.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
