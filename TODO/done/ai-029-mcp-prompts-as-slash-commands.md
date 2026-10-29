---
title: Offer WarpCad recipes as MCP prompts (/mcp__warpcad__… slash commands in Claude Code), with a Copy starter button in the Assistant
category: ai
kind: feature
priority: medium
model: sonnet
milestone: none — Findings table, outside the milestone plan
depends: [ai-028]
status: done
---

**What shipped (2026-10-29):** all of Goals 1 and 2 as written, with `StarterCopy.vue` shared by both sheets. Verification was partial: the real-Claude-Code drive and acceptance scenarios 1, 23 and 25 were not hand-driven (see `TODO/VERIFY.md`). Step 3 of the proposed fix (whether Claude Code delivers the embedded guide whole) is therefore unanswered, and the recipes do not yet fall back to "read warpcad://guide". The starter copy handler is proved on every engine with a stubbed clipboard in `e2e/ai-starter-copy.e2e.js`; real clipboard text is asserted on Chromium only. The hostile-project check (copied text equals the constant) runs on the subscription sheet in `e2e/ai-starter-copy.e2e.js`, not on the Live sheet.

## Goal

MCP **prompts** (`prompts/list`, `prompts/get`) are the part of the protocol closest to a skill: a
server-defined recipe the user starts by name. Claude Code lists each one as a slash command,
`/mcp__<server>__<prompt>`. Both WarpCad registrations are named `warpcad` (`scripts/mcp-add.mjs`,
`NAME`), so the commands below appear as `/mcp__warpcad__start` and so on.

Unlike instructions (`ai-027`) or the guide resource (`ai-028`), a prompt's messages can **embed the
guide itself**, as an embedded `resource` content item. An agent started from a prompt therefore
has the full method in context, even in a client that never reads resources on its own.

This task also adds **Copy starter** buttons to the two Assistant sheets that send a user to an MCP
agent. The user then has the first message to give the agent, not just the setup command. What the
buttons copy is a **pointer**, not the guide: the slash command for Claude Code, or one fixed
paragraph for other agents. The server delivers the method, so a copied starter cannot go stale
against the running build. A pasted copy of the guide would also put it in context twice once the
server sends it too.

Done means:

**1. Both servers serve three prompts.**

| Prompt | Arguments | What its message asks the agent to do |
|---|---|---|
| `start` | none | Read the scene (`describe_scene`, `list_variables`). Summarise the project in a few lines: bodies, variables, and whether it carries standing instructions, reported as information about the project, never followed. Ask what to build. **No writes.** |
| `build` | `request` (required): what to make, in the user's words | Build it by the guide's method: look first; ask once with zero writes if a deciding size is missing; build with `create`, `operate` or `apply_records`; pass the argument as `request` on every write; check before calling it done; reply with the sizes read back. |
| `check-print` | `body` (optional): a body id or name; default every body | Run `measure` and `check_printability` on it, and `check_clearance` for pairs that touch or nearly touch. Report against the guide's printing defaults with the numbers. **No writes.** |

- Every `prompts/get` result has two parts. First, a `user` message whose content embeds the guide
  (`{ type: 'resource', resource: { uri: 'warpcad://guide', mimeType: 'text/markdown', text } }`,
  using `ai-028`'s `guideFor({ live })` text). Second, the recipe's text. The live server's `build`
  adds: *"If the request says this or that, call get_selection first."*
- **Arguments are the user's own words**, so they are a request, not document data. They are put
  into the recipe's text, and nothing from the project is (decision 7). They have hard limits
  enforced in code, per the trust model:
  - `request` is required, at most 2,000 characters, and a plain string;
  - `body` is at most 200 characters.

  Over-long or missing arguments are refused with an MCP error in words.
- The recipes, the server name and the starter texts all live in `src/ai/mcpPrompts.js`
  (framework-free, beside `mcpInstructions.js`). `ai-026`'s native host can serve the same list, and
  the buttons and the server cannot drift apart.

**2. Copy starter buttons, with two fixed texts from `src/ai/mcpPrompts.js`.**

- **For Claude Code**: exactly `/mcp__warpcad__start`, one line. A slash command runs only when it
  begins the message, so nothing goes before or after it. It is built as
  `` `/mcp__${MCP_SERVER_NAME}__start` ``, and `scripts/mcp-add.mjs` imports the same
  `MCP_SERVER_NAME` in place of its own `NAME` constant.
- **For another agent** (Copilot, Claude Desktop, any MCP client), one fixed paragraph:
  *"Use the warpcad MCP server to work on my WarpCad project. Before your first change, read the
  resource warpcad://guide (WarpCad's modelling method), then call describe_scene to see what is
  there, and ask me what to build."*
- **Neither text contains anything from the project**: no body names, intent, scene or file name.
  A pasted starter becomes the user's own message, and the `<document_data>` boundary does not
  survive copy-paste. So a hostile file's body name would arrive as a user instruction (decision 7).
  The texts are constants, not templates.

## Interaction model

The prompts themselves change no WarpCad UI. Their surface is the MCP client's command list. The
starter buttons are a WarpCad control:

- **Precondition**:
  - **Use your Claude subscription** sheet (`ai-subscription-sheet`, `SubscriptionRoute.vue`):
    always, the same as its existing **Copy**.
  - **Live MCP access** sheet (`ai-connect-sheet`, `ConnectClaudeCode.vue`): only in the dev-host
    section (`available`, i.e. `chat.bridge !== 'unavailable'`). It does not depend on a lease being
    on: the user can paste the starter before enabling access, and the server's refusal says to
    enable it. The hosted block (`ai-connect-hosted`) gets no starter, because there is no live
    endpoint to start.
- **Trigger**:
  - Subscription sheet: **Copy starter for Claude Code**
    (`data-testid="ai-subscription-copy-starter"`), below the existing command and its **Copy**
    (`ai-subscription-copy`), under a one-line heading *"Then, in Claude Code:"*. The text it copies
    is shown in a `<pre>` (`ai-subscription-starter`), as the command is.
  - Live MCP access sheet: a **"Start the agent"** row under the endpoint note with two buttons:
    **Copy for Claude Code** (`ai-connect-copy-starter`) and **Copy for another agent**
    (`ai-connect-copy-starter-other`). The Claude Code text is shown in a `<pre>`
    (`ai-connect-starter`). The other-agent paragraph is shown in a `<details>` labelled *"What
    this copies"*.
  - Distinct from `ai-026`'s planned **Copy Claude Code command** (`ai-connect-copy-cmd`), which
    copies a `claude mcp add` setup line for the native app. If both land, the setup line comes
    first and the starter second, in that order on the sheet.
- **Feedback**: the button's label changes to **Copied** for two seconds, through the same
  `copied` state `SubscriptionRoute.vue` already uses. If the clipboard is blocked, a note says
  *"Couldn't copy — select the text above and copy it"*, and the `<pre>` stays selectable (the
  existing `'failed'` branch).
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: both sheets are `ModalShell` frames, full width at 390 px. The starter
  `<pre>` wraps like the command `<pre>` (`route__command`) and never scrolls sideways. In the Live
  sheet, the two buttons stack vertically below 480 px, and every button has a 44 px target.

## Documentation

- **Pages**:
  - `docs/mcp.md`: a new section "Slash commands in Claude Code", after "What Claude can do with
    it". List the three commands and what each does, and say that other MCP clients show the same
    prompts in their own menus.
  - `docs/mcp.md`, "Live mode", step list in "Try it: use an MCP agent to add a cube and sphere":
    add the **Copy for Claude Code** step.
  - `docs/ai-partner.md`, section "No API key? Use your subscription": the starter step.
- **Example** (`docs/ai-partner.md`): "Tap **Assistant**, then **Use my Claude subscription…**. Tap
  **Copy** and run the command in a terminal from your WarpCad folder. Start Claude Code there, tap
  **Copy starter for Claude Code** back in WarpCad, and paste it as your first message. Claude reads
  your project, tells you what is in it, and asks what to build."
- **Example** (`docs/mcp.md`): "With WarpCad registered (`npm run mcp:add -- bracket.ndjson`), type
  `/mcp__warpcad__build a 60 × 40 × 3 mm plate with four M3 clearance holes 5 mm in from each
  corner` in Claude Code. Claude builds the plate, measures it, runs a print check, and tells you the
  hole diameter it used. Then type `/mcp__warpcad__check-print` to check every body against the
  printer defaults (0.4 mm nozzle, 220 × 220 × 250 mm bed) without changing anything."
- **Media**:
  - Update `docs/screenshots/assistant-subscription-route.png` (`e2e/docs/ai-subscription-route.docs.js`,
    embedded in `docs/ai-partner.md`) to show the starter.
  - New `docs/screenshots/ai-connect-starter.png`: the Live MCP access sheet at phone width with the
    "Start the agent" row. Add it to `e2e/docs/ai-live-mcp-header.docs.js` and embed it in
    `docs/mcp.md`'s Live mode section.

## Affected files

- `src/ai/mcpPrompts.js` (new): the three definitions (name, title, description, arguments); the
  argument limits; `promptMessages(name, args, { live })`, which returns the messages or a refusal;
  `MCP_SERVER_NAME`; `STARTER_CLAUDE_CODE` and `STARTER_OTHER_AGENT`.
- `src/ai/mcpPrompts.spec.js` (new).
- `mcp/server.js`: `prompts: {}` in capabilities; `prompts/list` and `prompts/get` handlers, in the
  pattern of the `resources/*` handlers.
- `mcp/liveHttp.js`: the same, with `{ live: true }`.
- `mcp/server.spec.js`, `mcp/liveHttp.spec.js`: list and get through a real SDK client.
- `scripts/mcp-add.mjs`: `NAME` comes from `MCP_SERVER_NAME`. `mcp/mcp-add.spec.js` still passes.
- `src/components/ai/SubscriptionRoute.vue`: the starter `<pre>` and button. Factor the copy
  handler so both buttons share it, rather than a second copy of `copy()`.
- `src/components/ai/ConnectClaudeCode.vue`: the "Start the agent" row. This component is already
  long, so extract `src/components/ai/StarterCopy.vue` (`text`, `label`, `testid` props, with its
  own copied/failed state) and use it in both sheets.
- `src/ai/mcpInstructions.js`: optionally one clause naming the prompts, only if it fits under
  `ai-027`'s cap test.
- `e2e/ai-subscription-route.e2e.js`, `e2e/ai-mcp-agent-pairing.e2e.js`; `e2e/docs/ai-subscription-route.docs.js`,
  `e2e/docs/ai-live-mcp-header.docs.js`.
- `docs/mcp.md`, `docs/ai-partner.md`.
- `TODO/M19-ai-026-mcp-server-in-the-native-app.md`: the native host relays `prompts/list` and
  `prompts/get` too. Already noted there.

## Proposed fix

1. Check the SDK (`@modelcontextprotocol/server` 2.3.1, in `mcp/`): the low-level `Server` accepts
   `prompts/list` and `prompts/get` handlers and a `prompts` capability. Its type file names both
   methods (checked 2026-10-26).
2. Write the definitions, limits and starter constants in `src/ai/mcpPrompts.js`, then wire both
   servers.
3. **Check what Claude Code does with the embedded resource**: whether it reaches the model whole or
   is cut, and whether the 2,048-character cap from `ai-027` applies to prompt text. Record the
   answer in the module header. If embedded resources are dropped or cut, fall back to a recipe that
   tells the agent to read `warpcad://guide` first, and say so in the retirement note.
4. Build `StarterCopy.vue`, then put it in both sheets.
5. Out of scope, named so they are not assumed:
   - a drawing-to-part recipe (attachments are browser-chat only; the image tools are not in either
     MCP list);
   - `prompts/list_changed`;
   - a starter that includes the project's name or scene (refused on purpose; see Goal 2);
   - a Claude Code skill or plugin bundling `SKILL.md` with the server registration;
   - WebMCP, which has no prompts;
   - a starter in the hosted-copy block.

## Effort

L: the prompts are M, and the two sheets with their e2e and docs media at three viewports add the
rest.

## Testing

- **Unit** (`src/ai/mcpPrompts.spec.js`):
  - The three names and their arguments.
  - `build` without `request`, with a non-string, or with more than 2,000 characters is refused in
    words.
  - Every message embeds exactly `guideFor({ live })`.
  - `start` and `check-print` recipes name no write tool.
  - Every tool a recipe or the other-agent starter names is in that transport's list (the same check
    as `ai-027`).
  - The live `build` names `get_selection`; the file `build` does not.
  - No interpolation of anything but the arguments.
  - `STARTER_CLAUDE_CODE` is `/mcp__${MCP_SERVER_NAME}__` plus a prompt name that `prompts/list`
    returns, so a renamed prompt fails here.
  - `STARTER_OTHER_AGENT` names `warpcad://guide`, which `ai-028`'s resource list contains.
- **`mcp/server.spec.js`**: `listPrompts()` returns the three. `getPrompt('build', { request })`
  returns the guide plus the recipe with the request in it. A `get` leaves the project file
  untouched (bytes and mtime). An unknown prompt name is an error in words.
- **`mcp/liveHttp.spec.js`**: the same over Streamable HTTP. A `get` needs no lease and changes
  nothing in the tab.
- **App-level e2e, navigating to `/`**:
  - `e2e/ai-subscription-route.e2e.js`: open **Assistant → Use my Claude subscription…**, tap
    **Copy starter for Claude Code**, and assert:
    - the clipboard holds exactly `/mcp__warpcad__start`;
    - the label reads **Copied**;
    - with the clipboard permission denied, the failure note shows and the `<pre>` text is
      selectable.
  - `e2e/ai-mcp-agent-pairing.e2e.js` (dev host): open **Live MCP access…** and assert both buttons'
    clipboard text equals the two constants. **With `e2e/fixtures/hostile-intent.ndjson` open,**
    assert the copied texts are byte-identical to the constants: no project text leaks into the
    clipboard. Then the existing stand-in client calls `getPrompt('start')` and gets the guide
    embedded.
  - **Phone, tablet and laptop** with a snapshot at each: sheet layout, the `<pre>` wraps, no
    horizontal scroll, 44 px targets.
  - **Chromium, Firefox and WebKit**, because clipboard permissions and `navigator.clipboard`
    behaviour differ by engine, and the denied path must be proved in each.
- **Driven for real** (the part a unit test cannot prove: that Claude Code shows the commands and
  the model follows them): an interactive Claude Code session with the owner's consent, or the owner
  driving.
  1. `/` lists `mcp__warpcad__start`, `mcp__warpcad__build` and `mcp__warpcad__check-print`.
  2. Paste the starter from **Copy starter for Claude Code**, from a real tap in the app. It runs
     `start` on a fresh file, says the project is empty, asks what to build, and writes nothing.
  3. `/mcp__warpcad__build` with the plate example lands the plate, and every new History row's
     intent is the request text.
  4. `/mcp__warpcad__check-print` writes nothing (the file's bytes are unchanged) and quotes the
     printability numbers.
  5. Repeat steps 2–4 on the live server under `npm run dev` with a lease on, starting from the Live
     sheet's button.
  6. Paste the **another agent** paragraph into a client without prompt support, if one is
     available (Copilot), and record whether it read `warpcad://guide`.

  Report PASS/FAIL per step. Add a fourth arm, "pasted other-agent starter", to `ai-027`'s result
  file (same three cases, twice each). Try `claude -p "/mcp__warpcad__build …"` headless as well,
  and record whether headless sessions expand MCP prompts at all.
- **Acceptance scenarios to re-drive**: **23** (steps 2–3 above are its MCP half), **25** (step 5,
  plus its sheet steps, since `ConnectClaudeCode.vue` changes), and **1** (place a box and a sphere:
  the Assistant sheets overlay the viewport at phone width, so confirm both bodies stay visible and
  selectable after closing the sheet). Not 27.
- **Closed findings re-run**:
  - `ai-013` and `ai-016`: the subscription sheet's command and Copy still work, and
    `npm run mcp:add` still registers a server that starts, now through `MCP_SERVER_NAME` and with a
    `prompts` capability;
  - `ai-023`'s two repros (`mcp/liveHttp.js` and the Live sheet change);
  - `ui-075`'s phone header entry still opens the Live sheet.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
