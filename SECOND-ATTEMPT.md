# Second Try — Retrospective on the Second CAD Attempt

Status: this project is being shelved a second time. Written 2026-09-05, after 231
commits, 57 roadmap/finding tasks marked done in `TODO/ROADMAP.md`'s Completion Log,
and roughly six days of wall-clock work (kickoff 2026-08-30, stopped 2026-09-05). The
stop note is `TODO/another failure.md`; read it first — this document is the expansion
of it.

## What this attempt changed on purpose

This attempt was scoped explicitly against `PREVIOUS-ATTEMPT.md`'s findings, and it did
address them as written:

- `ui-001-app-shell-assembly` landed at task 17 of 54 (M2), not as a late cleanup task —
  `EditorView.vue` was a real, mounted root view from early in the build, not a
  `"coming in ui-00N"` placeholder.
- Every UI-touching task's Testing section required a real `*.e2e.js` spec against `/`,
  enforced by `e2e/naming.spec.js` (`testing-001`'s fix, ported forward as a day-one
  convention instead of a discovered-late one).
- A standing reachability-and-documentation audit ran on a cadence (every ~5-6 completed
  tasks), not just once — see `TODO/ROADMAP.md`'s "Reachability & Documentation Audit
  Cadence" section, which logged 51+ real passes with specific Playwright runs cited as
  evidence, not just "looks fine."
- The token-paced `/run-todos` loop replaced the fixed 2-hour wall-clock loop from
  attempt one.
- `TODO/VERIFY.md` was introduced specifically to close the "components exist but
  nobody confirmed they work" gap.
- Creation-vs-operation, selection-count gating, precondition/trigger/feedback specs
  per-control — all of `CLAUDE.md`'s Interaction Model rules were followed *on paper*:
  `SketchModeToolbar.vue`'s own header comment, for example, is a textbook-correct
  precondition/trigger/feedback writeup, citing the CLAUDE.md rule by name.

None of that was wasted, and none of it should be reverted reflexively in a third
attempt. But all of it optimized against **attempt one's specific failure signature**
(good components, nothing assembled) and missed a different, in some ways harder,
failure that grew directly out of the fix.

## The core failure: process produced a mountain of "verified" work that still doesn't work

Every symptom in `TODO/another failure.md` traces back to one root cause, and it is not
"the interaction model wasn't specified" — this time it was specified, in detail, per
control. The root cause is: **the verification loop that was supposed to catch broken
behavior scaled past the point a human could execute it, and the automated half of that
loop checks the wrong thing (does it exist / is it mounted / does a scripted Playwright
flow pass) rather than the thing that actually matters (does it work when an unscripted
human uses it).**

Concretely:

### 1. `TODO/VERIFY.md` grew to ~2,000 lines and nobody could keep up with it

It was added early, exactly per the stop note's own praise ("that helps"). But by the
end it held dozens of "Should work now — run `npm run dev`, open `/`, then: [ ] ... [ ]
..." entries, appended after essentially every task, several tasks per day. A person
checking this list part-time while also doing their own job cannot execute a growing
checklist that outpaces the rate at which they can read it, let alone click through it.
The stop note names the direct consequence: *"you may have to be an AI to make them
work... I just have to take the AI's word for it."* That is not a complaint about a
specific bug — it is a description of a verification system that stopped functioning as
verification the moment its queue length exceeded a human's available attention. A list
nobody executes is not evidence of correctness; it's the same as no list.

### 2. Automated e2e passing was necessary but not sufficient, and this attempt didn't notice the gap growing

The reachability audit (`.claude/prompts/project-audit.md` section 4) checks that a
component is *mounted* and that its own `*.e2e.js` spec passes. That is real
progress over attempt one, where nothing was mounted at all. But a scripted Playwright
flow drives the DOM in the exact sequence its author wrote, with the exact waits its
author inserted — it does not reproduce what happens when a person free-forms the UI:
drags at a slightly different angle, taps before an async operation settles, clicks a
button whose enabled state depends on a selection they didn't realize they'd lost.
Every bug in the stop note is a real, reproducible defect (confirmed below by reading
the actual source, not just taking the report at face value) sitting *underneath*
passing test suites and a "zero findings" audit trail. Passing tests proved the code
does what its own tests say; it never proved a first-time human user could drive it.

### 3. Fixed bugs came back, and nothing was watching for that

Two of the exact symptoms in the stop note were previously found, fixed, and marked
`✅ done` days earlier in this same attempt:

- **"Adding an item overwrites the previous one"** is the precise symptom of
  `core-013` ("Evaluation terminal computation hides every primitive but the last"),
  fixed 2026-09-02 by making `terminals` computation reference-graph-based instead of
  positional. That fix covered `box`/`sphere`/`cylinder` primitives placed via
  `CreationToolbar.vue`. M7 (`core-008..012`, `ui-007..014`, landed 2026-09-04) then
  added `componentInstance` as a *new* feature kind — the stop note's specific complaint
  is about dragging something in **from the library**, which is the `componentInstance`
  placement path added two days after `core-013` closed. Nothing re-ran `core-013`'s own
  regression scenario ("place two independent bodies, confirm both remain terminals")
  against the newer feature kind before it shipped.
- **"The scene is very dark"** is the precise symptom of `render-009` ("Scene has no
  light sources"), fixed 2026-09-02 by adding ambient + directional lights in
  `createViewport`. The user is reporting the identical symptom three days and dozens of
  tasks later.

Whether these are true regressions (something later touched `viewport.js` or the
lighting setup and the audit's Playwright-only reachability check didn't visually
diff it) or the same defect resurfacing on a code path the original fix didn't cover
(most likely for the overwrite bug, per the `componentInstance` timing above), the
process gap is the same either way: **there is no standing regression check that
re-verifies a closed finding still holds once new, related features land on top of
it.** `TODO/ROADMAP.md`'s Findings table marks these `✅` and treats them as closed
forever; nothing revisits a closed finding when a new feature extends the exact
subsystem it was filed against.

### 4. Sketch mode is the sharpest version of this problem

Attempt one's sketch system failed structurally: `SketchModeToolbar.vue` and friends
were never mounted anywhere `EditorView.vue` rendered, so "sketch is done" was
literally false — there was no code path to it. This attempt fixed that structural
class of bug: `SketchModeToolbar.vue` **is** mounted, inside `ViewportCanvas.vue`
(`v-if="camera"`), which **is** rendered from the real root view. Its own header
comment is a genuinely well-designed, precondition-gated, responsive-width-aware
control — a face-selection-gated "Sketch" button, three always-enabled datum-plane
buttons when no face resolves, and a "Finish Sketch" button while active, deliberately
never shown stacked together. Five separate roadmap tasks (`sketch-001` through
`sketch-005`) plus `ui-006` all closed with passing specs.

And the user still could not get sketch mode to open. That is the whole thesis of this
retrospective in one example: **this is now the second complete sketch system built
by an AI partner in this project's history that a human has never seen actually open,
despite two different, independently-designed, independently-tested implementations.**
The first time, the cause was findable in five minutes (grep for the component's name
in the root view — zero matches). This time the cause is *not* immediately findable
that way, which is worse: it means the bug lives in interaction-level nuance (a
condition that doesn't resolve the way a real click sequence produces it, a store
update that doesn't propagate to the sketch-drawing sub-component's own `v-if`, timing
against the camera/selection state) — exactly the class of bug a scripted e2e spec is
least likely to catch, because the spec's author wrote the click sequence to match
what the code expects, not what an exploring human actually does.

### 5. The token-pacing loop swung between two failure modes because it had no ground truth

The stop note: *"the loop doesn't work very well without access to the real 5h and 1w
status, it either does too little or too much and runs out."* `TODO/BUDGET.md`'s own
Config section documents this happening in real time: the window-fraction check started
at 10%, was raised to 50% on 2026-09-03, then raised again to 300% on 2026-09-04, each
time because the *estimated* spend from raw logged per-task tokens (190k-320k per task,
sometimes 800k-1.2M across a burst of back-to-back tasks) wildly overshot what the
user's actual live checkpoint reported (0%, 17%, 24%...). The loop was pacing against a
number it was computing itself, with no way to cross-check it against the real quota
until the user manually reported a checkpoint — so it spent the first several days
either stalling on phantom budget exhaustion (too little) or, once recalibrated upward
enough to stop doing that, had no remaining brake against a genuine runaway burst (too
much). Both failure modes are symptoms of the same missing piece: an automated loop was
built to pace against a resource it cannot actually read.

### 6. Browser/device testing was still reactive, just faster to react

Attempt one shipped two Safari/iPad-only bugs (`build-006`, `render-010`) found by
manual on-device testing after the fact; this attempt filed both as proper findings and
even added a `laptop-touch` Playwright project and `testing-003`/`testing-005` off the
back of them — real progress. But the stop note describes the same experience again:
*"I tried to keep up on my iphone and ipad as Claude worked, but nothing really worked,
and I assumed it was a browser issue. Instead it was just not working."* The
`testing-005` file for cross-browser Chromium/Firefox/WebKit coverage was still an open,
un-started TODO at the time work stopped (created same day as `another failure.md`,
never picked up by a `/run-todos` tick) — the roadmap's own priority ordering put it
after 50+ other tasks rather than early enough to have caught the specific things the
user was hitting on-device in real time.

## What this confirms, and what it changes

The confirmation: `PREVIOUS-ATTEMPT.md`'s recommendations were correctly diagnosed and
correctly implemented. Assembly-as-you-go, per-task e2e gates, a standing reachability
audit, and token-based pacing are all still the right calls and should carry forward.
**The lesson isn't "undo attempt two's process" — it's that the process stopped one
layer too early.** It verified that code exists, is wired up, and does what its own
author's test script asserts. It never verified that an unscripted human, moving at
human speed and making human mistakes, could actually accomplish a task end to end.

## Recommendations for the next attempt

**Replace the growing manual VERIFY.md checklist with a small, fixed set of named
end-to-end use cases the AI itself drives and reports against, every single tick —
not an ever-appending list a human is expected to click through.** The stop note names
the model directly: *"adding a cube and a sphere and subtracting one from the other."*
Write 5-10 of these (place two primitives and confirm both remain visible; drag a
library part and confirm it renders complete; open sketch mode and draw one entity;
union two solids; navigate the viewport with touch-only input) as literal step-by-step
acceptance scripts up front, before any feature work — not filed as they're discovered.
Every `/fix-todo` run (or a fixed-cadence subset of them) re-runs all of them itself,
by actually operating the running app the way a Playwright spec does but without a
pre-written happy-path script — closer to exploratory testing than assertion-checking —
and reports PASS/FAIL against every one, every time, regardless of which task just
landed. A regression against any of these should be the loudest possible signal, louder
than any individual task's own test suite, because these are the only checks standing
in for a human actually trying the app.

**Make a closed finding's subsystem a standing regression surface, not a one-time
close.** When a new task extends a subsystem a prior finding was filed against (a new
feature *kind* added to the same evaluation/terminal pipeline `core-013` fixed, a new
placement path added to the same viewport `render-009`/`render-010` touched), that
task's own Testing section must explicitly re-run the closed finding's original
reproduction steps against the new code, not just its own new spec. `core-013`'s own
file already narrates *why* this matters ("nothing today distinguishes... a
positional artifact from... an evaluator that actually reads this one's output" — the
exact kind of distinction a new feature kind can silently violate again) — the gap
was in the process, not the diagnosis.

**A human should drive the actual running app before any milestone is declared
done, not just before the whole project is declared done.** Not a full VERIFY.md
click-through — five minutes, free-form, no script, at the reference phone/tablet/
laptop viewports, at the end of each milestone (M2, M3, M4...) while there are still
few enough features that five minutes covers most of the surface. This is the only
check in the whole process with no scripted expectations, which is exactly why it's
the one attempt two never actually got.

**Pace the token loop against a real, queryable number, or don't automate the pacing
decision at all.** If the harness can expose actual rolling 5h/7d usage as a value the
loop can read (rather than estimate from self-reported per-task token logs), use that.
If it can't, don't build a self-estimating budget gate that swings between stalling and
overrunning while it calibrates against a number it can't see — a fixed, conservative
task-count-per-check-in cadence with an explicit user go/no-go is more honest than an
automated estimate that needs two manual recalibrations in three days to stop being
wrong in both directions.

**Move cross-browser/cross-device coverage earlier than task 50-something.** The stop
note's iPhone/iPad experience happened throughout the whole build, not just at the end
— `testing-005` (Chromium/Firefox/WebKit) sat unscheduled behind the rest of the
backlog the whole time. If the user is actively hand-testing on real devices while the
AI works (as happened here), a same-day or next-day cross-engine smoke pass on
whatever just landed is worth more than a dedicated coverage task scheduled for whenever
the roadmap gets to it.
