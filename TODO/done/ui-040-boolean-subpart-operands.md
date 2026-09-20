---
title: A route for the boolean buttons to address a drilled-in sub-part
category: ui
kind: feature
priority: medium
model: opus
milestone: M5
depends: [core-024, ui-016, ui-032]
status: done
---

> **Retirement note — what actually shipped, and what the file got wrong.**
>
> **The design question this file called "the whole of it" answered itself the moment
> the code was read: neither option.** The file proposed relaxing `drillInto`'s
> exactly-one-body rule *or* adding a second depth slot, on the premise that "shell
> selected, plus the bolt drilled to `tap`" is not an expressible selection. **That
> premise was already stale when it was written.** `ui-035` shipped on exactly the
> opposite fact: a depth needs one selected body to be *set*, but `toggle` is
> deliberately the one selection path that does **not** prune it, so Shift-clicking the
> drilled body out of the selection and back in lands it second with its depth intact.
> So `src/stores/selection.js` is **untouched by this task**. Both alternatives cost
> something real for nothing: relaxing the rule would let a depth attach to a
> multi-selection the Inspector cannot display (its breadcrumb only ever describes a
> single-body selection), so the user would carry an *invisible* pick depth into every
> count-gated tool — the ambiguity this file asked to avoid, reached from the other
> side; a second slot would double the state to address an operand nothing can use.
> Either way `selection.count` is untouched by depth, which is what keeps every existing
> gate meaning exactly what it did.
>
> **`ui-035` and the booleans now share one code path, literally.** That file's
> `snapAlignOperands` computed became `selectedOperands`, and both `run()` and
> `commitSnapAlign()` read it. The two button groups still disagree about operand count,
> order and lineage bookkeeping, but "what does this selection resolve to, at what
> depth" is one question with one answer, and answering it twice is how they would
> drift. This file's suggestion to do the two tasks as one was right in substance; it
> arrived a task late, so it was honoured by reuse instead of by merge.
>
> **Three things the file did not scope, each added because this change made it real.**
> (1) `consumes` stays **bare ids** — it names records, not operands, exactly as
> `supersedes` does, so a sub-part subtract still retires the whole bolt. (2) **Group is
> the exception and says so on screen**: `group.assemble`'s registry entry is plain
> `native`, not `subPartOperands`, so `run()` sends it bare ids even when a depth is set
> and the operand line carries a note saying the depth applies to the three booleans
> only — a silently-ignored address is the "wrong geometry, no error" class this
> project has shipped twice. (3) A **kernel-error display** for these four buttons: a
> boolean commit could not be rejected before this task and now can, so `runError` and
> an `operation-error` element follow Fillet/Chamfer's established path rather than
> letting a throw vanish into the console mid-click.
>
> **The feedback line does not fit at phone width, and that is measured.** At 390x844
> the column between this toolbar's top and the navigation chrome's first button is
> 151px, and the badge plus the wrapped button row already spend ~147px of it. The first
> pass put the operand line above the buttons and pushed **Align underneath the chrome's
> Pan button**, where it could no longer be clicked at all — caught by `ui-035`'s own
> phone spec, a long way from anything this task wrote. So the line sits **below** the
> buttons, is hidden under 640px, and the same text rides on every button's
> `title`/long-press at every width — this toolbar's own established touch affordance,
> the one `ACCEPTANCE.md` scenario 4 already checks at phone. The e2e asserts button
> actionability with a trial click rather than rectangle arithmetic, because "receives
> pointer events" is the property that actually broke.
>
> **The third obstacle is still open, and `ui-032` did not close it** — checked, not
> assumed. The History panel's rows are a *row* selection, which `data-002` §13's
> confirmed rule says never triggers a body selection, and the `scene-bodies` list is an
> announcement, not a control. A 121-point click probe over a fully enclosed bolt
> selected nothing but the shell. Scenario 5 is therefore driven to a **full pass with a
> partial overlap** (the bolt pushed 7 mm into the cube's face by Align + Snap, its head
> still pickable) and **not** claimed for a fully enclosed operand; the remainder is
> filed as `TODO/ui-041`, deliberately not folded in here. `ui-016`'s occluded-sub-part
> raycast gap is *the same underlying limitation one layer down* and is named in that
> file rather than fixed here, for the same reason.
>
> **The docs example is written against a case where the address genuinely differs**,
> per this file's own warning. Measured from the UI on a 40 mm cube: a `hardware.bolt`
> drilled to `tap` removes **986.379 mm³** and the whole bolt removes **986.379 mm³ —
> identical**, while a Raspberry Pi drilled to `ethernet` removes **1 207.743 mm³**
> against the whole board's **5 661.317 mm³**. `docs/booleans.md` uses the Pi, with the
> jack's own **21.38 x 16.12 x 13.83 mm** read off the Inspector, and states the bolt
> case plainly as the thing not to expect a difference from.

## Goal

`core-024` settled the kernel half of `ACCEPTANCE.md` scenario 5 and closed both of the
blockers that lived in `src/core/kernel/`: `boolean.union`/`subtract`/`intersect` now
accept a `{ id, pieces }` operand and resolve it through `combine`, and a composite
keeps its named parts through a `transform.*`, so the bolt a user actually *places*
still has a `tap` to address. Both were driven and measured in the browser.

What it deliberately did **not** do is give the UI any way to say it. Scenario 5 is
therefore still not hand-driveable, and this is the task that would finish it.

"Done" looks like: select a case shell and a **drilled-in sub-part** of a placed bolt,
click **Subtract**, and get a hole the size of the bolt's clearance geometry — the
gesture scenario 5 describes, performed by hand, with no kernel work left in it.

## The two things actually in the way

Measured during `core-024`'s Step 6 drive, not inferred:

1. **`OperationsToolbar.vue`'s `run()` only ever emits whole-body operands.** It builds
   them from `document.currentIdOf(id)` for each `selection.ids` entry, so there is no
   path by which `{ id, pieces }` reaches a record however the user selected.
2. **The selection store cannot even hold the state.** `src/stores/selection.js`'s
   `drillInto` is a documented no-op unless **exactly one** body is selected, and
   `pruneSubPart` drops the depth whenever the selection changes. "Shell selected, plus
   the bolt drilled to `tap`" is not currently an expressible selection — which is a
   deliberate `ui-016` decision, not a bug, and this task is where it gets revisited.

`ui-035` sits on exactly the same two gaps for Snap/Align and should be scoped with
this one — the kernel already accepts sub-part operands for `group.snap`/`group.align`
(since `core-013`) and for the booleans (since `core-024`), so both tasks are now purely
UI and share one mechanism. **Doing them as one task is probably right**; they are filed
separately only because `ui-035` predates `core-024`.

## A third obstacle, which is not this task's to fix

`ui-030`'s drive found it and `core-024`'s re-drive confirmed it stands: with a bolt
standing *inside* a 40 mm shell the bolt is **completely enclosed and cannot be picked
by clicking at all** — a probe grid of clicks over it never selected it. So even with
both gaps above closed, scenario 5's step 3 ("select both the shell and the bolt") has
no hand-driveable route once the two genuinely overlap, until there is a scene list or
timeline to select from. That is `ui-032`, which is why it is in `depends` above.

## Interaction model

- **Precondition** — 2 objects selected, where **either may be a drilled-in sub-part**
  (`ui-016`'s pick depth). This requires relaxing `drillInto`'s exactly-one-body rule,
  or adding a second depth slot; decide which, and say so, rather than widening the
  existing ref by reflex.
- **Trigger** — the existing Union/Subtract/Intersect buttons, unchanged. No new
  control: what changes is what the operand resolves to.
- **Feedback** — the toolbar must **name the sub-part being addressed** before the user
  commits, for the same reason `ui-035` argues it: a sub-part subtract and a whole-body
  subtract can look identical until the geometry changes, and for `hardware.bolt` they
  produce *literally the same solid* (see the measured note below). Showing
  "Subtract Bolt 1 › tap from Cube 1" is the only way the user can tell which they got.
- **Selection count** — exactly as `ui-014` has it; sub-part depth does not change the
  count gate.
- **Small-screen behavior** — confirm by driving at 390px; the existing toolbar already
  wraps (`ui-015`), and a longer operand label is what is new.

## Documentation

- **Page** — `docs/booleans.md`, extending its existing worked example with a sub-part
  case rather than adding a page (the precedent `ui-036` set).
- **Example**: drag a Cube in, drag a Bolt in, click the bolt twice to drill to its
  clearance part, Shift-click the cube, click Subtract — and state plainly what the
  resulting hole is sized to.

## Measured, and worth knowing before writing that example

`hardware.bolt`'s `tap` is a **visible** part, and it **contains** both `head` and
`thread`. So `combine(bolt)` and `combine(bolt, 'tap')` are byte-identical — measured
at 3647.047 mm³ each in `core-024`'s drive. **Addressing `tap` on a bolt changes
nothing**, and scenario 5's own Expect ("sized to match the bolt's hidden tap-clearance
diameter, not the bolt's visible head/thread mesh diameter") describes a distinction
this recipe does not have.

The address that genuinely changes the result is `head,thread` — the bolt's *metal*,
2928.610 mm³ — which cuts a **smaller** hole than the whole bolt, not a larger one.
Write the example against a case where the two differ, or the doc will claim a
difference a reader cannot observe. The corpus's own most common idiom is
`combine('head,thread')` (16 occurrences; 82 `combine()` calls name a comma list at
all), and the case where sub-part addressing really
earns its keep is a many-part composite: `pi.combine('ethernet,usb1,usb2')`, cutting
three port clearances out of a case in one boolean.

## Affected files

- `src/components/viewport/OperationsToolbar.vue` — `run()`'s operand construction, and
  the operand-name feedback line.
- `src/stores/selection.js` — whatever the precondition decision above requires.
- `e2e/boolean-operations.e2e.js` — extended, or a new `*.e2e.js` against `/`.

## Effort

M-L, and **the design question is the whole of it** — the kernel work is done and the
wiring is small. The cost is deciding how a two-object selection carries a pick depth
without making every existing count-gated tool ambiguous.

## Testing

- `OperationsToolbar.spec.js` / `selection.spec.js`: a drilled-in operand commits a
  record whose `operands` entry is `{ id, pieces }`, and a whole-body selection still
  commits a bare id — the regression that matters, since every existing boolean goes
  through the same `run()`.
- A real app-level `*.e2e.js` against `/`, per `CLAUDE.md`'s reachability gate.
  Chromium across the three reference viewports at minimum; all three engines if the
  selection change touches pointer handling, which it likely does.
- **`TODO/ACCEPTANCE.md` scenario 5** — the scenario this exists to finish. Expect a
  first-ever full PASS only if `ui-032` has also landed (see the third obstacle above);
  if it has not, drive it as far as it goes and say so explicitly rather than claiming
  it. **Scenario 4** (boolean gating) — re-drive, since this changes `run()` and the
  selection gate every boolean shares. **Scenario 6** (group vs. sub-part selection) —
  re-drive if `drillInto`'s rule changes, since that is the rule scenario 6 turns on.
- **Closed-finding regression surface**: `core-020`'s repro through a boolean that
  resolves a sub-part operand — `core-024` added that check at the kernel level; this
  task is the first to reach it from the UI.
