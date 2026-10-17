# What's Next — Where the TODO List Stands, and the Decisions It Needs From You

Give a cold-start briefing on `TODO/`: what is done, what is ready, what is blocked, what is
owed to a human, and which open questions need a decision from the user. Then ask for those
decisions one at a time.

**Written for someone returning after days or weeks who does not remember the details.** Every
item in the briefing must make sense on its own. Never reply with bare ids such as `core-064`
or `M15`: say what the thing is, in plain words, the first time it appears.

**What this command may change:** only the file that owns a decision the user just gave you
(Step 6). It never commits, never runs `/fix-todo` or `/run-todos`, and never changes a
`TODO/` file's `status:` field.

---

## Principle: the files win over the summaries

The tables in `TODO/ROADMAP.md` are hand-maintained and they drift. Examples seen on
2026-10-17: a row marked ✅ still listed as "▶ ready", and a milestone count that does not
match its rows. So derive the state from the files, and use the roadmap only for two things:
its **Next up** table is the user's stated run order, and its reserved rows name ids that
have no file yet. Report every place where the roadmap and the files disagree.

- **Open work** = `TODO/<category>-<NNN>-*.md` front matter with `status: open`. Skip
  `README.md`, `ROADMAP.md`, `BUDGET.md`, `VERIFY.md`, `ACCEPTANCE.md` and `NEW-TODO.md`.
- **Closed work** = `TODO/done/*.md`.

---

## Step 0 — Read the state cold

Do these in parallel:

- `git branch --show-current`, `git status --short`, `git log --oneline -5`, and
  `git log --oneline origin/main..HEAD 2>/dev/null | head -20` (commits not yet pushed).
- `TODO/BUDGET.md`: the **Config** section and the last five **Runner Log** rows.
- `TODO/ROADMAP.md`: the **Next up** section, the **All open work** table, and the
  **Status summary** table. Skip the long history sections.
- `TODO/NEW-TODO.md`: the requests the user has typed in but not yet filed.
- `TODO/VERIFY.md`: every entry's heading, and every table row whose Status is `Open`.
- `TODO/ACCEPTANCE.md`: the scenario headings only.
- The file names in `TODO/*.md` and `TODO/done/*.md`.

---

## Step 1 — Build the inventory

For every open file, read its front matter (`title`, `kind`, `priority`, `model`, `milestone`,
`depends`, `status`) and its first paragraph under **Goal** or **Problem**.

- **Ready** = open, and every id in `depends:` has a file in `TODO/done/` (an empty `depends`
  is ready).
- **Blocked** = open, with at least one dependency still open. Name the missing ids and what
  each one is.
- **Unscoped** = a reserved row in the roadmap with no file behind it. It cannot be run yet.

Count each milestone from its roadmap table: ✅ rows against all rows. If that total disagrees
with the Status summary, report the mismatch.

---

## Step 2 — Check consistency (report only, do not fix)

Flag each of these, and name the file that needs correcting:

- An id that appears in both `TODO/` and `TODO/done/`.
- Two different tasks sharing one id. A reserved roadmap row and a real file can claim the same
  id; check the file's title against the row's text.
- A roadmap row whose ✅ or ▶ state disagrees with its file's `status:`.
- An open file with no roadmap row. The spot-check command in the roadmap's "Keeping this file
  up to date" section finds these.
- A `NEW-TODO.md` request that already matches a `TODO/done/` title. Such a request was
  probably completed and never cleared from the list.
- The last Runner Log row saying `in progress: <id>` (a run was cut short) or
  `STOPPED — awaiting user` (a run is waiting on the user).
- A ready task that is missing from **Next up**, or an item in **Next up** that is not ready.

---

## Step 3 — Find the questions that need the user

Collect candidates from these sources, then keep only the real questions:

1. **Owner tasks.** Roadmap rows and notes that say "Owner:" or "owed to you". These are things
   only the user can do: an account setup, a domain, a key, a device test.
2. **Owed human passes.** Any milestone whose status says a free-form pass is owed or due. Those
   passes are five minutes of hands-on use at phone, tablet and laptop widths. No script can
   stand in for them.
3. **Decisions awaiting an answer.** Search `docs/decisions/`, `TODO/` and `TODO/ROADMAP.md` for
   `await`, `your call`, `awaiting`, `open question`, `decision needed`, `decide` and
   `unchecked`. Open each match and read the question and the options it lists. Discard matches
   that are only narrative.
4. **Open manual checks.** Rows in `TODO/VERIFY.md` whose Status is `Open`.
5. **Stopped or blocked runs.** Anything the Runner Log or Step 2 flagged.
6. **The repo.** Uncommitted changes, unpushed commits, or a branch that has not been merged.

Merge duplicates. Drop any question that a `TODO/done/` retirement note already answers.

Rank the questions in this order:
1. Blocks the goal the roadmap names under "Today's goal".
2. Blocks a task that is ready to run.
3. Everything else.

---

## Step 4 — Write the briefing (plain output, not a file)

Use these sections, in this order. Keep the tables tight. Put the depth in the questions.

### Where things stand
One or two sentences: the current goal from the roadmap, and how many milestones are complete.
Then a table of the milestones that are still open: milestone, done/total, and one line on what
remains. Then one line on the repo: branch, uncommitted files, unpushed commits.

### Ready to run, in run order
A table with columns: id, what it is in plain words, priority, model tier, why it is in this
place. Mark the first row **next**. Keep the order the roadmap's **Next up** gives, and say so if
the files suggest a different order.

### Blocked
A table with columns: id, what it is, what it is waiting on.

### Not yet scoped
Bullets for each reserved roadmap row with no file. Give the id and one plain sentence on what it
would do.

### Consistency problems
Bullets from Step 2. Each one names the file to correct. Do not correct them yourself.

### Questions that need you
A numbered list, most important first. For each question give:

- **The question**, in one plain sentence.
- **Background**, in three to five plain sentences: what the product does here, what happened or
  what is pending, and which file holds the detail. Read that file before you write this part.
- **Options**, each with what it means and what it would change. Mark your recommendation and
  give the reason in one line.
- **If deferred**, what stays stuck and which work it holds back.

Show every question here. Ask about only the first one (Step 5).

---

## Step 5 — Ask for the decision

Ask about the **first** question with `AskUserQuestion`. Offer four options:

- Your recommended answer, labelled with "(Recommended)" at the end.
- The strongest real alternative.
- **Defer** — the question stays open and nothing changes.
- **More detail please** — explain the question further before deciding.

The user can type any other answer through the automatic "Other" choice.

For an owed human pass, offer these instead: **Done — record it**, **Not yet**, **Defer**,
**More detail please**.

Then stop. Do not start any other work in the same turn.

---

## Step 6 — Act on the answer

- **A chosen option:** record the decision as a dated line under that question's own section, in
  the file that owns it. Use this form: `**Decided YYYY-MM-DD:** <answer>. <the user's reason, if
  they gave one>`. The owning file is usually a `docs/decisions/` page, a `TODO/<id>.md` file for
  scope, or `TODO/ROADMAP.md` for order. If the decision changes order or readiness, update the
  roadmap's **Next up** and **All open work** tables and bump its **Last reviewed** date. Do not
  implement the decision. Do not commit. Name every file you changed and say those changes are
  uncommitted.
- **Defer:** record `**Deferred YYYY-MM-DD:** <question> — parked, no decision yet.` in the same
  place, and leave the question on the list for the next run. Change nothing else.
- **More detail please:** read the code, the decision page, and the task file the question depends
  on. Then answer with: what the decision changes in the code, what evidence exists (cite
  `file:line`), what each option would do, and your recommendation with its reason. Then ask the
  same question again with the same options. Allow two rounds of detail. After that, say what is
  still unknown and offer **Defer**.
- **Free text in "Other":** treat it as the answer, and record it the same way as a chosen option.

When you finish, name the next question but do not ask it. Ask it only when the user says "next".

---

## Notes

- Re-read the files on every run. Do not reuse conclusions from an earlier session, because the
  repo may have moved since then.
- If Step 3 finds no real questions, say "No open decisions found," then print the ready list.
  Do not invent questions to fill the space.
- Most grep matches are noise. Read each one before you count it as a question.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
