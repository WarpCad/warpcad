---
title: Acceptance scenario 12, step 12 needs a second rim operation on one solid, which the kernel refuses by design
category: testing
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan (filed 2026-11-08 from a scripted drive of scenario 12 during ui-104's Step 6)
depends: []
status: done

**What shipped (2026-11-08):** step 12 of `TODO/ACCEPTANCE.md` scenario 12 now breaks a later step instead of stacking a second rim operation. It Subtracts the sphere from the cube, then widens the Chamfer to 18 mm (applies, the Subtract shrinks) and to 25 mm (refused by name on the Chamfer row, the document unchanged after Cancel and Back to latest). Scenario 12 was re-driven end to end, steps 1–12 PASS, at laptop 1440x900 Chromium. Observed: the refusal names the Chamfer step, not the Subtract, because the kernel does not fail a boolean on geometry.
---

## Problem

`TODO/ACCEPTANCE.md` scenario 12 ("Edit a step in the middle of the history and confirm it replays")
ends with a "break it on purpose" step 12: select the cube, **Fillet** its Top (+Z) rim at radius 4,
then in History edit the **Chamfer** row to 18 so the fillet no longer fits.

Steps 1–11 pass in a scripted drive (2026-11-08). Step 12 cannot be set up as written, because the
kernel refuses a second rim operation on the same solid in either order:

- Chamfer Top 5 mm, then Fillet Top 4 mm: refused, `modify.filletRim … the solid is not prismatic over the rim band`.
- Chamfer Top 5 mm, then Fillet X+ 4 mm: refused, same message.
- Fillet Top 4 mm, then Chamfer Top 5 mm: refused, `modify.chamferRim … not prismatic over the rim band`.

This is intended. `docs/decisions/geometry-kernel.md` (the core-003 addendum) explains that a rim
operation sweeps one cross-section, so it is only valid where the solid is prismatic through the rim
band, and that `fillet.js` now throws rather than return wrong geometry. The scenario assumed a
second rim operation that the kernel is designed to refuse.

So the bug is in the scenario, not the app. The refusal itself is visible, names the cause, and commits
nothing, which is the behavior scenario 12's own "break it" intent wants to see.

## Affected files

- `TODO/ACCEPTANCE.md` — scenario 12, step 12 (and its **Expect** bullets for step 12).

## Proposed fix

Decide how scenario 12 should break a later step, then rewrite step 12. Options to weigh:

1. Break the chamfer's *own* step with a later op that does not sweep the same rim: for example a
   Subtract or Union that the widened chamfer makes invalid, instead of a second rim operation.
2. Keep the rim break, but drive it on a second body that has no chamfer, so the two rim operations
   never share a solid.
3. Drop the rim-on-rim break and assert only the "edit a middle step and confirm it replays" part.

Whichever is chosen, re-drive scenario 12 end to end after the rewrite and update its **Last run** line.

## Effort

S (a text rewrite of one scenario step, plus one re-drive).

## Testing

- Re-drive scenario 12 (all steps) against the rewritten step 12 at laptop 1440×900 Chromium.
- Confirm the rewritten step can actually fail the way its **Expect** says, on the current kernel.

## Interaction model

n/a — a scenario text change, not a UI control.

## Documentation

n/a — no end-user page changes.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
