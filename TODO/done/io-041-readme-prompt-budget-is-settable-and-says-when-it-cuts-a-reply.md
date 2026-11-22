---
title: Let the person set the README's prompt budget (MAX_PROMPT_CHARS) when publishing a gist, warn when it would cut a prompt or reply, and say "reply omitted, see project file" where a reply is dropped
category: io
kind: finding
priority: medium
model: sonnet
milestone: none — Findings table, filed 2026-11-22 at the owner's request
depends: []
status: done
---

> **What shipped (2026-11-22).** As specified, with these differences. The report is `promptBudget(prompts, limit)` and its sentence is `promptBudgetNote(report)`, both in `src/core/gistReadme.js`; it also lists replies *cut short* (a third kind of cut the plan did not name). The limit is clamped to 500–60,000 and the field is remembered per device in `localStorage` (`warpcad.gistPromptChars`). `get_publish_readiness` returns the report as `promptBudget` beside `readme`; it is not a `gaps` entry, because an agent cannot change the limit. The new e2e case is `e2e/gist-share.e2e.js` case 14, and the Share sheet picture `gist-prompts.png` now shows the field. The README text is cut where the budget runs out; a dropped reply prints `Reply omitted, see project file.` and a dropped request is counted as `and N more, see project file.`

## Problem

The gist README's **How this was made** section (`TODO/io-022`, `io-023`) spends one fixed budget on every prompt and every reply:
`MAX_PROMPT_CHARS = 6000` (`src/core/gistReadme.js:53`). `promptsSection` (`src/core/gistReadme.js:266-310`) caps each text against what is
left, ends a cut text with `…`, and once the budget reaches zero it **drops that prompt's reply** and then every later prompt, counting the
rest as `- and N more`.

Found on 2026-11-22 with the closet fan duct gist (`f4108ae184c2afaac79e45bd770c0ff6`). The project file held three prompts and three
replies, but the README showed prompt 3 cut at `…the build plate when printed.  …` with no reply, because prompt 1 (about 2,200 characters)
and the long first and second replies had already used the budget. Nothing told the reader anything was left out, and nothing told the
person who pressed **Publish**. The full text is in the `.warpcad` file, so nothing is lost, but the README looks as if the third turn never
got a reply.

Three faults:

1. **The limit is not the person's to set.** 6000 is a code constant. A project with three long turns hits it; the person cannot raise it.
2. **Publishing gives no warning.** The Share sheet's **Include prompts in the README** checkbox says nothing about whether the text fits.
3. **A dropped reply leaves no trace.** A cut request ends in `…`, but a reply that is dropped entirely (budget `<= 0`) is simply absent.

## Affected files

- `src/core/gistReadme.js` — `promptsSection`, `MAX_PROMPT_CHARS`; take the budget as input, and report what was cut.
- `src/core/gistReadiness.js` — `gistBriefOf` and the `get_publish_readiness` preview; must pass the same budget and report the same cut.
- `src/stores/gistPublish.js` — `briefOf` (~line 186), `publish` and `update` `choice` objects (`prompts`, plus the new budget).
- `src/components/layout/ShareGistGroup.vue` (and its spec) — the budget field and the warning, beside **Include prompts in the README**.
- `src/ai/tools/` readiness tool and `docs/agent-prompting.md` — the readiness result gains the same "would cut" note (agents see it too).
- `docs/sharing.md`, `docs/decisions/gist-storage.md` — document the setting and the omitted-reply line.
- `e2e/docs/share-gist.docs.js` — the Share sheet picture.

## Proposed fix

1. **Make the budget an input.** `buildGistReadme` / `promptsSection` take `promptChars` (default `MAX_PROMPT_CHARS`, so an existing caller is
   unchanged). Clamp it in code to a floor (for example 500) and a ceiling (for example 60 000: a gist file may be large, but a README that
   long is unreadable), and ignore a non-number. Keep `MAX_LISTED_PROMPTS = 20`.
2. **Return what was cut.** `promptsSection` also returns a small report, `{ totalChars, cutPrompts: n[], droppedReplies: n[], omittedPrompts: n }`,
   computed in the same pass so the preview and the README cannot disagree. `totalChars` is what the section would need to show every prompt
   and reply whole, so the sheet can say "needs 9 400".
3. **Say it where a reply is dropped.** When a prompt is listed but its reply is not because the budget ran out, print under it:
   `> *Reply omitted, see project file.*` (a quoted line under **Reply**, so it reads as part of that turn). A reply that is only
   shortened keeps its `…`. A prompt dropped whole stays counted in `- and N more`, and that line gains `, see project file`.
4. **Share sheet.** Next to **Include prompts in the README**, a number field **README text limit** (characters, default 6000, shown only
   while the box is ticked). Under it, one line that updates as the person types or as the text changes:
   - fits: `All 3 requests and replies fit (4 120 of 6 000).`
   - cuts: `Over the limit: request 3 is cut and 2 replies are left out. Raise the limit to 9 400 to show everything.`
   Never block **Publish**. Remember the last value on the device (a plain setting, like the other Share sheet choices, not document state).
5. **Agents.** `get_publish_readiness` lists the same cut (it already previews the README through `gistBriefOf`) and names the limit in
   force, so an agent can tell the person before they publish. Agents cannot change the limit, as with the **Include prompts** choice
   (`docs/decisions/gist-storage.md`).
6. **Untrusted text.** The new strings are fixed wording. The numbers are formatted from counts, never from prompt text.

## Effort

M (a few hours): a small core change, one store pass-through, one Share sheet row, docs and a picture.

## Testing

- Unit, `src/core/gistReadme.spec.js`: the default budget still produces today's README byte for byte; a larger `promptChars` shows all
  three turns whole; a limit that runs out inside prompt 1 cuts it with `…`, prints `Reply omitted, see project file.` under it and counts
  the rest; a limit that runs out between a prompt and its reply prints the omitted line for that reply only; the report's counts match
  the printed README; floor, ceiling, `NaN`, a string and a negative number all fall back to the clamp or the default.
  Degenerate cases: zero prompts, an empty reply, a reply of exactly the remaining budget, 20+ prompts.
- Unit, `src/core/gistReadiness.spec.js` and the readiness tool spec: the preview and the published README agree on what is cut.
- Component, `src/components/layout/ShareGistGroup.spec.js`: the field is hidden while the box is unticked; the fit and cut lines read
  right for each report; the value is passed to `publish` and `update`.
- App-level `e2e/gist-share.e2e.js` (navigates to `/`; the GitHub backend mocked at `fetch`): open the Share sheet on a project with three
  long turns, see the over-the-limit line, raise the limit, see it turn to the fits line, Publish, and read the README the mock received.
  Runs on the rotating pair (`test:e2e:headless`), plus phone width for the sheet, since the sheet is a bottom sheet there.
  Persistence of the remembered value touches storage, so one run on all three engines.
- Re-run `io-040`'s reproduction (an agent stages the gist, readiness is clean, Publish with nothing to type) against the new code.
- Acceptance scenarios: none touch the Share sheet; re-check by hand that Publish with the default limit is unchanged.

## Interaction model

- **Precondition:** the project has at least one recorded prompt, and **Include prompts in the README** is ticked.
- **Trigger:** the **README text limit** field in the Share sheet (and **File ▾ → Save as gist…**), under the Include prompts checkbox.
- **Feedback:** the fits or over-the-limit line under the field, live; after Publish, the README shows `Reply omitted, see project file.` where a
  reply was dropped.
- **Placement:** n/a. **Selection response:** n/a. **Selection count:** n/a.
- **Small-screen behavior:** same as desktop; the field and its line stack inside the sheet at 390 px, tap size kept.

## Documentation

- **Page:** `docs/sharing.md`, the gist section.
- **Example:** open a project with three long agent turns. Choose **Share → Save as gist…**, tick **Include prompts in the README**, read
  "Over the limit: request 3 is cut and 2 replies are left out. Raise the limit to 9 400 to show everything.", type 9400 in **README text
  limit**, watch the line turn to "All 3 requests and replies fit", then tap **Publish**.
- **Media:** update the `share-gist` picture in `e2e/docs/share-gist.docs.js` (the sheet showing the over-the-limit line), embedded in
  `docs/sharing.md`. Regenerate with `npm run docs:media` (never `docs:gifs` for one picture; see memory).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
