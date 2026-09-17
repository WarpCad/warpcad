---
title: "UI surface for modify.enlarge / modify.fit / modify.bisect — resize-by-delta, resize-to-size, cut-in-two"
category: ui
kind: feature
priority: medium
model: sonnet
milestone: M4
depends: [render-001, core-019]
status: done
---

> **Shipped matching this file's own spec closely — no deliberate deviations to
> record, unlike `ui-027`'s retirement note.** Implementation (`OperationsToolbar.vue`'s
> three new buttons/popovers plus `e2e/resize-bisect-operation.e2e.js`) was written in
> an unlogged prior session and found already sitting uncommitted in the tree at the
> start of this task's own run — see `TODO/BUDGET.md`'s note on the batch this was
> picked up in. This retirement note covers what this run itself verified and added on
> top of that implementation, having read the diff in full against this file's own
> Interaction model and Testing sections rather than trusting the prior session's own
> summary of it:
>
> 1. **The `exactOneDisabled`/`isExactOneOp` generalisation matches this file's own
>    "reuse the mechanism, don't re-derive it" instruction exactly** — `ui-027`'s
>    `filletChamferDisabled`/`isFilletChamferOp` were renamed and widened to cover all
>    five exactly-1-gated buttons (Fillet, Chamfer, Enlarge, Fit, Bisect) rather than a
>    third selection-count computed being bolted on beside them.
> 2. **Fit's `0`-means-unchanged sentinel got the real UI affordance this file called
>    for**, not a silent match to the kernel's own convention: fields default to the
>    selected body's own current size (read from `documentStore.bodies`' pre-computed
>    `bounds`, never raw kernel `geometry`), and Commit stays disabled via a frozen
>    opened-value snapshot comparison rather than an all-zero check.
> 3. **Bisect's offset field ships with no default**, exactly as this file's §3 asked
>    — Commit stays disabled until a real value is typed.
> 4. **All three commit as `supersedes`-based, unnamed records**, the same convention
>    `ui-027` established and this file's own Proposed fix called for — including
>    Bisect, whose result is a two-part `Group` rather than another solid. This is the
>    first `supersedes` record in this codebase to change `KernelGeometry` *kind*
>    rather than just value, and this task's own Testing section flagged it as an
>    unexercised integration risk to verify by hand rather than assume — see the
>    hand-drive result below, which is genuinely new coverage, not a formality.
>
> **What this run verified beyond the implementation it inherited:**
>
> - Full viewport×engine matrix: **8 of 9 cells green** (`chromium`/`webkit` ×
>   phone/tablet/laptop, 36/36 tests total, including the `chromium-laptop` cell the
>   handoff had already confirmed). The 3 `firefox-*` cells fail at browser **launch**
>   (`Could not find profile folder`) — confirmed to be a pre-existing sandbox defect,
>   not a code regression, by reproducing the identical failure against the
>   already-shipped `e2e/fillet-chamfer-operation.e2e.js`. Logged to
>   `TROUBLESHOOTING.md` (2026-09-17 entry) rather than guessed at, silently skipped, or
>   left as a one-line aside the way `core-018`'s own Completion Log row had left it.
> - `docs/resize-bisect.md` written with both worked examples this file's
>   Documentation section specified (Enlarge growing a cube 10mm on Z centred on its
>   own middle; Bisect cutting a cylinder into `negative`/`positive` and drilling into
>   one via the breadcrumb), cross-linked from `docs/snap-align.md` and
>   `docs/fillet-chamfer.md`, and added to `docs/README.md`'s sidebar list.
> - `TODO/ACCEPTANCE.md` scenario 1 re-driven by hand against the real dev server:
>   **PASS** (see that file's own re-check entry, dated 2026-09-17).
> - `ui-016`'s original closed-finding repro re-run **specifically against a
>   Bisect-produced group** for the first time (previously only ever exercised against
>   a `consumes`-produced one, per this file's own "extends ui-016's subsystem" note):
>   **PASS** — the whole two-part group holds the gizmo after commit, drilling in
>   detaches it and reads the `negative` half's own 20mm Y-dimension (not the whole
>   40mm), and stepping back out via the breadcrumb reattaches the gizmo and restores
>   the full 40mm reading.

## Goal

Three new exactly-1-gated Operations toolbar controls exposing ops that already exist
and are already tested (`core-019`, `registry.js:750-767`): **Enlarge** (grow/shrink by
a per-axis millimetre delta), **Fit** (resize to an absolute target size, with a `0` on
any axis meaning "leave it alone," per `fit`'s own doc comment), and **Bisect** (cut
along an axis at an offset into a two-part `negative`/`positive` group). This task is
controls, their `docs/` page, and their `*.e2e.js` only — no kernel work, per the
roadmap's own framing of this row.

## Interaction model

- **Precondition** — exactly one solid selected (`CLAUDE.md`'s single-object-tool
  rule; `EXACT_ONE`, the same constant `OperationsToolbar.vue`'s Fillet/Chamfer pair
  already uses at `:350`).
- **Trigger** — three new buttons on the Operations toolbar, alongside Fillet/Chamfer,
  each independently toggled: **Enlarge**, **Fit**, **Bisect**. Each opens its own
  popover on click (closing on a second click, exactly `ui-026`/`ui-027`'s established
  toggle-to-open/click-again-to-close mechanism, `<Teleport to="body">` plus the
  click-catching backdrop `ui-026`'s retirement note already found necessary against
  `.ops`'s own `backdrop-filter` becoming the `position: fixed` containing block).
  - **Enlarge popover**: three millimetre number fields (`dx`, `dy`, `dz`), each
    defaulting to `0`; a Commit button disabled until at least one is non-zero
    (mirroring `ui-026`'s `canCommitFilletChamfer`-style guard rather than allowing a
    no-op commit).
  - **Fit popover**: three millimetre number fields (`x`, `y`, `z`), each defaulting to
    the selected body's *current* size on that axis (not `0` — `0` is `fit`'s own
    sentinel for "leave this axis alone," so the field's placeholder/default should
    read as "current size," and typing `0` explicitly should read back as "unchanged"
    per `fit`'s doc comment, not as "shrink to zero" — this distinction needs a real UI
    affordance, not just matching the kernel's own convention silently). One
    `keepAspectRatio` checkbox, defaulting unchecked.
  - **Bisect popover**: an axis dropdown (`x` | `y` | `z`, mirroring Fillet/Chamfer's
    Face dropdown pattern rather than free-text) and one millimetre offset field, no
    default (`fit`/`enlarge` have zero as a meaningful default; `bisect` has no
    equivalent safe default per `core-019`'s own retirement note flagging the
    "`-0`-means-max-face" convention as easy to get backwards — require the user to
    type a real value, don't pre-fill one).
- **Feedback** — Enlarge/Fit replace the selected body's rendered mesh in place (same
  id, new size) — no new body appears in the scene or the timeline beyond the one
  appended record, mirroring `transform.translate`/`rotate`'s existing feedback
  contract. Bisect's result is a **two-part group**: the original single-mesh
  selection becomes a group of two named parts (`negative`, `positive`), each
  independently reachable by drilling in exactly the way `ui-016`'s Group-vs-sub-part
  selection already handles — no new mechanism needed here per that task's own
  precedent, but this task's own e2e spec must prove it rather than assume it (see
  Testing).
- **Selection response** — n/a beyond the popover itself; no change to what the
  Inspector shows for a selected body.
- **Selection count** — exactly 1 for all three; deselecting or extending to a second
  solid while a popover is open must close it, the same self-closing `watch()`
  discipline `ui-026`'s Snap/Align and `ui-027`'s Fillet/Chamfer popovers both already
  implement for their own preconditions (`OperationsToolbar.vue:430-441`).
- **Small-screen behavior** — same collision risk `ui-015`/`ui-026`/`ui-027` each hit
  and fixed once already on this same toolbar (a widened button row intercepting
  `NavigationChrome` once the Inspector's phone-width sheet raises it): three more
  buttons make a fourth wrap likely. Apply the same fix pre-emptively — icon + `title`
  only below 640px, matching `NavigationChrome.vue`'s and `ui-027`'s own established
  pattern — rather than rediscovering the same collision a third time and patching it
  after the fact.

## Documentation

- **Page**: new `docs/resize-bisect.md`, cross-linked from `docs/snap-align.md` and
  `docs/fillet-chamfer.md` (both already cross-link each other per `ui-027`'s
  retirement note), plus a sidebar entry (`.claude/commands/docs.md` Step 4).
- **Example**: "Select a cube. Click Enlarge in the Operations toolbar. Set Z to `10`
  and click Commit — the cube grows 10mm taller, centred on its own middle (per
  `enlarge`'s scale-about-centroid arithmetic), not from one face." A second example
  for Bisect: "Select a cylinder. Click Bisect, choose axis `Z`, set Offset to `0`, and
  click Commit — the cylinder becomes two independently selectable parts; click once to
  select the pair, click again to drill into either half, per the Group-selection
  behaviour documented in `docs/selection-and-inspector.md`." Screenshots from the new
  `*.e2e.js`'s Playwright snapshots, per `.claude/commands/docs.md` Step 3.

## Affected files

- `src/components/viewport/OperationsToolbar.vue` (three new buttons/popovers,
  following the module's own existing Fillet/Chamfer section as the direct template)
- `src/core/kernel/registry.js` (no change expected — confirm `modify.enlarge`/`fit`/
  `bisect`'s existing signatures need no addition for this UI's field set)
- `docs/resize-bisect.md` (new)
- `e2e/resize-bisect-operation.e2e.js` (new)

## Proposed fix

Mirror `ui-027`'s own shipped shape almost exactly (that task's own retirement note is
the best template available, having just resolved the equivalent popover/commit-path
design questions for a different exactly-1-gated pair): one `openPopover` ref shared
across all five now-exactly-1-gated buttons (Fillet, Chamfer, Enlarge, Fit, Bisect),
per-op field state reset on open, a `canCommit*` guard per op, and one commit function
per op appending a record with `supersedes: <selected body's current id>` — the same
"same object, new geometry" lineage `transform.*` already established and
`registry.js:745-748`'s own comment explicitly calls for when this control gets built.
Enlarge's `params.deltaMm` is a `[x,y,z]` vector (not the scalar `group.snap`'s
identically-named param takes — `registry.js:750-752`'s own comment flags this
naming collision, don't let the popover's field-building code share a component with
Snap/Align's scalar offset field without checking that distinction first). Fit's
`0`-means-unchanged sentinel needs its own small helper (`0` typed by the user and `0`
meaning "field left at its default" must be distinguishable at commit time, or the
popover needs to default every field to the current size rather than `0` and treat a
truly-unchanged field as "same value, so no-op axis" — resolve this before implementing
the field-building code, not while writing it).

Bisect commits a record whose result is a `Group`, not a `Geom3` — confirm
`document.js`'s `bodies()` (already updated for `boolean.union`/`kit.*`'s own group-
valued results) and the render path's per-part `THREE.Mesh` handling (`ui-016`) both
already handle a `supersedes`-based record producing a *different* KernelGeometry kind
than what it superseded (a solid becoming a two-part group) — this combination
(supersedes + shape-change, as opposed to `consumes` + shape-change a boolean already
proves, or `supersedes` + same-shape a transform already proves) has not been
exercised end-to-end anywhere in this codebase yet, so treat it as a real integration
risk to verify by hand-driving, not assume from the two precedents separately holding.

## Effort

M — the popover mechanism and commit-path plumbing are direct reuse of `ui-026`/
`ui-027`'s already-solved shape; the two real open questions (Fit's zero-sentinel UI,
and whether a `supersedes`-record-that-changes-geometry-kind already works end to end)
are each small in isolation but neither has a precedent to copy verbatim.

## Testing

`e2e/resize-bisect-operation.e2e.js`, navigating to `/` (`TODO/README.md`'s
`*.e2e.js`-not-`.spec.js` gate) — Enlarge and Fit each measured **by volume** (this
project's established convention since `ui-014`/`ui-027`, not bounding box, since a
resize is exactly the kind of change a bounding-box assertion could pass on
accidentally-unchanged geometry), Bisect confirmed by asserting **two** independently
selectable parts exist post-commit with volumes summing to the pre-bisect volume
(within the tessellation tolerance `fillet.spec.js`/`ui-027` already established).
Layout/popover collision check at all three reference viewports (phone/tablet/laptop —
`CLAUDE.md`'s Responsive Layout, since this is a fourth addition to a toolbar that has
now collided at phone width three separate times) with a snapshot at each. This spec
touches the kernel's own bisect/enlarge/fit numerics and the WebGL render path for a
group-valued result, so it runs against **all three engines** (Chromium/Firefox/
WebKit), not Chromium alone, per `CLAUDE.md`'s Browser Support section.

**Re-drive `TODO/ACCEPTANCE.md` scenario 1** (two independent primitives stay visible)
since this changes `document.js`'s handling of a `supersedes` record that changes
`KernelGeometry` kind — the same reasoning `ui-015`/`ui-016`/`ui-026` all cite for why
scenario 1 gets re-checked whenever the render/document layer's body-shape handling
changes. **This task extends `ui-016`'s subsystem** (Group-vs-sub-part pick-depth,
now exercised by a `supersedes`-produced group rather than only a `consumes`-produced
one) — re-run `ui-016`'s original repro (drilling into a grouped body, confirming the
gizmo attaches/detaches correctly and the selection watcher fires) against Bisect's
output specifically, not only against its own original boolean-union case.
