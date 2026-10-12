# Third Time's the Charm

I just watched a browser tab do something I've been trying to get an AI-built app to do for a couple of weeks now: I dragged a box out of a parts library, dropped it into a 3D viewport, and it landed exactly where I let go of it. Small thing. Third attempt at building it.

I want to walk through why the first two didn't make it this far, because the failures were more interesting — and more useful — than the win.

**The idea, all three times:** a browser-based parametric CAD tool. Sketch in 2D, extrude to 3D, boolean solids together, install it as a PWA, and build it *with* an AI partner rather than just using one to autocomplete functions. Ambitious for a side project. I went in knowing that, and I went in using Claude Code to do the actual building, milestone by milestone, TODO by TODO.

## This process didn't start here

None of the tooling that made this a fair fight — the clarifying-questions workflow before any code gets written, the one-file-per-finding backlog, the read-only audits — was invented for a CAD app. It's the same skill set I've been running for a while on a completely different project: **[PiPiece](https://johnwebbcole.gitlab.io/pipiece-ui)**, a Raspberry Pi HQ Camera controller with a Vue.js touchscreen UI ([source on GitLab](https://gitlab.com/johnwebbcole/pipiece-ui)).

PiPiece is where I first hit the "confident, wrong, and I did that loop longer than I want to admit" problem — I'd ask the AI to fix two misaligned buttons, it would report "done, they're aligned now," and they weren't. Twice. The fix wasn't a smarter model. It was writing down, in plain English, exactly how I wanted to work, and turning that into six markdown files under `.claude/commands/`:

- **`/feature`** — asks a fixed set of clarifying questions before writing a line of code, waits for confirmation, then runs strict TDD.
- **`/fix-todo`** — picks a single named finding back up cold: confirms scope, verifies tests are green, implements test-first, retires the file, commits.
- **`/refactor-ui`** — when a Vue view gets bloated, proposes a component breakdown *before* touching anything, writes the tests first.
- **`/docs`**, **`/commit`**, **`/troubleshoot`** — keep the README honest, turn a diff into a real commit message plus a social draft, log root causes so they don't get rediscovered.
- **`/sync-skills`** — the meta-skill. When one workflow file changes, it audits every other AI engine's config (Claude's *and* GitHub Copilot's, since Copilot can swap models mid-project) and brings them back in sync, so switching models never means re-teaching the AI how I work.

Two conventions carried straight over into WarpCad's own `CLAUDE.md`, adapted rather than reinvented:

- **`TODO/<category>-<NNN>-<title>.md`** — one self-contained finding per file, with a `model: sonnet | opus` field. PiPiece's rule: default to the cheap model, bump to Opus only for nontrivial numerical math, large multi-module orchestration, or real architectural ambiguity. In WarpCad that's the same field deciding whether a boolean-kernel edge case gets Opus or a UI wiring task gets Sonnet.
- **`.claude/prompts/project-audit.md`** — a read-only audit, told to read the README/CLAUDE.md first specifically so it doesn't recommend reinventing something already built on purpose, whose only allowed output is new files under `TODO/`.

`/feature`'s question list is a good example of what "adapted, not copied" actually looks like. PiPiece asks "which part of the system does this touch — server / Vue UI / Python / Pi hardware?" WarpCad's copy of the same file asks "which layer — geometry kernel, rendering, Vue UI, file I/O?" and adds two questions PiPiece never needed: *what are the degenerate cases* (coincident points, empty profiles, non-manifold results) and *does this need to be undoable, and what's the unit of undo?* Same skeleton, questions specific to what each project actually breaks on.

None of that toolchain caused the two CAD failures below, and it doesn't get credit for today's fix either — both are specific to what a 3D viewport asks of a person, in a way a camera controller's UI never has to answer. But it's worth saying plainly: the discipline of writing down "ask these questions before coding" and "here's exactly how a finding gets picked back up cold" already existed, and was already paying off elsewhere, before I pointed it at parametric geometry.

The more important differences aren't between PiPiece and WarpCad, though. They're between WarpCad's own three attempts — and unlike a lesson filed away in a retrospective doc, each one shows up as a literal, permanent edit to the skill files themselves. Here's what actually changed in the instructions, each time, and why.

## Attempt one: everything worked, and nothing worked

The first build produced 38 commits of genuinely good code. A real test harness — unit tests, Storybook, Playwright — wired up early and used consistently. A 3D viewport with camera controls. A sound architecture: feature timeline, CSG kernel in a worker, mesh bridge to the renderer. Individually, each piece did what it was supposed to do and had the tests to prove it.

Then I opened the app.

The main editor view still had a placeholder that said, literally, `"coming in ui-002"` — twenty-four completed tasks later. Every sketch tool, every boolean operation, all real and tested in isolation, and none of it wired into a screen I could actually reach. The "add a boolean operation" menu was a flat dropdown built by reading a feature registry — union, subtract, box, sphere, all listed alphabetically-ish, side by side, because nothing had ever specified that a union needs two solids selected *first* and doesn't mean anything without them.

The root cause, in one sentence: I'd asked for a feature list and a tech stack, and never once described what a session at the keyboard should actually look like. So the AI filled that gap by inventing a UI, component by component, and nobody — human or AI — was responsible for assembling the components into an app.

**What changed in the skill file — `/feature`, Phase 1:**

> Before: the intake stopped at eight generic questions — *"Any performance, accessibility, or dark-mode concerns?"* — then moved straight to implementation.
>
> After: a new, explicitly mandatory block was inserted before Phase 1 can close out — with the failure named right in the instruction text: *"this is not optional and does not get filled in with an assumption — a feature that skips this step is exactly how a boolean operation once ended up as a flat dropdown item indistinguishable from 'add a box.'"* Then seven new questions, including: *"Walk me through the user flow end to end: what must already be true or selected before this is available, what specific control triggers it, and what feedback confirms it happened?"* and, for anything acting on existing geometry: *"how does the UI make that [operand] requirement visible — rather than appearing as an equal option next to geometry-creation actions in the same list or menu?"*

That block is the direct, load-bearing fix for the exact dropdown bug above — not a paraphrase of the lesson, the actual gate that now blocks a feature from being scoped without it.

[SCREENSHOT PLACEHOLDER: attempt-one editor view with the "coming in ui-002" placeholder]

## Attempt two: I fixed exactly what broke attempt one — and hit a different wall

For round two, every feature went through the new `/feature` questions above. Precondition, trigger, feedback, operand counts — all specified per control, not invented at implementation time. Creation and operation became structurally different menus. A real end-to-end test against the actual running app became a hard requirement for every task, not a cleanup pass at the end.

It worked, in the sense that attempt one's specific failure never recurred. 231 commits, 57 tasks, six days. The editor view was real and mounted from early on. A standing audit ran every few tasks and confirmed things were actually reachable. And still — sketch mode wouldn't open. Adding a part from the library made the previous object disappear. The scene was too dark to see anything in it.

Two of those were bugs I'd already found and fixed, days earlier, with passing tests to prove it. They came back on a new code path nobody thought to re-check. The lighting fix from three days earlier didn't cover a feature added on Tuesday.

The real lesson took me a while to see, because on paper attempt two did everything right: **a scripted test only proves the exact sequence its author wrote still works.** It doesn't catch a button that's enabled only if you didn't lose your selection a moment ago, or a drag at a slightly different angle, or a tap that lands half a second before something else finishes loading. I had a manual verification checklist too, meant to catch exactly that — it grew to two thousand lines across six days, and past a certain length a checklist nobody can execute stops being a checklist. It's just a very long file.

**What changed in the skill file — `/fix-todo`, a brand-new Step 6:**

> Before: "…implement the fix with TDD, verify again, retire the file, and commit."
>
> After: "…verify again — **including the acceptance-scenario and regression-surface checks below, which is what this project's second attempt skipped** — retire the file, and commit." The new step spells out why in its own opening line: *"This step is the one the second attempt's process didn't have, and its absence is the single biggest reason that attempt shipped a passing-tests app that didn't actually work. A green test suite proves the code does what its own author's assertions say. It does not prove a human driving the app by hand gets the same result."* Concretely, the step now requires: actually launch the app and drive each plausibly-affected scenario by hand, not by re-running the automated spec; report PASS/FAIL explicitly; and — this is the one that would have caught both comebacks above — if the task extends a subsystem a previously closed finding was filed against, **re-run that finding's original repro steps against the new code, not just the new feature's own test.**

The audit prompt got the same edit in spirit: it now states outright that a mounted, tested, documented control is *"necessary but not sufficient"* and points at this new step as the thing that catches what it can't.

Every layer of process I'd added going into attempt two was necessary. None of it was sufficient, until this step existed. The tests proved the code did what its own author expected. Nothing proved a person, moving at human speed and making human mistakes, could get through a task start to finish.

## What's different this time

That new Step 6 is what's actually running now: five to ten real use cases, written down *before* any feature work starts — "place a box and a sphere, confirm both stay visible," "drag a part from the library and confirm it renders complete," "union two solids and check the result" — driven by hand against the running app on every task, not just the one that introduced them. A regression against one of those is the loudest signal in the whole process, louder than any individual task's own green test suite.

The backlog runner changed too, in a smaller but funnier way. Attempt two tried to pace itself against an *estimate* of token budget it computed from its own logs — and that estimate was off from what I was actually seeing on my usage dashboard by anywhere from 1.2x to 40x, always in the same direction, for three straight days, no matter how many times I recalibrated the constant. So now it just runs a fixed, small batch of tasks and stops to ask me, plainly, whether to keep going. Boring. Also correct — and closer to how PiPiece already paced its own backlog (small, self-contained findings, sized to a model tier up front) than to the estimate-and-hope scheme attempt two tried to invent from scratch. Sometimes the fix isn't a new idea, it's remembering the old one.

[SCREENSHOT PLACEHOLDER: current ROADMAP.md / ACCEPTANCE.md structure, or the standing audit log]

## The part that actually worked

Which brings me back to today: I opened the library panel, picked up a primitive, dragged it into the viewport, and it landed where I dropped it — selection, gizmo, and inspector panel all lighting up in sync, the way I'd have designed it if I'd been the one clicking through Figma instead of writing prose descriptions of interaction models into a markdown file. First attempt where the UI has actually matched what was in my head, on the first unscripted try.

[SCREENSHOT PLACEHOLDER: dragging a primitive from the library panel into the 3D viewport]

If there's a lesson worth sharing beyond "CAD is hard" (it is), it's this: the two things that failed were not effort, code quality, or the AI's competence at the parts it was asked to build. Both failures were process gaps — first, no shared description of what a person actually does with the tool; second, no honest way to tell "the tests pass" apart from "a human can use this." Writing both of those down, in plain language, before touching code again, is what got me here. Not a smarter prompt. A better retrospective.

Three attempts, two shelved projects, and one small box that finally landed where I dropped it. On to the next TODO.

---

*Building WarpCad in the open with Claude Code as a build partner — happy to talk shop about AI-assisted engineering process, CAD kernels, or why verification is the hard part nobody budgets for.*

*The skill files this whole process is built on originated on [PiPiece](https://johnwebbcole.gitlab.io/pipiece-ui), my Raspberry Pi HQ Camera controller — [source on GitLab](https://gitlab.com/johnwebbcole/pipiece-ui). More of my writing at [jwc.dev](https://jwc.dev).*
