# Owner — Walk the Owner Queue, One Prompt After Another

Ask the owner the items in `TODO/OWNER.md`, record each answer where it belongs, and go straight on to the
next. The owner's time is the scarce resource, so one sitting should clear as many items as they have
patience for, with no "say next" between items and no "want me to…" at the end.

Trigger on `/owner`, "ask me the owner items", "let's do the iPad checks", "what do you need from me".

**Arguments:** none (start at the first open item, in file order); a section: `unblock`, `questions`,
`mac`, `accounts`, `ipad`, `iphone`, `either`, `later`, `printer`, `older`; or an item code (`Q3`, `I7`).

---

## Rules for the whole sitting

- **Ask one item per `AskUserQuestion` call, then the next, without ending the turn.** Never print a
  question as text. Never stop to say what is coming next. The sitting ends only when (a) the section or
  file is done, (b) the owner types `stop` (or "pause", "later", "enough") in Other, or (c) the owner picks
  **Pause** on a prompt that offers it.
- **Make every prompt stand alone.** It may be read on a phone with nothing else on screen. Put the item code,
  title, minutes and the steps in the question text (shortened if needed, steps never dropped). Add
  "Type stop in Other to end the sitting." to the first prompt of each section.
- **Do the agent's part before asking.** If an item says the runner or agent prepares something (a build
  installed, test files written, a picture regenerated), do it first. Never ask the owner to do what you
  could do.
- **Skip what cannot be answered yet.** An item whose `waits on:` is not met is passed over silently, and the
  closing summary lists it.
- Re-read `TODO/OWNER.md` fresh at the start. Another session may have changed it.

## The three prompt kinds

Use exactly these labels. Each passes `~/.claude/hooks/ask-guard.mjs` (it needs "Explain more" and "Defer" or
"Pause" in the labels). The automatic **Other** takes typed answers.

| Item `Answer:` | Options, in this order |
|---|---|
| `validation` | **Pass** · **Fail** · **Explain more** · **Skip (defer)** |
| `question` | **<recommended answer> (Recommended)** · **<alternative>** · **Explain more** · **Defer** |
| `action` | **Done** · **Hit a problem** · **Explain more** · **Not now (defer)** |

A device session (OWNER.md §5) opens with its **Setup** as one `action` prompt. A `### Q-group` opens with one
prompt: **Accept all recommendations (Recommended)** · **Go through them one by one** · **Explain more** ·
**Defer**, with every question in the group and its recommendation listed in the question text.

## What each answer does

Keep a list in memory of what to write. Write after every few answers, never only at the end, so a dropped
session loses little.

- **Pass:** the item's VERIFY.md row(s) become `OK`, with Notes prefixed
  `YYYY-MM-DD owner, <device or "Mac">: pass.` The item leaves OWNER.md and gets a line in **Answered**.
- **Fail:** ask one follow-up `question`: "What did you see? Type it in Other." Options: **Broken: file a
  finding (Recommended)** · **Works but feels wrong: file a finding** · **Explain more** · **Defer**. The row
  becomes `Issue` with the owner's words. Add the finding to a to-file list. At the end of the sitting, write each
  as `TODO/FIND-<category>-<next free NNN>-<slug>.md` (template in `TODO/README.md`; the owner's words go in
  Problem, the item's steps become the reproduction) and add its row at the bottom of the Findings table and
  Next up in `TODO/ROADMAP.md`.
- **Explain more:** read the item's source (its VERIFY.md entry, the task in `TODO/done/`, the docs page),
  then say in a few short lines what to look at, where it is on screen, what good and bad look like, and any
  evidence already gathered. Ask the same prompt again. After two rounds, offer **Skip (defer)** as the
  recommendation.
- **Skip (defer) / Defer / Not now:** the item stays and gets `Skipped YYYY-MM-DD` (or `Deferred`) appended
  to its meta line. Move on.
- **A question's chosen option:** record `**Decided YYYY-MM-DD (owner, /owner):** <answer>.` in the file that
  owns it: the task file named in the item, the `docs/decisions/` page, or `TODO/ROADMAP.md` for order. Do
  what the item says the answer triggers (file a row, un-hold a task, edit a skill's numbers). Do not
  implement product code. That is the runner's job.
- **Done (an action):** check the result where you can (the file exists, `npm run ios:release -- --check`
  prints the line, the Keychain item is there). For an **Unblocker**, move the task it unblocks from
  **Held** into the Findings table and Next up in `TODO/ROADMAP.md` (top of the queue, after rows already
  marked "run first").
- **Hit a problem:** ask one follow-up for what happened (type in Other), record it on the item, and leave the
  item open with that note.
- **Other (free text):** treat it as the answer. If it is clearly a pass, fail or decision, record it as that.
  Otherwise record it verbatim in the row's Notes and on the item, and say in one line what you did with it.
- **Timed items (§6, `/owner later`):** the first prompt is the **start** (`action`). Record
  `Started YYYY-MM-DD` on the item. When the wait has passed on a later sitting, ask the check (`validation`).

After each answer, update the counts in OWNER.md's **At a glance** table and the **Next for you:** line.

## Closing the sitting

1. Write everything still pending, and file the to-file findings.
2. Print a short summary: answered N (pass / fail / decided / skipped), findings filed (ids), tasks un-held,
   items still waiting and on what.
3. Name what comes next for both sides:
   - **Next for you:** the first open item in OWNER.md that can be answered now, with its minutes.
   - **Runner next:** row 1 of the runner's queue (`TODO/ROADMAP.md` Next up, first ▶ row), with its title.
4. Ask one last prompt: **Commit the answers and start the runner (Recommended)** · **Commit, don't start
   it** · **Explain more** · **Pause**. On a commit option, commit only the files this sitting changed
   (`TODO/`, `docs/decisions/`, any skill file a decision edited) with `git commit -s`, message
   `docs(todo): record owner answers (<codes>)`. On the first option, also start the runner by invoking
   `/loop /run-todos`.

## Notes

- This command never edits product code and never pushes.
- VERIFY.md is the record and OWNER.md is the queue. Never leave a VERIFY row `Owner` once its item is answered.
- If OWNER.md has no open item that can be answered now, say so in one line, then name the runner's next task
  and the earliest waiting item and what it waits on.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
