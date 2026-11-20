---
title: Give agents a delete tool, so a discarded attempt is removed rather than hidden in a scratch body
category: ai
kind: finding
priority: high
model: sonnet
milestone: none — Findings table, filed 2026-11-20 from an owner report (WebMCP session)
depends: []
status: done
---

> **Shipped 2026-11-20:** as proposed. `delete_bodies` is in `src/ai/tools/delete.js`; `followersOf` moved to `src/core/repeat.js` (the store delegates). A Repeat's last member removed by `part` deletes the Repeat body, as the Inspector does. Not driven with a real Claude in Chrome session (fake `document.modelContext` only); see OWNER.md.

## Problem

An Opus agent driving WarpCad through WebMCP (Claude in Chrome, origin `webmcp`) ended its turn with:

> Cleanup: WarpCad has no delete, so my discarded attempts are merged into an empty body named
> "scratch (empty, ignore)". You can delete it in the app.

The app has had delete since `ui-051`. **Delete**/**Backspace** and the Inspector's red **Delete** button
call `documentStore.deleteBodies` (`src/composables/useDeleteCommands.js:176-198`), which appends one
`body.delete` tombstone per body in one undo step (`src/core/document.js`, "Deleting a body: an
appended tombstone"). For a group's part it calls `removePart` instead. The agent was right about its
own tools, though. None of the 30-odd tools in `src/ai/tools/` wraps `deleteBodies` or `removePart`:
the tool reference table in `src/ai/tools/index.js:24-61` has `delete_variable` and nothing for a
body. The same gap exists on every transport (in-app chat `ai`, MCP file and live bridge `mcp`, and
`webmcp`), because all three list the one registry.

Why it matters:

- **The workaround damages the project.** The only way the agent found to clear the scene was to `operate` its
  discarded bodies into one boolean and rename it. That leaves extra boolean rows in History, a body
  the user didn't ask for, and cleanup the user has to do.
- **Agents iterate.** Try a shape, measure it, throw it away, try again: an agent that can't throw
  anything away either piles up bodies or invents workarounds like this one. `set_params`
  (`ai-046`) and `copy` (`ai-045`) closed earlier halves of this loop. Delete is the missing one.
- **No new power is granted.** An agent can already consume any body with `operate` or resize it with
  `set_params`. **Undo AI turn** takes its tombstones back like any other row it wrote
  (`removeRecords`), so the user stays in control.

## Affected files

- `src/ai/tools/delete.js` (new): the tool, beside `params.js` and `create.js`.
- `src/ai/tools/delete.spec.js` (new).
- `src/ai/tools/index.js`: register it, and add a row to the tool reference table.
- `src/ai/tools/limits.js`: how a delete counts against the per-turn record cap (one per tombstone,
  like any appended record).
- `src/core/document.js` `deleteBodies` / `removePart`: called, not changed. `src/stores/repeat.js`
  `followersOf` holds the Repeat-follower lookup; move it into `src/core/repeat.js` if the tool needs
  it, since `src/ai/tools/` can't import a store.
- `docs/mcp.md` (tool table), `docs/webmcp.md`, `docs/agent-prompting.md` (per-tool section).

## Proposed fix

One write tool, `delete_bodies`, on every transport:

```
{ ids: string[], part?: string, repeats?: 'delete' | 'leave-broken', rationale?: string }
```

- **Bodies.** `ids` (one or more bodies on screen) becomes one `deleteBodies` call, so one atomic
  change. Returns the usual `{ applied, scene }`, plus `deleted: [{ id, name }]`.
- **A part.** `part` with exactly one id becomes `removePart(id, part)`, matching the Inspector's
  **Remove part**. Removing a Repeat's last member deletes the Repeat body, as `useDeleteCommands`
  does.
- **Repeats that follow a deleted body.** The UI asks the user (`ui-069`), but a tool can't. Without
  `repeats`, refuse and change nothing, naming the followers:
  `{ error, followers: [{ id, name }] }`, with a sentence telling the agent to pass
  `repeats: 'delete'` or `'leave-broken'`. Those two values do what the dialog's two buttons do
  (`resolveDelete`).
- **Refusals** carry core's own words (already deleted, named twice, unknown id, a Repeat target)
  and change nothing, like every other write tool. An id that is a step rather than a body points at
  `describe_scene`.
- **The tool description** says what to use it for: "Delete bodies you no longer need, including
  your own discarded attempts. Don't merge them into a scratch body." Agents learn the surface from
  descriptions, and this report shows that without one, an agent invents a workaround.

Not in scope, so this stays small: a `{ delete }` step inside `apply_records`, suppressing a History
row, and an agent-side "undo my last call". If a re-drive shows an agent still needs one of these,
file it as its own finding.

## Effort

S–M. The core command and its refusals exist. The work is the tool, the Repeat-follower branch,
specs and three docs pages.

## Testing

- **Unit** (`src/ai/tools/delete.spec.js`): delete one body, then two in one call (one change, two
  tombstones); remove a part from a group; Undo AI turn brings every deleted body back with its
  position, params and colour; refusals for an unknown id, an already-deleted body, a duplicate, and
  a body Repeats follow when `repeats` is omitted (nothing written, followers listed); then
  `'delete'` and `'leave-broken'`. Check the tool is listed for `ai`, `mcp`, live `mcp` and
  `webmcp`, and that the `rationale` lands as the tombstone's intent.
- **E2E**: extend `e2e/webmcp.e2e.js` so an agent places two cubes, deletes one through
  `delete_bodies`, sees one body in the viewport and a **via webmcp** Delete row in History, and
  **Undo AI turn** brings it back. Run it on the rotating pair (`npm run test:e2e:headless`); it
  touches the viewport, so it must stay green on all three engines. `e2e/delete-body.e2e.js` must
  stay green unchanged.
- **Drive**: repeat the reported session. Ask a WebMCP agent in Chrome to build something
  that needs a discarded attempt. It should delete the attempt and leave no scratch body.
- **Acceptance scenarios re-driven**: 14 (delete a body, bring it back, reload), 25 (MCP agent edits
  the open project), 27 (in-browser agent adds ten cubes, WebMCP).
- **Closed findings re-run**: `ui-051`'s delete reproduction (covered by `e2e/delete-body.e2e.js`)
  and `ui-069`'s Repeat-follower question.

## Documentation

AI tool, no new control. Add `delete_bodies` to the tool table in `docs/mcp.md` with an example call
(`{ "ids": ["b3", "b4"] }`), and a section to `docs/agent-prompting.md` covering the `repeats` choice.
In `docs/webmcp.md`, state that an agent can delete what it made (or anything else) and that
**Undo AI turn** restores it. No new media.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
