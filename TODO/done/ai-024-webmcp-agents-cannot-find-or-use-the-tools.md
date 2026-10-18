---
title: Make the WebMCP tools discoverable and usable by a real browser agent (Claude in Chrome), and stop the app telling it the wrong things
category: ai
kind: finding
priority: high
model: opus
depends: []
status: done
---


> **What shipped:** fixes 3, 4, 5, 6 and 7. Step 0 showed WarpCad registers all 20 tools and the tab
> was visible, so Claude in Chrome's failure is an agent limitation (it probes only
> `navigator.modelContext`); **fix 2 (relax the visibility gate) was deliberately not done**; instead
> `startWebMcp` now aliases `navigator.modelContext` to `document.modelContext` when the browser has
> none (Decision 13 addendum), because setting that alias by hand made Claude in Chrome find the tools
> and complete the ten-cubes task. Not run: the background-tab case and a real agent re-prompted to use
> `document.modelContext`; ACCEPTANCE 27 stays "not yet run against a real agent".

## Findings (Step 0, 2026-10-17, Chrome with the flag, live app on the old build)

- Foreground, tab `visible`: `document.modelContext` is a `ModelContext` (methods `registerTool`,
  `getTools`, `executeTool`, `ontoolchange`); `navigator.modelContext` is `undefined`; the chip read
  "Browser agents · on"; `await document.modelContext.getTools()` listed **20** tools. Registration works.
- Claude in Chrome, asked for ten cubes in the foreground, ran a page script that checked only
  `navigator.modelContext`, found nothing and stopped. **Agent limitation (branch 1): fix 2 is not
  needed**; the visibility gate was not the cause.
- With `navigator.modelContext` aliased by hand, the agent found it; its first `getTools()` read looked empty only because it didn't `await` the promise (it corrected itself: 20 tools, tab `visible`). It then added ten cubes; one Undo AI turn removed them. Visibility gate cleared.
- Not run: the background-tab case.

## Problem

Reported 2026-10-17 by Claude running in Chrome's assistant pane (browser agents enabled) against
https://app.warpcad.com, asked to *add ten evenly spaced 10 mm cubes*. It added none. Its report
(summarised): `navigator.modelContext` and `window.webmcp` were `undefined`; no WebMCP tools were
registered; a tool search for WarpCad/WebMCP found nothing; the **Live MCP access** dialog said the
endpoint exists only under `npm run dev`; the Assistant box said it needs an API key although the
header said "Browser agents · on" and "a key is optional"; the build shows as `0.0.0+f1ea2cc`.

`ai-021` shipped the transport and its specs pass, but those specs use a **fake**
`document.modelContext` (`ROADMAP.md` Runner Log, `ai-021`: "real Chrome with the WebMCP flag …
covered by specs only"; `VERIFY.md` rows 1-4 under *ai-021* are still **Open**). So no real agent has
ever driven this path. The report is evidence of four separate problems, in decreasing order of
how much they matter:

1. **The agent could not reach the tools, and we don't know why.** The code registers on
   `document.modelContext` (`navigator.modelContext` is only a fallback —
   `src/ai/webmcp/toolShape.js:108-115`, Decision 13: the `navigator` alias was removed in
   Chrome 153). The agent probed `navigator` and `window.webmcp`, never `document.modelContext`, and
   the panel *did* show "Browser agents · on", which `useWebMcp.js` only offers when the API was
   found. So the likeliest causes are, in order:
   - **Visibility gating.** Tools are registered only while `document.visibilityState !== 'hidden'`
     (`src/composables/useWebMcp.js:49,88-94`). An agent pane that drives a tab it opened, or that
     works while its own side panel has focus, may see the tab as `hidden` and therefore get an empty
     tool list even though the switch says "on". (The agent's screenshots succeeded, which does
     not rule this out: screenshots work on hidden tabs.)
   - **The agent's tool surface isn't WebMCP.** Claude in Chrome may discover page tools through
     its own extension tool list (what the tool search looked at), not by JS evaluation. If the
     extension doesn't yet bridge `document.modelContext` tools into the model's tool list, nothing
     on our side can fix that, and the honest fallback is a documented, agent-friendly route.
   - **Registration refused.** `registerTool` can fail per tool (`failed[]` in the link state);
     nothing surfaces that to the user or the console, so a total failure looks like "on".
2. **Copy contradicts behaviour.** `src/stores/assistant.js:138-139` says "a key is optional" while
   `src/components/ai/Composer.vue:48` greys the box until a key exists, and the agent read both as
   a bug. The agent also typed into the box and nothing registered, because the box is disabled.
3. **The Live MCP access dialog is a dead end on the hosted app.** It tells a user (and an agent)
   to run `npm run dev`, shows no endpoint, and offers no control — correct for the dev-host
   bridge (Decision 11), but it never says "on the hosted app, use Browser agents (WebMCP)
   instead", so the agent concluded the feature is broken.
4. **Build string.** `0.0.0+f1ea2cc` is `package.json`'s `version` (`"0.0.0"`) plus the commit
   (`vite.config.js:55-58`). It is not a bug in the stamp, but it reads as a placeholder to a
   user or agent, and it is shown in the "new version available" banner.

## Affected files

- `src/ai/webmcp/toolShape.js` (`modelContextOf`) and `src/composables/useWebMcp.js` (visibility,
  `failed[]` surfacing, a console diagnostic)
- `src/ai/webmcp/register.js` (the link's visible/enabled gating)
- `src/components/ai/WebMcpChip.vue`, `src/components/ai/Composer.vue`, `src/stores/assistant.js`
  (copy and what the chip says when registration failed or the tab is hidden)
- The Live MCP access dialog component under `src/components/ai/` (`ConnectClaudeCode.vue`)
- `docs/webmcp.md`, `docs/mcp.md`, `docs/ai-partner.md` (the "which route do I use" guidance)
- `vite.config.js` / `package.json` (the version string), `.github/workflows/pages.yml`
- New: a diagnostic that an agent (or a person) can read without DevTools — see Proposed fix 2

## Proposed fix

**Step 0 — reproduce against the real thing before changing anything.** In Chrome 146+ with
`chrome://flags/#enable-webmcp-testing` on, open https://app.warpcad.com (and `npm run dev -- --host`
locally) and, in DevTools, record: `document.modelContext`, `navigator.modelContext`,
`document.visibilityState`, and what the **Model Context Tool Inspector** lists (the `VERIFY.md`
*ai-021* rows). Then ask Claude in Chrome the same ten-cubes request with the WarpCad tab in the
foreground, then again with it in the background. Write the three outcomes into this file's
*Findings* before choosing a fix. Everything below is conditional on that result.

1. **If the tools list in the Inspector but the agent doesn't see them:** this is the agent's
   limitation, not ours. Do not add workarounds in the app. Instead (a) say so plainly in
   `docs/webmcp.md` ("Known to work with: …; Claude in Chrome: …"), and (b) give the agent a route
   that works today — see 3.
2. **If the tools vanish because the tab is `hidden` while an agent is driving it:** relax the
   gate. Keep the tab-visibility rule only as the *multi-tab tiebreaker* (Decision 13 point 5),
   but also keep tools registered when the tab has an active agent session, or fall back to
   registering whenever there is no other visible WarpCad tab. Pick one and update Decision 13
   (a short addendum, not a rewrite) since this reverses a stated point.
3. **A diagnostic an agent can read.** Expose a tiny, side-effect-free status in the page, e.g.
   `<meta name="warpcad-webmcp" content="…">` or a `data-webmcp` attribute on the chip that says
   `api=document|navigator|none; enabled=on|off; visible=…; registered=N; failed=[…]`, and
   `console.info` the same once on load and on every change. The chip shows "Browser agents · on —
   N tools" (or "on, but the tab is hidden / registration failed: …"), so "on" can no longer
   mean "on, with nothing registered".
4. **Fix the copy so it is true.** When Browser agents is on and there is no key: the header says
   "A browser agent can drive this project. The box below needs an API key; to use your agent, ask
   it in its own panel." The disabled composer's placeholder says the same thing in the same
   words (one string, one source: `assistant.js`). Keep both under ~120 characters at 390 px.
5. **Make the Live MCP dialog route correctly on the hosted app.** On a non-dev host, replace the
   "run `npm run dev`" dead end with: what this dialog is for, that the hosted app uses **Browser
   agents** instead (link to the switch and to `docs/webmcp.md`), and that a hosted project can
   also be driven through the file route (`docs/mcp.md`). On the dev host, show the endpoint
   address and port in the dialog (today it's never displayed), so an agent can verify it.
6. **Version string.** Stamp the app version as something meaningful: either bump `package.json`
   to a real version at release, or show only the commit (`build f1ea2cc`) where the
   `0.0.0+` prefix currently appears. Prefer the latter now (no release process exists yet).
7. **Return the agent's task as a test.** Add a scripted agent-style scenario to
   `TODO/ACCEPTANCE.md` (see Testing).

Do not add tools; the registry is shared (`CLAUDE.md`, AI Partner section). If a missing tool is
what stopped a *later* step of the ten-cubes task (there is no loop/pattern tool, so ten `create`
calls or one `operate` pattern are needed), file that separately.

## Effort

M (the diagnosis in Step 0 decides whether it is S or L; the origin-trial / agent-limitation case
is documentation plus copy only).

## Testing

- **Unit (`.spec.js`):** `modelContextOf` prefers `document`, falls back to `navigator`, returns
  `null` for neither and for an object without `registerTool`; the link reports `registered`,
  `failed` and the visibility reason into the chip state; the single copy string is used by both
  the header and the composer.
- **Real-agent evidence, not a fake (the gap in `ai-021`):** run the Step 0 sequence in real Chrome
  and record the result in `TODO/VERIFY.md` (graduate the four open *ai-021* rows, don't add
  duplicates). A fake `document.modelContext` in a Playwright spec cannot prove an agent finds
  the tools.
- **e2e (`e2e/webmcp.e2e.js`, navigates to `/`):** extend the existing spec with a fake
  `document.modelContext` that also sets `visibilityState` to `hidden`, asserting the chip says
  why nothing is registered and the diagnostic attribute matches. Run at phone, tablet and laptop
  viewports (the chip and header copy reflow) with a snapshot at each. Chromium only for the fake;
  WebKit and Firefox only assert the chip is absent and nothing throws (they have no WebMCP).
- **ACCEPTANCE scenarios to re-drive:** 1 (place a box and a sphere), 10, 12, 17, 18, 24, 25
  (the `ai-021` list, plus the connected-assistant ones `ui-071` touched). Add one new scenario:
  *"Ask an in-browser agent to add ten evenly spaced 10 mm cubes; confirm ten distinct cubes are
  visible and one Undo AI turn removes them all."*
- **Closed findings re-run:** `ai-020` (panel says "no key" during a live bridge session) and
  `ai-021`'s repros; this task rewrites the same status wording.

## Interaction model

- **Precondition:** a browser that offers WebMCP; the Browser agents switch on.
- **Trigger:** the existing Browser agents switch in the Assistant header; an agent calling a
  registered tool. No new control, except the Live MCP dialog's new "use Browser agents" link.
- **Feedback:** the chip states how many tools are registered, or exactly why none are (tab hidden,
  registration refused, API absent). Agent-made shapes appear in the viewport and in History marked
  **via webmcp**.
- **Placement:** agent-created geometry is placed by the tool's own coordinates (no drag; there is no
  pointer); this is existing, intended `ai-021` behaviour.
- **Selection response:** n/a. **Selection count:** n/a.
- **Small-screen behavior:** the longer chip/header copy must wrap inside 390 px without pushing the
  Assistant button or the File menu; WebMCP itself is absent on phones today, so the phone case is
  the "switch absent" copy.

## Documentation

- **Page:** `docs/webmcp.md` (add "If your agent can't see the tools": check
  `document.modelContext`, **not** `navigator.modelContext`; keep the WarpCad tab in front; what
  the chip's reasons mean; which agents are known to work) and `docs/mcp.md` ("three ways in":
  state which one a hosted-app user with a browser agent should pick).
- **Example:** with Chrome 146+ and the flag on, open https://app.warpcad.com, keep the tab in
  front, open DevTools Console and run `document.modelContext` (an object means it's available),
  then ask your agent *"Add ten 10 mm cubes spaced 20 mm apart along X"* and watch History fill
  with ten rows marked **via webmcp**.
- **Media:** update the `e2e/docs/*.docs.js` shot behind `docs/screenshots/webmcp-chip.png` so it
  shows the new chip wording; no new movie.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
