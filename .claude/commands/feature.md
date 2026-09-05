# Feature Development (TDD Workflow)

You are guiding a full Test-Driven Development feature cycle for the CAD project.
Follow every phase in order. Do not skip ahead.

---

## PHASE 1 — Discovery: Ask first, code never

Before touching any file, ask ALL of these questions in a single message.
Wait for the user's answers before continuing.

**Ask:**
1. In one sentence, what should this feature do for the user?
2. Which layer does it touch? (geometry kernel `src/core/` / rendering `src/render/` / Vue UI / file I/O / docs only)
3. What are the success criteria? How will we know it's working?
4. What are the degenerate cases? (zero-length or coincident geometry, empty document, an operation that fails to converge, a file that won't parse)
5. Should this be user-configurable, or is the behavior fixed?
6. Does it replace or extend anything that already exists? If so, what?
7. Are there related features or components we should stay consistent with?
8. Does it need to be undoable? If so, what's the unit of undo — one drag, or every intermediate step?
9. Any performance concerns — does this run inside the frame budget, or can it be async?

**If this feature has any user-visible surface (a new tool, control, menu item, panel,
or interaction), also ask — this is not optional and does not get filled in with an
assumption (see `PREVIOUS-ATTEMPT.md` for why: a feature that skips this step is exactly
how a boolean operation once ended up as a flat dropdown item indistinguishable from
"add a box"):**

10. Walk me through the user flow end to end: what must already be true or already
    selected before this is available, what specific control (button, menu item,
    gesture, keyboard shortcut) triggers it, and what feedback on screen confirms it
    happened?
11. If this acts on **existing geometry** rather than creating new geometry (a boolean,
    a fillet, a pattern, anything with operands), how many operands does it need, and
    how does the UI make that requirement visible — e.g. the control stays disabled
    until exactly two solids are selected — rather than appearing as an equal option
    next to geometry-creation actions in the same list or menu?
12. Is there an existing control (toolbar, menu, panel) this belongs in, or does it need
    a new one? Don't let "register it as a type and let a generic list render it" stand
    in as the answer to this question.
13. If this creates new geometry, is it placed by dragging in the 3D view — a preview
    that follows the pointer and commits on release/drop — rather than appearing at a
    fixed transform? If it doesn't drag-to-place, say explicitly why not (see
    `CLAUDE.md`'s Interaction Model).
14. When the relevant object becomes selected, what does the inspector show (which
    controls, which dimensions), and does a transform gizmo (move/rotate handles)
    attach to it in the viewport? Numeric fields and the gizmo must drive the same
    transform.
15. If this is a selection-driven tool, exactly how many objects does it require
    selected before its control enables — one, or two-or-more — and where does the UI
    make that count visible (disabled state, tooltip, etc.)? See Q11 for the general
    operand-precondition rule; this is the count specifically.
16. Does this control need to work — and stay reachable — at phone width (~390px, e.g.
    iPhone)? If it collapses, moves behind a menu, or relocates at narrower widths, say
    where it goes (see `CLAUDE.md`'s Responsive Layout section).

**Also ask, regardless of whether this feature has a UI surface — the second attempt's
own failure was passing every one of Q10-16 above on paper and still shipping a broken
feature, because nothing re-checked it by actually using the app (see
`SECOND-ATTEMPT.md`):**

17. Does this belong in `TODO/ACCEPTANCE.md` as a new standing scenario, or does it
    extend a subsystem an existing scenario already covers? Only genuinely new
    capability classes get a new entry — this list is meant to stay small (5-10
    entries), not grow one-per-feature.

Summarize the answers back — **including a plain restatement of the user flow from
Q10-16** — and ask: "Does this match your intent? Anything to add or change?" — then
wait for final confirmation before moving on.

---

## PHASE 2 — Research: Read before writing

Read the relevant existing code before designing anything:
- Find related modules, components, tests, and docs
- Understand naming conventions and patterns already in use
- Check `CLAUDE.md` for project standards
- Note the coordinate spaces and units involved, and where the conversions happen
- Note the test framework: **Vitest** for unit/component; the E2E/component-workshop
  tooling per `CLAUDE.md`'s Stack table (carried-forward defaults, not yet
  re-confirmed at project start). Test files: `.spec.js` (unit), `.e2e.js` (E2E)

Summarize what you found in a short paragraph, then describe the approach you plan to take.
Ask: "Does this approach sound right before I write any tests?"

---

## PHASE 3 — RED: Write failing tests first

Write the tests **before** writing any implementation code.

Rules:
- Each test must describe one specific behavior from the success criteria
- Tests must be runnable right now and **must fail** (the feature doesn't exist yet)
- Use descriptive test names: `it('snaps the endpoint to the nearest vertex within the tolerance radius', ...)`
- Mock all external dependencies at their boundary (canvas/WebGL context, workers, file system access, `requestAnimationFrame`)
- Geometry goes in `src/core/` and gets plain-Node unit tests with explicit numeric
  tolerances — cover the degenerate cases named in Phase 1, not just the happy path
- Place test files next to the code they test, using project naming conventions
- If this feature has a user-visible surface (Phase 1, Q10-12), "done" requires a real
  `*.e2e.js` spec in `e2e/` navigating to `/` (or a route of the running app) that
  exercises the flow described in Q10 — not a `*.story.e2e.js` spec against a
  component-workshop iframe. A story spec proves the component works in isolation; it
  does not prove the feature is reachable and operable from the app, which is what
  "done" means here. This is a gate for **this task**, not a follow-up integration task
  — see `CLAUDE.md`'s reachability rule.
- If the answer to Q16 was anything other than "identical to desktop," the e2e spec
  must run at all three reference viewports (phone/tablet/laptop — `CLAUDE.md`'s
  Responsive Layout section) via Playwright viewport projects, with a snapshot at each.

After writing the tests, **run them** and show the failure output.
Confirm with the user: "Tests are red — failing as expected. Ready to implement?"

---

## PHASE 4 — GREEN: Implement the minimum to pass

Write the minimum code that makes all the tests pass.
Do not add features, abstractions, or polish beyond what the tests require.

### Rule: Geometry stays out of components

Coordinate math, constraint logic, and document mutation belong in `src/core/`, behind
a plain function or class a test can call without mounting anything. A component that
does its own geometry is a component that can only be tested through the DOM.

Document mutations go through the command/history layer so they're undoable — never
mutate document state directly from a component.

### Rule: Views must be thin composition layers

If the feature adds or modifies a `*View.vue`, enforce this constraint:

- Any visually distinct panel or section with **more than ~30 lines of template** must be extracted into a component under `src/components/<category>/`.
- The view should be a thin composition layer: imports, layout, and data wiring only.
- Each extracted component needs its own `.spec.js` and workshop story alongside it.

### Rule: it must actually be reachable

If Phase 1 Q10-12 described a user flow, the control that triggers it must exist in a
real view by the end of this phase — mounted where a user can reach it, not only
registered in a list/registry and left for a later task to wire up. If wiring it in
turns out to be genuinely large enough to be its own task, stop and tell the user
before marking this one done, rather than letting it quietly become someone else's job.

See the component categories in the `/refactor-ui` skill. If a panel is reusable across views (e.g. a unit-aware number field, a tool option bar, a status badge), extract it — even on the first use.

After writing the implementation, run the `test` skill (`/test`) and show the output.

All tests must pass before continuing. If any fail, fix them before moving on.

Confirm: "All tests are green. Moving on to acceptance-scenario check, cleanup, and docs."

---

## PHASE 5 — Acceptance-scenario check

**Do this before Documentation, not after — a documented feature that doesn't actually
work when driven by hand is the exact failure this phase exists to catch (see
`CLAUDE.md`'s Verification section and `SECOND-ATTEMPT.md`).**

If Phase 1 Q17 identified a `TODO/ACCEPTANCE.md` scenario this feature is new to or
extends, actually launch the app (the `run` skill) and drive it by hand — not by
re-running the Phase 3 e2e spec, which only proves its own author's script still
passes. Report PASS/FAIL. If this is a genuinely new capability class per Q17, write
its new entry into `TODO/ACCEPTANCE.md` now, using that file's own template.

---

## PHASE 6 — Documentation

Update documentation to reflect the new feature:

1. **README.md** — Add or update the section for this feature. Use a `### New:` prefix or `**New in vX.X:**` callout to highlight it. Include a brief description of what it does and how to use it. Add a screenshot placeholder comment `<!-- screenshot: describe what to capture -->` if the feature has visible UI.
2. **`docs/`** — Add or update the user-facing page, and its entry in the docs site's
   navigation config.
3. **`CLAUDE.md`** — Update if architecture, conventions, or commands changed.
4. **Inline comments** — Add comments only where logic is non-obvious. For geometry,
   that usually means naming the coordinate space and citing the formula or source,
   not restating the code.

Show a summary of what documentation was changed.

---

## PHASE 7 — Commit

Hand off to the `/commit` skill, which owns the message format, the fact-check gate,
the test gate, and the social-post drafts. Make sure the commit body says what the
new tests verify, what the Phase 5 acceptance-scenario check found, and what docs were
updated.

Only commit when the user confirms, per `/commit` Step 9.
