---
title: Save/Load UI surface — local and hosted
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [io-001, io-002]
status: open
---

## Goal

`io-001`/`io-002` build the local (IndexedDB + File System Access) and hosted
(git-backend) persistence mechanisms. This task is the control surface: trigger(s),
local-vs-hosted choice, and feedback, per `data-002`'s confirmed answers. "Done" looks
like: a reachable Save/Load control that lets a user explicitly save a portable file,
explicitly load one back, and connect/use a hosted repository — with autosave (built by
`io-001`) running underneath without needing this UI at all for the common case.

## Interaction model

> **Superseded by `data-002`** (`docs/decisions/interaction-model-qa.md` sections 8-11;
> confirmed by the user 2026-09-19). Where this section disagrees, that document wins:
> the controls are the **header bar's File ▾ menu** (not a settings-gear-style control)
> with the save-status chip and a File-button status dot; the local items are labelled by
> capability (**Save** / **Save As…** where File System Access exists, **Download copy**
> everywhere else) and **Open…** with a confirm-replace dialog; hosted writes are
> **explicit `Save to` / `Load from`, plus a per-connection opt-in Auto-push (off by
> default)** — not "automatic" — and Ctrl/Cmd+S never touches the network.

- **Precondition** — nothing selected; document-level action.
- **Trigger** — per `data-002`'s confirmed answer: likely a menu or toolbar control
  (mirroring `ui-019`'s settings-gear placement precedent for a global, non-selection-
  gated action) opening a small panel/popover with Save As, Open, and Connect Hosted
  Storage options.
- **Feedback** — a save/load success or failure indicator (never silent, per
  `CLAUDE.md`'s Verification bar); a connected/disconnected status for the hosted
  backend, visible without opening the panel (e.g. a small badge on the trigger
  control itself).
- **Placement** — n/a.
- **Selection response** — n/a.
- **Selection count** — n/a.
- **Small-screen behavior** — per `CLAUDE.md`'s phone-first rule, design this control's
  phone layout first — likely the same popover-teleported-to-`<body>` pattern
  `ui-026`/`ui-027`/`ui-028` already established for phone/tablet-safe popovers, reused
  here rather than invented fresh.

## Documentation

- **Page** — `docs/save-load.md` (shared with `io-001`/`io-002`, whichever of the three
  lands first creates it; this task adds the actual control's screenshot/walkthrough).
- **Example**: "Click the Save/Load control. Choose Save As to download a project file,
  Open to load one back, or Connect Hosted Storage to link a repository for automatic
  cloud saves."

## Affected files

- `src/components/storage/` (new — `CLAUDE.md`'s Component Categories names `storage/`
  as "project browser, save/open, remote-backend connection UI," unused until now) —
  the trigger control and its popover/panel.
- Wiring to `io-001`/`io-002`'s exported functions — no new document-model or
  persistence logic in this task, purely UI calling already-built mechanisms.
- `docs/save-load.md`.

## Proposed fix

Pure UI wiring once `io-001`/`io-002` exist — this task's own complexity is in
UI/UX polish (clear status feedback, a phone-safe popover) rather than new mechanism,
closely mirroring the established popover pattern from `ui-026`'s Snap/Align control.

## Effort

M — UI wiring against two already-built backends, reusing an established popover
pattern; `model: sonnet` per `TODO/README.md`'s guidance that UI wiring mirroring an
established pattern stays sonnet.

## Testing

- New `e2e/save-load-ui.e2e.js` (required, new reachable control) — open the panel,
  trigger Save As (mock the File System Access call per `CLAUDE.md`'s boundary-mocking
  convention in the test harness), confirm a success indicator appears; trigger Open
  with a known file, confirm the document loads. Runs at all three reference viewports
  (new panel/overlay, per `CLAUDE.md`'s layout rule) — engine scope: Chromium/WebKit at
  minimum since File System Access support differs by engine (`io-001`'s own fallback
  path needs exercising on at least one engine lacking full support).
- **`TODO/ACCEPTANCE.md` scenario 10** by name, in full, per its own Steps — this
  control is the scenario's explicit trigger.
- **Closed-finding regression surface**: none new beyond what `io-001`/`io-002` already
  name — this task adds no new document-mutation path.
