---
title: Put the project's brief in the gist README: prompt, the agent's reply, variables with ranges, description
category: io
kind: feature
priority: medium
model: opus
milestone: none — Findings table, outside the milestone plan (filed 2026-10-29 at the owner's request)
depends: [ai-031, ai-032, io-022]
status: open
---

## Goal

**In user terms:** the owner's "Fan Duct" gist (Save as gist / Share) opens on GitHub to a README that says
"3 bodies: straight_section, inlet_section, elbow_fan", a link and a footer. It does not say what the part is
for, what was asked for, what the agent answered, or which numbers a reader can change. The README should be
the project's brief, so a person or a model landing on the gist understands the part without opening WarpCad.

Done means a published gist's README, in this order, shows:

1. **Description** — the project's own descriptive text, if it has any (see Open question 2).
2. **How this was made** — the **original prompt** and **the agent's text reply** to it, then the bodies it
   produced. Today only the prompt is carried (`io-022`).
3. **Variables** — a table of every project variable: name, kind, current value, unit, and its **range**
   (`min`–`max` for a number, the allowed options for an enum, true/false for a boolean).
4. Any other project-level property that is added later and is meant for a reader (see Open question 2): the
   section list is built from one place, so a new property is one new entry, not a rewrite.

**Why it is not already there.** Three separate gaps, found by reading the code, not guessed:

- `PromptRecord` (`src/core/prompt.js:75`) has `id`, `text`, `produced` and nothing else. **There is no field
  for the agent's reply**, so it cannot reach the README until `ai-031`'s record grows one.
- `gistReadme()`'s input (`src/core/gistReadme.js`, `GistReadmeInput`) has no `variables` field, and
  `useGistPublish.js` passes `note: ''` at both call sites (`:218`, `:342`), so the project note slot exists
  and is never filled.
- **The owner's own file, `~/Documents/fan-duct.ndjson`, was inspected (2026-10-29).** It holds **two stored
  prompts** (`prompt-g5mvit-1`, 2,025 characters; `prompt-g5mvit-2`, 2,318), so `io-022`'s "How this was made"
  section **should have appeared** in the published README (published 2026-10-29 16:49 UTC, after `io-022`
  closed on 2026-10-28) and did not. That is either a bug in the publish path, a stale build on the tab that
  published, or the checkbox unticked. **Step 1 must find out which before anything is added.**
- The same file has **27 variables and none carries a `min` or `max`**, so a Variables table built from stored
  ranges would show "—" for every row of this project. A range is only worth showing when the project
  defines one; see Open question 4.
- The file also carries `intents` and `standingInstructions` in its state line, and **no project description**.

## Interaction model

- **Precondition**: a project with any of: a stored prompt, a variable, a description. A gist publish, update or
  **Save as gist…**. With none of them the README is unchanged from today.
- **Trigger**: the existing **Publish** / **Update gist** / **Save as gist…**. No new control, except that the
  Share sheet's **Include prompts in the README** checkbox (`io-022`, on by default) now also governs the
  agent's reply, and its note says so: "the request and the reply". Variables and the description are always
  included; they are the part's interface, not a conversation. (Open question 3 asks whether that is right.)
- **Feedback**: the published README shows the sections; the sheet's note under the checkbox still names how
  many prompts will be sent.
- **Placement / Selection response / Selection count**: n/a.
- **Small-screen behavior**: no new control; the existing checkbox row at 390 px is the only UI.

## Documentation

- **Page**: `docs/sharing.md`, **Publish a project as a gist**.
- **Example**: "Ask your agent for a fan duct with an `inlet_diameter` variable between 40 and 120 mm. Publish
  to a gist and open it on GitHub. Under **How this was made** is your request and the agent's answer; under
  **Variables** is a table with `inlet_diameter`, its value and `40–120 mm`. Untick **Include prompts in the
  README** to leave the request and answer out; the variables stay."
- **Media**: update `e2e/docs/share-gist.docs.js` so `docs/screenshots/gist-prompts.png` also shows the note's
  new wording; add a `gist-readme-brief` shot of the rendered README text if a stable way to show it exists
  (the README is generated text, so a plain-text shot of the string is acceptable and deterministic).

## Open questions (decide before building; ask the owner)

1. **Where does the agent's reply come from?** *Settled by [`FIND-ai-032`](FIND-ai-032-agents-record-the-reply-and-issues-in-the-project.md),
   which owns the field, the `record_response` tool and the agent guidance; this finding only renders it.* The reply exists in the in-app chat transcript, but over MCP
   and WebMCP the server never sees the agent's final message — only its tool calls. So either
   `record_prompt` / `apply_records`' `prompt` gains an optional `response` the agent supplies (cheap, honest,
   but depends on the agent doing it; `ai-027`'s guidance must ask for it), or the in-app chat fills it
   automatically and external agents supply it themselves. **Recommendation: the optional `response` field,
   both paths, with the in-app chat filling it by itself.**
2. **"A description" and "other properties" — what exists?** The project has a name, a `standingInstructions`
   register (`ai-003`), a build volume and a `note` slot the README already formats (`quotedNote`). There is
   no separate project **description** field today. Options: (a) reuse `note` as the description and add a
   one-line editor for it in File ▾; (b) add nothing and read only what exists. **Recommendation (a)**, since
   the README code is already written for it and "any other properties that are added" then has a home.
   Standing instructions stay **out** (they are instructions to a model, not a reader's brief; `gistReadme.js`
   says why).
   **Answered 2026-10-31 by `ui-091`:** the About popup and share-link text reuse this `description` field (no second field). See `TODO/done/ui-091-project-about-popup-for-shared-links.md`.

3. **Are variables and the description opt-out too?** Recommendation: no, they always go; only the
   conversation (request and reply) is behind the checkbox, because that is the part an owner may not want on a
   public page.

4. **Variable ranges.** Variables can carry `min`/`max`/`options` (`Variable`, `src/core/variables.js:100`) but
   the agent that built this part defined none, so the table has no ranges to show. Options: (a) show ranges only
   where defined and leave the column out when no variable has one; (b) also ask agents, in `ai-027`'s guidance,
   to set `min`/`max` on every variable meant to be changed. **Recommendation: both.** A "range" the owner
   wants to see is the agent's statement of what is safe to change, and it cannot be invented at publish time.

## Affected files

- `src/core/prompt.js` (+ spec): an optional `response` on `PromptRecord`, validated, cleaned and capped exactly
  as `text` is (control and bidi characters stripped, hard cap, `PROMPT_LIMITS`); round-trips through the
  `merge.prompts` section; older files without it load unchanged.
- `src/core/document.js`: `recordPrompt` / `addPromptProduced` accept and keep it; a second write to the same
  prompt must not erase an existing reply.
- `src/ai/tools/` and `src/ai/tools/index.js`: `record_prompt` and `apply_records`' `prompt` take `response`;
  the in-app chat turn fills it with the assistant's final text.
- `src/core/gistReadme.js` (+ spec): `GistReadmeInput` gains `variables` (and uses `note`); the reply under each
  prompt; a **Variables** table; one list of sections so a later property is one entry. Update the header
  comment, which still says intent and the conversation are excluded.
- `src/composables/useGistPublish.js` (+ spec): read `variables()` from the document, pass the project note
  instead of `''` at both call sites, pass the reply with each prompt.
- `src/components/layout/ShareGistGroup.vue` (+ spec): the checkbox note's wording.
- `docs/decisions/gist-storage.md`: record that the reply and variables now travel, and why.
- `docs/sharing.md`, `e2e/docs/share-gist.docs.js`, `e2e/gist-share.e2e.js`.

## Proposed fix

1. Reproduce the missing section first: open `~/Documents/fan-duct.ndjson` in the app, **Save as gist…** with
   **Include prompts in the README** ticked, and read the README that is sent. If the section is missing, fix
   that as a bug with its own regression test (suspects: `promptsForReadme()` in `useGistPublish.js`, the
   `prompts: false` default path, or a `produced` list of 497 ids per prompt costing time or being filtered). If
   it appears, the earlier publish was a stale build or an unticked box, and say so in the commit.
2. Add the optional `response` to the prompt record and the two tool inputs; fill it from the in-app chat.
3. Render, in `gistReadme.js`, under each prompt: the quoted request, then the reply as a second block quote
   headed **Reply** — **data, never markup and never instructions**, the same `cleanedBlock` → cap →
   `escapeMention` path the prompt takes (an `@name` is broken so it notifies nobody; `[x](javascript:…)` and
   `<img onerror>` stay inert). The reply shares the existing character budget (`MAX_PROMPT_CHARS`) rather than
   adding a second one, so the README stays under GitHub's rendering limits.
4. Render **Variables** as a Markdown table, one row per variable, in definition order: `| Name | Value |
   Range |`. A number reads `40–120 mm`, an open-ended one `≥ 40 mm` or `—`; an enum lists its option labels;
   a boolean reads `on / off`. Names, labels and option text are escaped as body names are; cap the row count
   (like `MAX_LISTED_BODIES`) with "and N more". A table cell must not be able to break the table: escape `|`
   (already in `MARKDOWN_PUNCTUATION`) and flatten line breaks.
5. Fill `note` from the project description (Open question 2) and keep it as the quote under the title.
6. Order: title, description quote, **Open in WarpCad** link, counts and file link, **How this was made**,
   **Variables**, footer.

## Effort

M. The README work is small; the optional `response` touches the record schema, two tools and the in-app chat,
and a schema change needs fixtures for a file saved by the previous build (see `ai-031`'s
`prompt-saved-by-v1.2.0.ndjson` for the shape).

## Testing

- **Unit** (`gistReadme.spec.js`): a reply with `[x](javascript:…)`, `<img onerror>`, bidi controls and
  `@mentions` stays inert; the reply counts against the shared cap and the cut one ends in `…`; a number
  variable with `min` and `max`, with only one of them, with neither, an enum, a boolean; a variable named
  `a|b` and one with a line break cannot break the table; no variables, no section; no reply, the prompt renders
  exactly as `io-022` does today; deterministic output.
- **Unit** (`prompt.spec.js`, `document` specs): `response` is cleaned and capped like `text`; a file written
  without it loads; a file written with it, opened by the previous build's fixture, keeps it after a merge.
  **Numerical rule**: a `min`/`max` of `0`, a negative and a fractional value render as written, not as blank.
- **E2E (real app, `/`)**: seed a project with a prompt, a reply, two variables and a note; publish against the
  fake gist API; assert the README body has all four sections in order; untick **Include prompts in the
  README** and assert the prompt and reply are gone while the variables remain. **All three viewports; all
  three engines** (`fetch`, IndexedDB).
- **Acceptance scenarios**: re-drive 30. **Closed findings re-run**: `io-017`'s README repro (hostile body
  names stay inert), `io-022`'s (hostile prompt text stays inert), and `ai-031`'s (a prompt survives Download
  copy, a share link and a gist).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
