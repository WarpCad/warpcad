# Browser agents (WebMCP)

Some AI agents run **inside your web browser**, for example as an extension. If your browser
supports **WebMCP**, WarpCad offers such an agent its tools directly: place a shape, run an
operation, measure, check printability. You need no API key, no Claude Code, no helper program
and no pairing code. It works in any copy of WarpCad, hosted or one you run yourself. The tools
are the same ones the in-app [Assistant](ai-partner.md) and [Claude Code](mcp.md) use.

WebMCP is **experimental**. Today only Chrome supports it, behind a flag, on desktop. In any
other browser nothing changes: WarpCad doesn't show the control and doesn't register anything.

## What you need

- **Chrome 146 or newer, with the WebMCP flag on.** Open `chrome://flags/#enable-webmcp-testing`,
  set it to **Enabled**, and relaunch Chrome.
- **An agent that runs in the browser and can call a page's tools.** For example, Google's
  **Model Context Tool Inspector** extension.
- WarpCad opened over `https://` or from `localhost`. The browser offers WebMCP only to secure
  pages.

## Try it: a cube with a sphere on top

1. Open WarpCad in that Chrome and choose **Assistant**. In the Assistant panel's header, the
   switch reads **Browser agents · on**. It is on by default.
2. In your agent (the Tool Inspector, for example), check that WarpCad's tools are listed:
   `create`, `operate`, `describe_scene` and the rest.
3. Ask the agent: *Add a 40 mm cube and put a 20 mm sphere on top of it.*
4. Both shapes appear in the viewport. Open **History**: there is one row for each, and each is
   marked **via webmcp**. They are ordinary shapes, so you can select one and move it with the
   gizmo.
5. Press **Undo AI turn** in the Assistant panel. Both shapes go in one step. Your own **Undo** is
   untouched: it never takes back the agent's rows, and **Undo AI turn** never takes back yours.

Sizes are in millimetres, Z is up, and angles are in degrees, as everywhere in WarpCad.

![WarpCad with the Assistant panel's "Browser agents · on" switch, a cube with a sphere on top in the viewport, and History rows "Cube 1 — placed" and "Sphere 1 — placed", each marked "via webmcp".](./screenshots/webmcp-chip.png)

## Turning it off

Tap **Browser agents · on** in the Assistant header. It changes to **Browser agents · off**, and
WarpCad withdraws every tool at once, so no agent in this browser can see or change your project.
WarpCad remembers the choice in this browser, not in the project file. Tap the switch again to
turn agents back on.

If the browser won't let WarpCad store the choice (in a private window, for example), the
Assistant panel says so, and the choice lasts until you close the tab.

## How it behaves

- **One Undo AI turn per burst of work.** Changes an agent makes less than a minute apart are one
  **Undo AI turn**. After a minute's pause, the next change starts a new one. If you've since
  built on one of the agent's shapes (moved it, for example), **Undo AI turn** says which step is
  in the way. Undo that first, then try again.
- **You stay in charge of the editing.** The agent's changes are made one at a time. If one
  arrives while you're dragging, or typing in a number field, it waits up to 10 seconds for you to
  finish. Then it's refused, and the agent gets *the user is editing; try again* as its answer.
  If the project changed while it waited, that change is refused too. A refused change leaves
  the project exactly as it was.
- **Only the tab you're looking at.** WarpCad offers its tools only while its tab is visible.
  Switch to another tab or minimise the window, and the tools are withdrawn until you come back.
- **While a change runs** the header shows **Browser agent working**.
- **The agent sees what you select.** `get_selection` tells it what you've picked, so *make this
  5 mm taller* works.
- **No pictures.** `capture_view`, which lets the in-app Assistant and Claude Code look at the
  viewport, isn't offered here. An agent asks `describe_scene` or `measure` instead.
- **Long answers come in pages.** Lists such as `describe_scene`, `get_timeline` and `list_ops` come
  back a page at a time, and each page says how to ask for the next (`offset`, and optionally
  `limit`).
- **With no API key**, the Assistant panel says *A browser agent can drive this project; a key is
  optional.* Its message box needs a key, so it's greyed out with that reason. Ask the agent
  instead. (When you run WarpCad yourself with `npm run dev`, the line names Claude Code too.)

## What an agent can see

While the switch is on, **any agent running in this browser** can read the project through
WarpCad's tools and change it. It sees whatever the tools return: shape names, sizes, the design
notes in History, and your variables. WarpCad doesn't know which agent is attached and can't see
what it does with that. If you don't want an agent to read a project, turn the switch off first.

- **Other websites see nothing.** The browser offers WarpCad's tools only to agents working on
  WarpCad's own pages.
- **Text in the project is treated as data.** Shape names and design notes come from whoever wrote
  the project. WarpCad marks the tools that return them as untrusted content, so the agent
  shouldn't take them as instructions.
- **Limits are enforced by WarpCad, not left to the agent:** at most 50 new steps in one call.
  Every step is checked by the same rebuild the app uses, and a step that won't build is refused
  by name.
- **No key or token is involved.** WarpCad supplies the tools, and the agent runs on whatever
  account you set it up with.

## When something goes wrong

- **There's no Browser agents switch.** This browser doesn't offer WebMCP. Check the flag in
  `chrome://flags/#enable-webmcp-testing`, relaunch, and make sure WarpCad is open over `https://`
  or from `localhost`.
- **The agent lists no WarpCad tools.** Check the switch says **on**, and that the WarpCad tab is
  the one in front.
- **"Another tab or page already offers …"** Another page has already registered a tool with the
  same name, for example a second WarpCad tab. Close the other tab, or switch to it and back.

## Not yet

- **Two WarpCad tabs at once.** WebMCP doesn't yet say which tab an agent reaches when two offer the
  same tools. WarpCad offers its tools only from the visible tab, but that hasn't been checked with
  a real agent yet. Use one WarpCad tab at a time.
- **Phones and tablets.** No phone browser offers WebMCP yet, so there the switch is simply absent.

## Other ways in

See [the three ways in](mcp.md#three-ways-in) for how this compares with Claude Code on a project
file and Claude Code's live mode. With your own API key, you can also type in the
[Assistant panel](ai-partner.md) itself.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
