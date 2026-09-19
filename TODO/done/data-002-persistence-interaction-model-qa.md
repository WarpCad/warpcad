---
title: Interaction-model Q&A for save/load, export, and timeline-history controls
category: data
kind: feature
priority: high
model: sonnet
milestone: M6
depends: [data-001]
status: done
---

> **Retirement note (2026-09-19).** Shipped as specified — `docs/decisions/interaction-model-qa.md`
> sections 8-19 answer Q10-17 for Autosave, Save, Load, Hosted storage, Export, the Timeline
> panel (open/close plus select-to-preview, edit-in-place, suppress, reorder, rollback each
> separately) and Undo/Redo, and `TODO/ACCEPTANCE.md` scenarios 10, 11 and 12 are rewritten
> against those control names with the "whatever the confirmed trigger turns out to be"
> placeholders gone. **How it ran differs from the file's Proposed fix:** rather than a live
> Phase-1 Q&A, the agent drafted every answer from existing precedent and the user reviewed
> the draft in one pass, confirming most of it and changing two things.
>
> **Two answers the user changed from the draft, and both grew the scope of a downstream
> task:** (1) hosted saves stay explicit but gain a **per-connection opt-in Auto-push, off by
> default** (`io-002`/`ui-033` inherit a debounce, a shape-coded status dot, and a rule that a
> 409 pauses auto-push and raises the conflict dialog rather than overwriting); (2) rollback
> is **Fusion-style** — creation is not blocked while rolled back, new steps **insert at the
> marker** and the formerly-inactive rows replay after them on roll-forward, which puts an
> insert-at-index primitive and an inactive-tail shadow check on `data-004`, and leaves one
> flagged open question there (moving a body that a later row also builds on flags that row
> `broken`; whether to re-parent it instead is `data-004`'s to measure).
>
> **Four things came out different from what the downstream files assumed**, and each of
> those files now carries a "Superseded by `data-002`" note (and no other edit): Export is
> **File ▾ → Export…** in the header bar, not an Operations-toolbar button, and *is*
> disabled with no bodies or while previewing (`ui-034`); every global control (Undo, Redo,
> History, File ▾) lives in the **header bar**, not nav-chrome, because the viewport corners
> and the Operations toolbar are already at their width limit (`ui-033`); hosted writes are
> not "automatic" by default (`ui-033`, `io-002`); and `io-003`'s Affected files must build
> both `src/core/export.js` and `src/render/export.js` (a note `data-001` had recorded but
> not written into the file). The smaller calls the user did not explicitly decide are
> listed under "Still open" in the Q&A's Decisions log rather than silently defaulted.
>
> No code changed, so no `*.e2e.js`, unit test or Step 6 drive applies; `TODO/ACCEPTANCE.md`
> 10-12 are the deliverable, and stay "not yet built" until `ui-032`/`ui-033`/`ui-034` land.

## Goal

`ui-001` did this same walkthrough for the six §7 controls before M1 started, and its
answers are what let `TODO/ACCEPTANCE.md` scenarios 1-9 be rewritten from
`Initial design.md`'s provisional wording into real, driveable steps. Scenarios 10-12
(save/reload, export, mid-history edit) were written at M6's kickoff with the same
provisional-wording caveat stated explicitly in each one ("whatever the confirmed
trigger turns out to be — see `data-002`"). This task is that confirmation: run
`.claude/commands/feature.md` Phase 1 (Q10-16) for each of Save, Load, Export, and the
Timeline-history controls, and rewrite scenarios 10-12 against the real answers, the
same way `ui-001` fixed scenarios 1-9.

"Done" looks like: `docs/decisions/interaction-model-qa.md` gets a new section (matching
its existing per-control structure) answering precondition/trigger/feedback/placement/
selection-response/selection-count/small-screen for Save, Load, Export, and Timeline
open/edit/suppress/reorder/rollback — and `TODO/ACCEPTANCE.md` scenarios 10, 11, 12 are
rewritten to use the confirmed control names instead of their current "whatever the
confirmed trigger turns out to be" placeholders.

## Interaction model

This task **is** the Interaction-model Q&A — the section itself doesn't apply in the
usual sense (there's no code to describe an interaction model *for* yet), but per
`TODO/README.md`'s rule the answers this task produces must actually answer every Q10-16
question for the four control groups below, not just gesture at them:

- **Save/Load**: is Save automatic (per every change, like a real autosave) or a
  discrete triggered action? If discrete, what control and where? Local vs. hosted
  target — one control with a choice, or two separate controls? What confirms a save
  succeeded (a toast, a status indicator, silence)?
- **Export**: precondition (nothing selected → whole scene; something selected →
  selection-only, per `CLAUDE.md`'s general Operation-gating pattern) — decide and
  state explicitly rather than leave ambiguous. Trigger and where it lives (a new
  toolbar control, or folded into an existing menu). Format picker UI. Feedback (a
  browser download, and what filename convention).
- **Timeline panel** (`ui-032`'s eventual home): trigger to open/close it (a persistent
  panel per `src/components/timeline/`'s naming, or a toggle?). Per-entry controls:
  select-to-preview, edit-in-place, suppress, reorder, rollback — each needs its own
  precondition/trigger/feedback answered, not bundled as one generic "timeline
  interactions" answer. Small-screen behavior is a real question here specifically:
  `CLAUDE.md`'s phone-first rule applies to a panel that could easily assume desktop
  width by default.
- **Undo/redo** (`data-003`'s eventual home): trigger (keyboard shortcut alone fails
  `CLAUDE.md`'s touch-device rule — needs an on-screen control too), and what "scoped by
  transaction origin" looks like from the user's side (does a remote/MCP edit ever
  appear as something the local user could undo, and if not, how is that communicated,
  if at all).

## Documentation

n/a as a `docs/<page>.md` deliverable — this task's output is the Q&A record
(`docs/decisions/interaction-model-qa.md`'s new section) and the rewritten acceptance
scenarios, not end-user documentation. The end-user `docs/` pages for these controls get
written by the tasks that actually build them (`ui-032`, `ui-033`, `ui-034`), per each
of those files' own Documentation section, once the real control names this task
produces exist to document.

## Affected files

- `docs/decisions/interaction-model-qa.md` — new section(s), matching the existing
  per-control format.
- `TODO/ACCEPTANCE.md` — rewrite scenarios 10, 11, 12's Steps against the confirmed
  control names, following the exact precedent `ui-001`→scenarios-1-9 already set
  (this file's own header even names that precedent: "Steps rewritten against
  `docs/decisions/interaction-model-qa.md`'s confirmed control names... rather than
  §9's provisional wording").

## Proposed fix

Run Phase 1 of `.claude/commands/feature.md` for each of the four control groups above,
present the summarized answers back to the user per that phase's own "does this match
your intent?" confirmation step, then transcribe the confirmed answers into
`docs/decisions/interaction-model-qa.md` and rewrite the three scenarios. This is
fundamentally a facilitation task, not an implementation one — no code changes, matching
`ui-001`'s own shape (it shipped as a pure documentation/decision task with `kind:
feature`, `category` matching the decision's subject, no `src/` changes).

## Effort

M — four control groups' worth of Q&A, more than `ui-001`'s six single controls took in
raw count but each answer here has fewer open design branches than a boolean/gizmo
control did, since the underlying mechanisms (`supersedes`/`consumes`, the existing
popover pattern, the existing toolbar) are already established precedent to answer
against rather than invent.

## Testing

No code changes — this task produces decision-document prose and rewrites acceptance-
scenario steps. Re-read the rewritten scenarios 10-12 aloud (or have the user do so) to
confirm they're genuinely driveable as written, the same bar `ui-001`'s own scenarios
1-9 rewrite had to clear before any code landed against them.

**`TODO/ACCEPTANCE.md` scenarios**: this task directly rewrites 10, 11, 12 — not a
regression risk, the deliverable itself. **Closed-finding regression surface**: none —
no code changes.
