---
title: Write TODO/ROADMAP.md from the kernel spike and interaction-model Q&A
category: docs
kind: feature
priority: high
model: sonnet
milestone: M0
depends: [core-001, core-002, ui-001]
status: open
---

## Goal

Write `TODO/ROADMAP.md`, the ordered build plan, per `CLAUDE.md`'s Working Files
section: built from `core-001`/`core-002`'s real implementation experience (not just
the design doc's plan) and `ui-001`'s confirmed per-control interaction-model answers.
Sequence `Initial design.md` §6's full catalog (primitives → hardware → kit parts →
Raspberry Pi parts → operations) behind `render-001`'s viewport scaffold, matching §10's
rule that every UI-touching catalog row becomes its own reachability-gated task rather
than a deferred batch.

Done when: `TODO/ROADMAP.md` exists with milestones in dependency order, each
referencing real `TODO/<id>.md` files (either already written or named as
still-to-be-written with an id reserved), and the two previously-Open Stack rows are
reflected as resolved/deferred per `docs-001`/`docs-002`.

## Interaction model

n/a — planning artifact, not a user-visible surface.

## Documentation

n/a — `TODO/ROADMAP.md` is itself the artifact; no end-user `docs/` page.

## Affected files

- `TODO/ROADMAP.md` (new)

## Proposed fix

Structure milestones roughly as: M0 (this batch — kickoff decisions + spike + scaffold,
already in flight), M1 (viewport scaffold + first primitive creation, e2e-gated), M2
(hardware + kit-part catalog, snap-guide placement), M3 (booleans + selection-count
gating + group/sub-part selection), M4+ (Raspberry Pi accessory catalog, sketch mode,
per `Initial design.md` §11's still-open risks). Each catalog row from §6 becomes one
task file, per §10's explicit "not a deferred batch" instruction. Name `core-003`
(fillet/chamfer/bearing native spike) as a flagged-risk milestone item per §11, not a
committed task, until its own spike resolves.

## Effort

M (a few hours)

## Testing

n/a — planning document. No acceptance scenario is touched directly by writing the
roadmap, though every milestone it defines should name which `TODO/ACCEPTANCE.md`
scenarios (once `docs-004` writes them) it plausibly affects.
