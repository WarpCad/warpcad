---
title: Save/Load UI surface — local and hosted
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M6
depends: [io-001, io-002]
status: done
---

> ## What actually shipped, 2026-09-21
>
> **The File ▾ menu, built exactly as `data-002` §8-11 specify, with six things the Q&A left to
> the building task** (all recorded in `docs/decisions/interaction-model-qa.md` §11's "Settled
> while building" bullet):
>
> - **`hosted.start()` is called at boot** — `io-002` deliberately left it unwired. It runs
>   *after* the local restore has landed (`src/composables/useStorageBoot.js`), because §11
>   rule 3 decides "is the restored document ahead of the last push?" by hashing the document,
>   which is the empty scene until the restore finishes. Covered by a unit spec and by an e2e
>   that reloads with auto-push on and asserts the dot and a scheduled push with nothing clicked.
> - **Branch and path unchanged**: default branch, no branch field, `warpcad-project.ndjson`.
> - **While History previews**, Save / Download copy and Open… stay enabled (§14 as written).
>   The menu says Save writes the *current* project, not the preview, and a completed Open or
>   Load **ends the preview** — a change in `stores/timeline.js` (it watches `loadRevision`),
>   because re-opening the file you just saved brings back the *same row ids* and a preview keyed
>   on an id would otherwise survive and freeze the viewport on a document that no longer exists.
> - **`Replace token…` is a menu item** (and a button in the Connect dialog): rule 6's recovery
>   path ("`Connect repository…` → `Replace token`") needs a way in while connected, and the
>   Connect item is replaced by the connected group. It reconnects, so Auto-push comes back off.
> - **Errors can be dismissed.** §"one status surface" says errors persist "until the next
>   success *or until dismissed*", and nothing offered dismissal: the chip is now a real button
>   while it shows an error (opens the menu, §8) and the menu offers *Dismiss this message*.
> - **Of two transient notices the newer wins** in the chip (`useStatusSurface`), because a fixed
>   order let `Restored your last session` sit on top of a Connect the user had just performed.
>
> **Two defects found by driving, not by the suite, and fixed here**: (1) after **Cancel** on the
> conflict dialog the auto-push menu item fell back to `Auto-push paused — will retry`, promising
> a retry §11 rule 5 says is not coming — a one-line fix in `stores/hosted.js` (`divergent`, not
> `conflict`), pinned by a unit assertion that fails without it; (2) the conflict dialog printed
> its sentence twice on a phone screenshot (title plus the store's identically worded detail
> line), now shown only when it says something different.
>
> **Deliberately not done**: `Export…` (`ui-034` — the menu marks where it goes and needs no
> restructuring); a `New project` item (§10 flags it as a gap, not scope); a native
> `showSaveFilePicker` click (an OS dialog — proven against an injected fake, and left in
> `TODO/VERIFY.md`); scenario 10's **hosted half against a real repository** — not driveable
> here (no real token, no real network, and none may be used) — driven against a `page.route`
> mock of `api.github.com` only, and stated as such in `TODO/ACCEPTANCE.md`.

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
