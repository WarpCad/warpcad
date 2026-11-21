---
title: Let an agent leave the project ready to publish as a gist (title, extra files, a readiness check)
category: io
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-11-21 at the owner's request)
depends: []
status: done
---

> **What shipped (2026-11-21).** As specified, with these differences. `stage_gist_files` takes `stl` and `note` only: the Gist API carries text, so there is no 3MF and an STL is published as ASCII STL (the export worker gained an `ascii` option). The preview picture was left out (open question 2). The Update that removes an unstaged extra reads the previous extras from the gist's README **Files** line, and `readGist` returns only those names, never README text. The new e2e case is `e2e/gist-share.e2e.js` case 15, and the docs picture is `share-gist-staged-by-agent.png` in `e2e/docs/share-gist.docs.js`. The pair run's one red test, `import-3mf.e2e.js` core-085's longtask budget, is timing under parallel load and passes alone (`TODO/VERIFY.md`).

## Goal

**In user terms:** when an agent says it is done (MCP, the in-app chat, or a browser agent over
WebMCP), the owner opens **Share** or **File ▾ → Save as gist…** and taps **Publish**, with nothing left
to type. The gist's title, its description, the README sections and any extra files the agent thought a
reader needs are already staged. A person still makes the publish tap. An agent never publishes.

The owner asked (2026-11-21): "Is there a way for the agent to set the project description when it's
done? If not, make a todo so that as soon as an agent is done creating something, the project is ready to
be saved as a gist with any additional files or info already to go."

**What already works (read from the code, 2026-11-21):**

- **Description: yes.** `set_description` (`src/ai/tools/description.js`, `TODO/io-023`) is offered on
  all three agent paths. Its transports are `['ai', 'mcp']`, and WebMCP gets every `mcp` tool except
  `capture_view` (`WEBMCP_WITHHELD`, `src/ai/tools/index.js`). The in-app agent's system prompt already
  tells it to call the tool (`src/ai/prompt.js:78`). The README prints it under the title.
- **Prompt and reply:** `record_prompt` / `record_response` (`ai-031`, `ai-032`). The README carries
  them only when the Share sheet's **Include prompts in the README** is ticked. That stays the person's
  choice (privacy, `docs/decisions/gist-storage.md`), and no agent tool may flip it.
- **Variables with ranges:** `define_variable` / `describe_variable` (`ui-157`).

**What is missing:**

1. **The gist's title.** `publish()` takes `choice.name ?? persistence.projectName`
   (`src/stores/gistPublish.js:247`). `projectName` is **store state**: the file name the project was
   last opened or saved under (`src/stores/persistence.js:34`). An agent cannot set it. A project an agent
   built in the in-app chat or over WebMCP that was never saved publishes as `DEFAULT_SHARE_NAME`
   (`src/core/shareLink.js`), so the owner has to type a name first.
2. **Extra files.** A gist holds exactly two files, `<slug>.warpcad` and `README.md`
   (`src/stores/fileMenu.spec.js:441`). An agent cannot stage anything else, such as a print-ready STL or
   3MF of the finished bodies, a preview picture, or a print-settings or assembly note.
3. **A "done" check.** An agent has no way to ask what the gist would contain right now (title,
   description, README sections, what is blank) before it hands back. So "ready to go" cannot be checked,
   only hoped for.
4. **The finishing steps are told to one path only.** `src/ai/prompt.js:78` tells the in-app agent to
   set the description. Step 1 checks whether the MCP guide (`warpcad://guide`, `src/ai/mcpPrompts.js`)
   and the browser-agent setup text (`BrowserAgentSetup.vue`, `ui-156`) say the same. The quick grep
   found no `set_description` in either.

Done means:

- An agent can set the project's **name** through the tool registry, on all three paths. The Share
  sheet's Name and **Save as gist…** start from it when the project has no file name.
- An agent can **stage export files** for the next publish. The files are generated from the timeline
  at publish time, never stored as meshes (`CLAUDE.md`, Architecture). The Share sheet lists them, each
  with a checkbox the person can untick.
- An agent can call one **read-only readiness tool** that returns the README the next publish would
  write, the file list, and what is blank or weak (no name, no description, a variable meant to be
  changed with no range, no reply recorded).
- All three agent paths' instructions end with the same finishing steps: name, description,
  `record_response`, readiness check.

## Interaction model

- **Precondition:** for the agent, a write-origin turn (`ai`, `mcp`, `webmcp`). For the person, a
  project with a staged name or staged files. With neither, the Share sheet and Save as gist… behave as
  they do today.
- **Trigger:** the agent calls the new tools, then the person uses the existing **Share → gist →
  Publish / Update gist** or **File ▾ → Save as gist… / Save to gist**. No new button.
- **Feedback:** the Share sheet's Name field is filled in. A new **Also include** list under **Include
  prompts in the README** shows each staged file with its name, approximate size and a checkbox (on by
  default). The success toast names the files published. Over MCP and WebMCP the tool results echo what
  is staged. In the in-app chat the row says "Ready to publish: <name>, 2 extra files".
- **Placement:** n/a (no geometry created).
- **Selection response:** n/a.
- **Selection count:** n/a.
- **Small-screen behavior:** the **Also include** list sits inside the Share sheet's gist group and
  reflows with it at phone width. Rows keep tap-size checkboxes, and nothing scrolls horizontally.

## Documentation

- **Page:** `docs/sharing.md` (a new "When an agent built it" subsection under the gist section, and the
  Also include list). Also `docs/mcp.md` and `docs/webmcp.md` (the tool rows) and
  `docs/design-intent.md#describe-your-project-for-people` (that the agent can set the name too).
- **Example:** "Ask the assistant: *make a 40 mm cable clip and get it ready to share*. When it
  finishes, tap **Share**. The Name already reads *Cable clip*, and under **Also include** there is
  `cable-clip.stl` (about 80 KB), ticked. Tap **Publish**. The toast says *Published Cable clip with 3
  files*. On GitHub, the gist shows `README.md`, `cable-clip.warpcad` and `cable-clip.stl`."
- **Media:** one `e2e/docs/sharing.docs.js` shot of the Share sheet with a staged name and file
  (`docs/screenshots/share-gist-staged-by-agent.png`), embedded in `docs/sharing.md`.

## Affected files

- `src/core/document.js` — a new project-level `name` register, merged like `description` (stamped,
  last writer wins, `:2123`, `:2368`, `:2437`), and a `gistExtras` register (the staged export list:
  kind, body ids, file name, never bytes).
- `src/core/projectFile.js` — round-trip both registers.
- `src/ai/tools/projectName.js` (new) — `set_project_name { name }`. It is cleaned and capped like
  `MAX_NAME_CHARS` (`src/core/gistReadme.js`), echoes `{ text, previous }`, and is data, never
  instructions.
- `src/ai/tools/gistExtras.js` (new) — `stage_gist_files { files: [{ kind: 'stl' | '3mf' | 'note',
  ids?, name?, text? }] }`, which replaces the staged list (`[]` clears it), and
  `get_publish_readiness {}`, which reads only.
- `src/ai/tools/index.js` — register both, add them to the tool table, `transports: ['ai', 'mcp']` so
  WebMCP gets them.
- `src/stores/gistPublish.js` — the name falls back to the document's name before `projectName`. Build
  each staged export at publish time through the existing export path (`src/core/exportJob.js`) and add
  it to `files`. A note becomes a `.md` file, escaped like the README.
- `src/core/gistReadme.js` — a **Files** line listing the extra files, so the reader knows what each one
  is.
- `src/components/layout/ShareGistGroup.vue`, `ShareSheet.vue`, `src/stores/fileMenu.js` — the
  prefilled Name and the **Also include** list.
- `src/ai/prompt.js`, `src/ai/mcpPrompts.js` (the `warpcad://guide` text), `BrowserAgentSetup.vue` —
  one shared "when you are done" paragraph.
- `mcp/projectFile.js` — the new write tools touch no row, like `set_description` (`:25`).

## Proposed fix

1. **Check the constraints first and write them into `docs/decisions/gist-storage.md`.**
   - Whether the Gist REST API accepts binary content. It takes file `content` as a string, so a
     binary 3MF or PNG probably cannot go through it. If not, binary STL and 3MF are out, ASCII STL is
     in, and a preview picture is either an SVG or left for later.
   - The size at which a file stops coming back inline: about 1 MB is truncated on read (the same
     decision record, lines 34–44).
   - Whether `src/ai/mcpPrompts.js` and `BrowserAgentSetup.vue` carry any finishing steps.
2. **Name register** in the document, with merge, undo-by-origin and round-trip, following
   `description` line for line. Then `set_project_name`. The precedence this task proposes, logged as
   an open question below: the Share sheet's typed Name, then the gist's own title on Update, then the
   document's name, then `projectName`, then `DEFAULT_SHARE_NAME`.
3. **Staged extras register** and `stage_gist_files`. Caps are enforced in code (`limits.js`): at most
   5 files, a note at most 20,000 characters, file names slugged by `gistFileName`, no name that collides
   with `README.md` or the project file. A body id that no longer exists drops out at publish, and the
   toast says so.
4. **Publish builds the exports.** The worker builds each staged STL or 3MF from the live timeline at
   tap time, off the main thread, with the Publish button showing progress. A file over the inline limit
   publishes anyway and says so in the toast. Update replaces the previous extras and removes ones no
   longer staged, the same way a renamed project file is removed (`gistPublish.js:436`).
5. **`get_publish_readiness`** returns `{ name, description, readme, files: [{ name, kind, approxBytes
   }], gaps: [...] }`, built with the same `briefOf` and `gistReadme()` the publish uses, so the preview
   cannot drift from the real thing. `gaps` holds plain sentences such as "no description" or
   "variable wall has no min/max".
6. **One finishing paragraph** shared by the three instruction texts. When the part is done: set the
   name, set the description, stage the files a person would print with, call `get_publish_readiness`
   and fix what it lists, then `record_response`. Never ask the user for a GitHub token, and never try
   to publish.
7. **Share sheet UI** for the prefilled name and the **Also include** list. Unticking a file affects that
   publish only, and nothing is written back to the document.

### Open questions (take the recommendation unless the owner says otherwise)

1. **Should the document's name also rename the file on the next Save?** Recommendation: no. It only
   suggests the name in Save's dialog, so an agent never moves a file on disk.
2. **Is a preview picture worth an SVG renderer?** Recommendation: no, not in this task. File a follow-up
   if step 1 shows the API will not take a PNG.
3. **Should the README embed staged notes inline instead of linking them?** Recommendation: link them.
   The README stays the generated brief, and the description is already where the agent writes prose.

## Effort

L (a document register with merge, two tools, the publish path and a Share sheet change). It splits
cleanly: steps 1–3 and 5–6 are the Opus half (data and tools), and steps 4 and 7 are the Sonnet half
(publish and UI).

## Testing

- **Unit:** `src/core/documentProjectName.spec.js` (register merge, a concurrent edit from two replicas,
  `ai` origin kept out of the local undo stack, round-trip). `src/ai/tools/projectName.spec.js` and
  `gistExtras.spec.js` (cleaning, caps, a collision with `README.md`, an empty list clears, a deleted
  body id). `src/stores/gistPublish.spec.js` (the name precedence above, extras in `files`, an Update
  removing an unstaged extra). `src/ai/tools/index.spec.js` (the new tools are on all three transports).
  `get_publish_readiness`'s `readme` equals what publish writes for the same state.
- **E2E (navigates to `/`):** extend `e2e/gist-share.e2e.js` and `e2e/gist-save-as.e2e.js` against the
  fake gist API. Stage a name and an STL through the WebMCP tools (the `e2e/webmcp.e2e.js` harness),
  open Share, assert the Name and the **Also include** row, publish, and assert the three files and the
  README's Files line. Untick the file and assert two files. A phone/tablet/laptop snapshot of the
  sheet.
- **Engines:** all three (Chromium, Firefox, WebKit). Publish runs the export in the worker and writes
  persistence.
- **Acceptance scenarios re-driven:** 29 (send a project to someone who has never seen WarpCad), 30
  (publish and open from a short link), 25 (an MCP agent edits the open project), 27 (WebMCP adds ten
  cubes).
- **Closed findings re-run:** `io-020` (the gist ignores the Share sheet name). The typed Name must still
  win over the document's name. `io-023`'s README order. `io-038`'s second-device update within a
  minute, now with an extra file in the gist.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
