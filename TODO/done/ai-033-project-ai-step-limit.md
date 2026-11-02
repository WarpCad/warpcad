---
title: Raise the 200-step limit on one AI turn and let the user change it per project in the Assistant panel
category: ai
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-02 at the owner's request)
depends: []
status: done
---

## Goal

**In user terms:** an agent building a large part in WarpCad stopped at 200 operations and could not
go on. The person has no way to give it more room. When this is done, the default is higher, the
Assistant panel shows the limit for the open project, and the person can change it there. If an
agent hits the limit, the person raises it and the agent's next call goes through, with no reload
and no new conversation. The value is saved with the project.

**Mechanism:** the cap is `recordsPerTurn: 200` in `src/ai/tools/limits.js:54`, a frozen constant
(`docs/decisions/ai-partner.md`, decision 7). It becomes a stored project value with a higher
default and a hard ceiling in code. The owner's report did not include the agent's error text. The
filing assumes it was this cap's sentence, *"One turn may append at most 200 records"*, because
nothing else in the tool path stops at 200 (`SCENE_LIST_LIMIT` and `REQUEST_LINE_LIMIT` in
`src/ai/context.js` bound text, and neither refuses work).

Done means:

1. The default is **1,000** and the allowed range is **50 to 5,000** whole steps (owner decision
   2026-11-02). The measurement in Proposed fix step 1 may lower the ceiling, and nothing else
   reopens these numbers.
2. A project that never changed the value writes nothing new, so its file stays byte-identical.
3. No agent can change the value, on any transport.
4. A shared project cannot raise its own limit without the person's approval in this browser (owner
   decision 2026-11-02).
5. Raising the value takes effect on the **next call** on WebMCP and the live bridge, and on the
   **next turn** in the BYOK chat.

### What this is not

- **Not a modelling variable.** WarpCad's "project variables" (`docs/decisions/project-variables.md`,
  `define_variable`, `set_variable`) are values a part's dimensions bind to, and agents can write
  them. A limit stored there would appear among the part's dimensions, and an agent could raise its
  own limit with `set_variable`. This is project **metadata**, the same kind of value as
  `standingInstructions` and `buildVolume`: a document register, outside the fold and both undo
  stacks.
- **Not the other caps.** `recordsPerCall` (50), `stepsPerTurn` (40 tool calls), `consecutiveFailures`
  (3) and `turnMs` (10 minutes) stay constants. Their consequence has to be stated in the docs: the
  BYOK chat can never land more than 40 × 50 = **2,000** records in a turn, fewer once its reads are
  counted, whatever this setting says. If that proves too low, it is a separate task.

### How each transport meets the cap today

| Transport | Where the cap applies | What this task changes |
|---|---|---|
| BYOK chat (`src/ai/agent.js:574`) | One `createTurn` per turn, from `ctx.limits`, set once in `createAgentContext` (`src/composables/useAgent.js:170`) | Read the limit when each turn starts |
| Live bridge and WebMCP (`src/ai/bridge/tabEndpoint.js:203,274`) | A `budget` turn per **group**. A group is a burst of calls less than `GROUP_IDLE_MS` (60 s) apart. `limits` is read once when the endpoint is created | Read the limit per call, and let a raised limit reopen a stopped group (see below) |
| Closed-file MCP (`mcp/projectFile.js:300`) | One turn per `tools/call`, so `recordsPerCall` (50) always stops first and 200 is never reached | Nothing. Pin this with a spec so nobody wires it in by mistake |

**The trap in the middle row:** `createTurn`'s `stoppedBy` is sticky, and a group's budget stays
alive while calls keep arriving. An agent that retries after a refusal keeps refreshing the group,
so it stays refused until it pauses for a minute. Passing a higher number into `createTurn` would
leave the main flow (hit the limit, raise it, carry on) broken. The group has to keep a running
record count and compare it with the current limit on each call.

An agent can already get past this cap on those two transports by pausing for 60 seconds, which
starts a new group. That behaviour is existing and stays. The docs should describe the limit as
per burst of work, because that is what it is there.

## Interaction model

- **Precondition** — none. The control works with an empty project, with or without an API key, and
  in every Assistant mode. That includes `mcpOnly`, `browserAgentOnly` and a connected live bridge,
  because those are the agents most likely to reach the limit.
- **Trigger** — a button in the panel's `.chat__bar`, beside **Undo AI turn**, reading the current
  value: **Limit: 1,000 steps** (`ai-step-limit-open`). It opens a small sheet (`ai-step-limit-sheet`)
  with a whole-number field (`ai-step-limit-input`, `inputmode="numeric"`), **Save**
  (`ai-step-limit-save`) and **Cancel** (`ai-step-limit-cancel`).
  - **It must go in `.chat__bar`, not `.chat__meta`.** `.chat__meta` next to **Key and model…** looks
    like the obvious home, but it is `v-show="!linked"` (`ChatPanel.vue:235`), so the control would
    vanish while a live agent is connected. `.chat__bar` is the row that stays (`ui-071`). Do not put
    it in `KeySheet` either: that sheet holds per-browser settings, and this one is per project.
  - **Second trigger:** when the cap stops an agent, the notice carries a **Change limit…** button
    (`ai-step-limit-from-notice`) that opens the same sheet. On WebMCP and the live bridge there is
    no chat turn to attach a notice to, and the transcript is hidden while linked, so this notice
    must render outside `v-show="!linked"`, like `ai-webmcp-message`.
- **Feedback** — the bar button shows the new number at once, and the sheet closes. A value out of
  range or not whole keeps the sheet open with a sentence under the field naming the range
  (`ai-step-limit-error`), and nothing is saved. A limit stop shows the sentence *"This turn reached
  the project's limit of 1,000 steps."* with the button above. After the person raises it, the
  agent's next call lands and its History rows appear **via webmcp** or **via mcp**, in the same
  **Undo AI turn** group.
- **Approval** — when a loaded project states a value above what this browser has approved, the
  button shows the value actually in force, and the sheet adds a note (`ai-step-limit-untrusted`):
  *"This project asks for 3,000 steps. It's using 1,000 until you approve it."*, with **Use 3,000**
  (`ai-step-limit-approve`). See Proposed fix step 4.
- **Placement** — n/a, creates no geometry.
- **Selection response** — n/a.
- **Selection count** — n/a, the control ignores the selection.
- **While a turn runs** — stays enabled, because the main flow needs it during an agent's burst. The
  BYOK chat keeps the limit it started the turn with. WebMCP and the bridge use the new value on the
  next call.
- **Small-screen behavior** — at 390 px `.chat__bar` already holds **Undo AI turn**, the selection
  chip and the token readout. The button shortens to **Limit: 1,000**, keeps a 44 px tap target, and
  must not add a row to the connected sheet (`ui-071`: header and one row). The sheet is a bottom
  sheet over the viewport, like `KeySheet`, and the field stays above the on-screen keyboard
  (`--kb-inset`). In the `peek` height the bar is not rendered, so the limit can't be reached until
  the panel is taller, which is the same as every other control in the panel.

## Documentation

- **Page**: `docs/ai-partner.md`, a new section **"How much one turn may build"** after *Stopping and
  undoing*. Correct the limits bullets in `docs/webmcp.md:108` and `docs/mcp.md:377`, which mention
  only the 50-per-call cap: WebMCP and live mode gain the project limit, and the closed-file server
  says it doesn't apply there. Use the docs' word, **steps**, and never "records" or "operations".
  (The internal `stepsPerTurn` means tool calls, which is a different thing. The two need different
  words on the page.)
- **Example** (step by step, in the section):
  1. Open the **Assistant**. The bar under the chat reads **Limit: 1,000 steps**.
  2. Ask your agent for something large. If it reaches the limit it stops and tells you, and the
     panel shows *This turn reached the project's limit of 1,000 steps* with **Change limit…**.
  3. Tap **Change limit…**, type `2000`, tap **Save**. The bar reads **Limit: 2,000 steps**.
  4. Tell the agent to carry on. Its new steps join the same **Undo AI turn**.
  5. Save the project. The limit is saved in the file, so it's still 2,000 when you reopen it.
  Also state: the range; that a project someone sent you can't raise its own limit until you tap
  **Use**; that the chat Assistant stops at 40 tool calls whatever the limit says, which is at most
  2,000 steps; and that a higher limit means a turn can spend more of your API budget.
- **Media**: a shot in `e2e/docs/ai-partner.docs.js`, the sheet open over a part
  (`docs/screenshots/ai-step-limit.png`), embedded in the new section. Generated by
  `npm run docs:media`; `e2e/docs-media.spec.js` guards it.
- **Overlap**: `docs-029`'s section 6 (constraints) cites `limits.js`. Whichever lands second links
  to this section rather than repeating the number.

## Affected files

- `src/core/aiBudget.js` (new, + `.spec.js`): `AI_STEP_LIMIT = { default, min, max }` and a validator.
  In core because the document register needs it, the same shape as `src/core/buildVolume.js`.
- `src/ai/tools/limits.js`: `recordsPerTurn` reads `AI_STEP_LIMIT.default` (as `repeatTargets` reads
  `REPEAT_LIMITS`, so they are one number); the refusal sentence; the header comment.
- `src/core/document.js`: the register, `aiRecordsPerTurn()`, `setAiRecordsPerTurn(n, transaction)`.
- `src/core/project.js`, `src/core/merge/state.js`, `section.js`, `merge.js`, `src/core/mergeUndo.js`:
  persist and merge it. Check `src/stores/merge.js`, `persistence.js` and `share.js`, which carry
  the sibling registers.
- `src/ai/agent.js`, `src/composables/useAgent.js`: read the limit per turn.
- `src/ai/bridge/tabEndpoint.js`, `src/composables/useTabEndpoint.js`: read it per call; the group's
  running count replaces the frozen `budget`.
- `src/stores/projectSettings.js` or a new `src/stores/aiLimit.js`: the effective value and approval.
  `src/ai/stepLimitApproval.js` (new, + `.spec.js`): the approved-up-to number in `localStorage`.
- `src/components/ai/StepLimitSheet.vue` (new), `src/components/ai/ChatPanel.vue` (the button and the
  notice only; the file is already 578 lines, so nothing else goes in it).
- `mcp/projectFile.js`: no change; add a spec.
- `docs/ai-partner.md`, `docs/webmcp.md`, `docs/mcp.md`, `docs/decisions/ai-partner.md` (decision 7's
  table at line 522 and its injection paragraph: the cap is now a bounded per-project value, and the
  ceiling is what bounds an injection).
- `e2e/ai-step-limit.e2e.js` (new), `e2e/docs/ai-partner.docs.js`.
- **Must not change:** the tool registry gains no tool, and no existing tool's input takes this value.

## Proposed fix

1. **Measure first** (`.claude/prompts/perf-benchmark.md`). Every record is trial-folded as it lands
   (`src/core/document.js` `appendAll`), and the only figure on file is a full re-fold of 67 ms at 200
   records, stated to be linear (`document.js:241`). That extrapolates to about 335 ms at 1,000 and
   1.7 s at 5,000, but nobody has measured a turn that size, and the chat path also forks and merges.
   Extend `bench/fold-benchmark.mjs` to land turns of 200, 1,000 and 5,000 records as 50-record calls,
   and measure the `mergeFrom` and the **Undo AI turn** inverse at those sizes. Save the result in
   `bench/results/`. **If 5,000 leaves the app unresponsive, lower the ceiling to what was measured
   and record why.** That is the task's job, not a reason to widen it into performance work.
2. **The value** (red first). `AI_STEP_LIMIT` and its validator: whole numbers in range only. Degenerate
   cases: `0`, negative, `1.5`, `NaN`, `Infinity`, numeric strings, one past each end.
3. **The register.** Add `aiRecordsPerTurn` following `description` (`TODO/io-023`), **not**
   `buildVolume`. `src/core/merge/state.js:102-108` explains why: a released build refuses an unknown
   name in `merge.registers`, so a new register goes in its own `merge.aiRecordsPerTurn` key, value and
   stamp together, and stays out of `SECTION_REGISTER_NAMES`. Absent means the default, and a project
   at the default writes nothing. Last writer wins on merge. An invalid value in a file is ignored with
   a `LoadWarning`, and the load still succeeds. The setter throws unless the origin is `local`, so a
   transport bug cannot reach it.
4. **Approval** (owner decision 2026-11-02: a shared project may not raise its own limit). Decision 7
   says the caps bound what an injection can achieve, and a project file can come from anyone (a gist,
   a share link). So a file value must not silently raise the limit:
   - A value at or below the default always applies. Lowering is always safe.
   - A value the person **saves in this browser** applies, and sets `warpcad:ai-step-limit-approved` to
     that number if it's higher than the current one.
   - A value above the default that **arrived with a file** applies only up to the approved number,
     until the person taps **Use N**. Blocked storage degrades to this session only, never to an
     exception, as `src/ai/instructionTrust.js` does.
   - The effective value is therefore `min(stored, max(default, approved))`, and it is the only number
     the transports read.

   This is one number per browser, not `instructionTrust`'s per-exact-text list: text can hide anything,
   while a number only means "how much". The cost is that approving 3,000 once covers any later project
   asking for 3,000 or less, which is acceptable because the person already accepted that amount.
5. **The transports.** The agent reads the effective value when a turn starts. `createTabEndpoint` takes
   `limits` as a function read per call; the group keeps its record count and compares it with the
   current limit, so a raise reopens a stopped group and an `endpoint.reset()` still clears it. Add to
   the refusal sentence that this is the project's limit, set in the Assistant panel, and that only the
   person can change it, so the agent reports it rather than looping.
6. **The UI**: `StepLimitSheet.vue`, the bar button, the notice. Then the docs and the shot.
7. **Decision record**: amend decision 7 in the same commit, and say the ceiling and the approval rule
   are what replaced the constant.

## Effort

M to L. Each piece is small, but it spans the file format, the merge, the trust model, two transports
and a new control. The measurement in step 1 may change the numbers.

## Testing

- **Unit**
  - `src/core/aiBudget.spec.js`: the degenerate cases in step 2.
  - `src/core/project.spec.js`: a project at the default round-trips byte-identical against an existing
    fixture; a set value round-trips; an invalid value warns and falls back; an older-format file loads.
  - `src/core/merge/merge.spec.js` and `fuzz.spec.js`: last writer wins, convergence in both merge
    orders. `src/core/mergeUndo` leaves the value as the person set it after **Undo merge**, or
    restores it, whichever matches `description`.
  - `src/core/document` spec: the setter refuses `ai`, `mcp` and `webmcp` origins; it adds nothing to
    either undo stack; setting the same value is a no-op.
  - `src/ai/stepLimitApproval.spec.js`: all four rules in step 4, plus storage that throws.
  - `src/ai/agent.spec.js`: a turn uses the value at its start, and a change during the turn does not
    move it.
  - `src/ai/bridge/tabEndpoint` spec: **a group stopped at the limit lands the next call after a raise,
    in the same group**; a lowered limit below the running count refuses the next call; a new project
    resets the count; `recordsPerCall` still refuses a 51-step call at any limit.
  - `src/ai/tools/limits.spec.js`: the static check still passes; add that no tool's name or schema
    reaches the setter (the registry cannot write this value).
  - `mcp/server.spec.js`: the closed-file server never reports `recordsPerTurn`, and a project file
    naming a low value changes nothing there.
- **e2e**: `e2e/ai-step-limit.e2e.js`, navigating to `/`, with the fake `document.modelContext` from
  `e2e/webmcp.e2e.js` and no API key:
  1. Open the Assistant, read **Limit: 1,000**, set `60`, confirm the bar reads it.
  2. The agent lands a 50-step call, then a second 50-step call is refused by name and the notice
     appears. Nothing from the second call is in History.
  3. **Change limit…** to `100`, retry; it lands in the same group; one **Undo AI turn** takes all of it.
  4. Reload. The value is still `100`.
  5. Load a project file stating `3000` with this browser never having approved it: the bar shows the
     lower effective value, and the note and **Use 3,000** appear.
  Runs at **all three viewports with a snapshot at each** (the bar and the sheet differ at phone width),
  against **Chromium, Firefox and WebKit** (persistence and `localStorage` are involved). Plus one case
  with the live bridge connected at phone width: the button is still visible, and the connected sheet
  is still its header and one row (`ui-071`).
- **Benchmark**: step 1's numbers in `bench/results/`, before and after.
- **Acceptance scenarios to re-drive**: **27** (WebMCP, ten cubes, one Undo AI turn), plus *drive it
  differently*: hit a low limit, raise it mid-burst, carry on. **25** (live MCP) with the same raise
  while connected, at phone width too. **24** (edit while the Assistant works), to confirm the
  chat path's fork and merge. Hand-drive these with the `run` skill; a real browser agent if one is
  available, and say so if the stand-in was used.
- **Closed-finding regression**: `ui-071` (the connected sheet is its header and one row, re-run its
  repro with the new button present). `io-023` and `io-017` (a new register must not make a file an older
  build refuses: load a file with the new key in a build without it, or assert the shape in a spec).
  `ai-003` (standing-instruction trust is unchanged by a second approval store).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
