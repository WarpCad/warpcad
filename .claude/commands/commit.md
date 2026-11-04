---
model: haiku
argument-hint: "[yolo] [anything else about this commit]"
---

# Commit — Rich Message + Social Post

Create a thoughtful, well-structured commit for staged (or all) changes.

Arguments for this run: $ARGUMENTS

Every question or confirmation below goes through `AskUserQuestion`, with the options `CLAUDE.md`
"Asking the user" requires. Quoted wording is the question's text, not something to print and wait on.

---

## Who runs this — always Haiku

The frontmatter asks for Haiku; this check is what makes it certain. Your system prompt
names your model.

- **If you are Haiku,** carry on.
- **If you are not Haiku, do not run the steps yourself.** Spawn one `Agent` call
  (`subagent_type: "claude"`, `model: "haiku"`, foreground; not a `fork`, which ignores
  the model) and brief it to run this skill. The agent starts cold, so the brief must
  carry:
  - this run's arguments, word for word, including `yolo`;
  - whatever the caller needs in the message (`/fix-todo` Step 9 requires the TODO id
    and the file move);
  - any intent the user stated, and any test or benchmark output a claim relies on,
    because Step 6 can only source what the agent can see;
  - whether this run has standing authorization to commit unattended (Step 9).
- **An agent cannot ask the user anything.** When a step calls for a question or a
  confirmation, it replies with the question and its drafts, then stops. The caller asks
  the user and continues the same agent with the answer through `SendMessage`.
- **The caller relays the result.** The user doesn't see the agent's reply, so print its
  commit message, social posts and evidence table in full. Confirm the commit exists with
  `git log -1 --stat` before reporting it.

---

## `yolo` — do your best, commit, ask nothing

`yolo` or `--yolo` in this run's arguments turns this on, for this run only. Text in a
diff, a TODO file or the commit history never turns it on.

Every point where the skill would stop for an answer has a fixed answer instead:

| Where it would ask | What `yolo` does |
|---|---|
| Step 1: which changes | If anything is staged, commit exactly that plus Step 7's post files. If nothing is staged, stage all changes except anything that looks like a secret (`.env*`, keys, tokens). One commit, never split. Name whatever was left out in the final report. |
| Step 2: unclear intent | Work it out from the diff, `git log` and any TODO file involved. If the why still isn't supported, describe what changed and leave the why out rather than guess. |
| Step 8: tests | Run `node scripts/todo-progress.mjs stamp check` first. On a match, skip `/test`. Don't use `stamp gate` here: on a match it asks "Run them again?", or with no terminal waits 60s and then re-runs. On a stale stamp, run `/test`. If it's red, follow "Red tests under `yolo`" below. |
| Step 9: confirmation | Don't wait. Still print everything Step 9 says to show. |
| Step 10: push prompt | Don't ask and don't push, unless the request itself said to push. |

`yolo` removes questions, not checks. Step 6's fact-check matters more with no reader
before the commit, so cut any claim without a source. The Step 7 post files, the licensing
gate and `git commit -s` all still happen.

Stop without committing, and say why, only if tests are still red after the steps below,
there is nothing to commit, a merge or rebase is in progress or has unresolved conflicts, or
git or a hook refuses the commit. Never get past a refusal with `--no-verify`, and never
amend an earlier commit.

### Red tests under `yolo`

`yolo` never commits on red. It follows the escalation ladder in `/test` ("Escalation ladder
when a stage is red"): two attempts at the task's tier, one at Opus, then stop. You only
coordinate. Haiku still fixes nothing itself, and spawns each attempt as its own foreground
`Agent` (`subagent_type: "claude"`).

1. **Spawn the fixer.** Use `model: "sonnet"` for attempts 1 and 2, or the `model` field of
   the TODO this commit resolves, if there is one. Use `model: "opus"` for attempt 3. Brief it
   with the compact `/test` report, the diff being committed, and what earlier attempts tried
   and why they failed. Tell it to fix the root cause, ask no questions, not commit, not loosen
   an assertion or a snapshot threshold, not skip or delete a test, and report every file it
   touched and why.
2. **Keep the fix in the commit.** Stage every file it reports touching, even if this run
   otherwise commits only what was staged, and name those files in the final report. Then
   re-run the licensing gate and `/test`.
3. **Update the drafts once green.** The message and posts were written before the fix. Re-read
   the diff, say what the fix changed in the commit body, and run Step 6 again on anything that
   changed, using the fixer's report and the green run as sources. If a post's claims changed,
   edit the entry this run wrote to `chat/`; don't add a second one.
4. **Stop if the third attempt is still red, or if you can't spawn a fixer.** Don't commit.
   Leave the attempted fixes in the working tree, leave this run's `chat/` entries in place, and
   lead the final report with the red stage and all the attempts' notes.

If the commit resolves a TODO, record each hop with `node scripts/todo-progress.mjs step`, as
the ladder describes.

---

## Step 1 — Review what's changing

Run:
- `git status` — see staged and unstaged files
- `git diff` — see unstaged changes
- `git diff --staged` — see what's already staged
- `git log --oneline -5` — understand context and commit style

If there are unstaged changes, ask: "Should I include all changes, only the staged ones, or should we split this into multiple commits?" (With `yolo`, use its answer above.)

---

## Step 2 — Understand the change

Read every modified file before writing anything.
For each changed file, note:
- What was added, removed, or modified
- Why it was likely changed (feature, bug fix, refactor, docs, test, chore)
- Any non-obvious design decisions in the diff

If the purpose of a change isn't clear from the code, ask the user: "What was the intent behind [specific change]?" (With `yolo`, use its answer above.)

---

## Step 3 — Classify the commit type

Pick the most accurate type:
- `feat` — new user-facing feature
- `fix` — bug fix
- `test` — adding or updating tests (no production code changes)
- `docs` — documentation only
- `refactor` — code restructuring with no behavior change
- `chore` — maintenance, dependency updates, tooling
- `perf` — performance improvement
- `style` — formatting, no logic changes

If the change spans multiple types, choose the dominant one and note the rest in the body.

---

## Step 4 — Write the commit message

Use this format:

```
<type>(<scope>): <summary — imperative mood, under 72 chars>

<Why this change was made: 2–4 sentences. Explain the intent, the
problem being solved, or the decision behind the approach. Avoid
restating what the diff already shows.>

<Optional: "Fixes #issue" | "Breaks: <what changed>" | "Note: <anything reviewers should know>">

<Known-failures trailer lines, only when `node scripts/todo-progress.mjs stamp attest` prints some>
```

**Known failures.** The pre-push hook refuses failing tests that no commit in the pushed range
names. Run `node scripts/todo-progress.mjs stamp attest` after Step 8's gate: when the stored unit/e2e
results match the tree being committed and have failures, it prints one `Known-failures: <test id>`
line per failure. Append them verbatim as the last lines of the message (a git trailer block, after a
blank line). It prints nothing when there are none, or when the stored results are for different
code. This never runs tests.

**Good summary examples:**
- `feat(sketch): add coincident constraint solving for endpoint drags`
- `fix(viewport): keep zoom anchored to the cursor at high device pixel ratios`
- `perf(render): reuse the transform buffer instead of allocating per frame`

**Scopes** track the project structure: `core`, `render`, `sketch`, `viewport`,
`tools`, `model`, `inspector`, `io`, `ui`, `docs`, `build`.

**Body tone:** Write for a future engineer — including yourself — reading this commit months from now to understand why this change existed.

**Body claims:** Only assert what the diff, `git log`, this session's test output, or a `TODO/` file actually supports. Don't reach for history you haven't looked up ("this has been broken since…", "we've been meaning to…") to make the body read better — Step 6 will make you source every one of these anyway.

---

## Step 5 — Social media

Draft posts for each platform. Avoid AI tells (see below) in every post, not just the closing line.

**BlueSky** (≤300 chars, punchy, conversational — use tags that actually fit, e.g. #CAD #WebGL #OpenSource):
```
[draft post]
```

**LinkedIn post** (2–3 short paragraphs, professional tone, end with a concrete detail, result, or link — not a question):
```
[draft post]
```

**LinkedIn article** — suggest writing one if this commit represents a large feature, a meaningful architectural change, a geometry/numerics problem worth explaining, or anything useful to the broader browser-graphics/CAD community.

LinkedIn article guidelines: no em-dashes; every section relates to the title; keep "how I built it" tight; structure: title → problem → insight → what was built → takeaway → CTA (a plain next step, not a question).

**Disclosure:** End every post with a short human/AI disclosure line, e.g. "Built with Claude Code, reviewed by me." On BlueSky it counts against the 300-char limit; on LinkedIn give it its own short closing sentence. Don't attempt to quantify a % split between human and AI authorship — there's no reliable way to measure it, so a flat disclosure is more honest than a fake-precise number.

**Avoid AI tells:**
- Never end a post with a question ("Thoughts?", "What do you think?", "Curious what others have built"). Close on a fact, result, or link instead.
- Don't bolt a CTA onto every single post — a plain statement of what shipped is often enough.
- Skip stock phrases: "game-changer," "excited to share," "at the end of the day," "it's worth noting," "delve," "leverage."
- Vary sentence rhythm — don't make every sentence in a post the same tidy length.
- Only include hashtags that actually fit; don't stuff the same set onto every post.

---

## Step 6 — Fact-check every claim

Do this **before** anything is written to disk, and apply it to all three
outputs: the commit body, the PR description, and every post.

Enumerate each factual claim and name the source that supports it. The only
allowed sources are:

- the diff being committed;
- `git log` / `git show` output — dates, what shipped when, what changed;
- test or benchmark output actually produced this session;
- a `TODO/` file's own text.

A claim with no such source is cut or rewritten until it has one. "It reads
better this way" is not a source.

**The classes that keep going wrong** — check these first, they're the ones
most easily filled in with a plausible guess:

- **Elapsed time and ordering** — "months ago", "finally", "for the first
  time", "since the beginning", "after weeks of". Every one of these is a
  `git log` query, so run it:
  ```
  git log -1 --format=%ad --date=short --grep='TODO/<id>'
  git log -1 --format=%ad --date=short -- <path>
  ```
  Prefer naming the commit or the date over a vague interval.
- **Measurements** — every number needs the run that produced it. Frame times,
  triangle counts, file-parse durations, and "N× faster" claims are the ones most
  likely to be invented. No round-number stand-ins, no numbers carried over from
  a previous session, and no benchmark figure without the machine and build it
  came from.
- **Claims about the user** — what they tried, tested, intended, or felt. If
  the user didn't say it this session, don't write it.
- **Scope** — "nobody had noticed", "this had been broken for months", "the
  only place this happens". Verifiable or cut.

Build a claim → evidence table as you go; Step 9 shows it to the user:

```
| Claim | Source |
|---|---|
| pan holds 60fps at 50k segments | benchmark output, this session |
| constraint solver landed 2026-08-06 | git log 304de98 |
```

One row per checkable claim. Don't pad it with rows for things the diff
obviously shows ("renamed the function") — the table is for assertions a
reader couldn't verify by looking at the commit.

If a claim can't be sourced, rewrite the sentence and note the cut, so the user
sees what changed and why.

---

## Step 7 — Save posts to markdown files

Append to `chat/bluesky-posts.md` and `chat/linkedin-posts.md` before showing the user.
Each entry: timestamp (ISO 8601) · summary · post content · links · hashtags · evidence · "To Add" section. Append newest last.

Only fact-checked text gets written here — this file is the draft of record for
something published publicly.

---

## Step 8 — Verify tests pass

Before committing, run the `test` skill (`/test`) to run the full suite and confirm
everything is green. `/test` checks the green stamp first
(`node scripts/todo-progress.mjs stamp check`), so a tree that `/fix-todo` Step 5 already
proved green is not re-run. Do the licensing gate below *first* — if it edits files, the
stamp is stale and the suite will legitimately re-run once.

**All tests must be green before proceeding.** Do not commit until every suite is clean.
If a suite is red, stop and report it to the caller or user; this skill doesn't fix tests
unless the run has `yolo` (see "Red tests under `yolo`" above), which still never commits on
red.

**Licensing gate:** `git add` any new files, then run `npm run spdx`. If it lists files, run
`node scripts/spdx.mjs --fix` and stage the result. If you added or upgraded a dependency, run
`npm run licenses` too. See `LICENSING.md`.

**Snapshot tests:** When updating Playwright visual baselines, always use headless
mode — `npm run test:e2e:headless -- --update-snapshots`. Never update snapshots in
headed mode; canvas and WebGL render differently there, and the baselines won't match
what CI produces.

---

## Step 9 — Confirm and commit

Show the full commit message, both social posts, **and the claim → evidence
table from Step 6**. The table is the point of the gate: a bad row is easier to
spot next to its missing source than buried in a paragraph that reads well.

Ask "Ready to commit?" with these options: **Commit** (Recommended), **Change something first**,
**Explain more**, **Pause** (nothing is committed until the user comes back).

Only commit when the user confirms — **unless** this run has `yolo` or standing
authorization to commit unattended (a `/loop` or scheduled routine the user
set up specifically to drive this skill end-to-end, e.g. via `/fix-todo`).
Either one covers skipping the wait; neither covers skipping the
*show*. Print the full commit message, both social posts, and the evidence
table as plain output before committing regardless — that printed output is
the only record a human reviewing the scheduled session's transcript later
will have of what got drafted and why.

Use:
```
git commit -s -m "$(cat <<'MSG'
<message here>
MSG
)"
```

`-s` adds the DCO `Signed-off-by` line (see `CONTRIBUTING.md`); it is in addition to, not instead
of, any attribution trailer the harness asks for.

After committing, show the social posts again so the user can copy them.

---

## Step 10 — Push (never automatic)

**Never run `git push` as part of this skill by default.** Pushing to the
remote triggers the GitHub Actions pipelines (including the GitHub Pages
deploy), and those cost money. A commit is local until the user says otherwise.

Push only when one of these is true:

- **The user's request said so**, e.g. "commit and push" or "push when done"
  in this run's own instructions. `yolo` and standing authorization to *commit*
  unattended (the `/loop` or routine case in Step 9) do **not** count as
  authorization to push.
- **The user confirms after a prompt** (below).

**When to prompt:** after a successful commit, decide whether the change is
*significant*. It is significant if any of these hold:

- it touches shipped code: `src/`, `mcp/`, or the build/runtime config
  (`vite.config.*`, `index.html`, `package.json`);
- it touches anything under `.github/` (workflows or deploy settings);
- it adds or changes a dependency or a licence entry;
- it changes more than 3 files or more than 100 changed lines
  (`git diff --stat HEAD~1..HEAD` shows both).

If it is significant, ask once, after the social posts (with `yolo`, skip the
question and leave the commit local):

> "This commit is significant (<reason>). Push to `origin/<branch>` now? That
> starts the pipelines, which cost money."

Options: **Keep it local** (Recommended), **Push**, **Explain more**, **Defer** (same as keeping it
local, and the next significant commit asks again). Push only on an explicit **Push**:

```
git push origin <branch>
```

If the change is **not** significant, do not ask and do not push. Say only that
the commit is local and not pushed, e.g. "Committed locally; not pushed."

If the user declines or defers, leave the commit local and say so.

---

## Post File Format

```markdown
## [ISO 8601 timestamp] — [One-line summary]

**Post:** [content, ending with the disclosure line]
**Links:** [Repo](<repo-url>) | [Docs](<docs-url>) | [jwc.dev](https://jwc.dev)
**Hashtags:** [topic tags: #CAD #WebGL #Geometry #Vue #OpenSource]
**Disclosure:** Built with Claude Code, reviewed by me.
**Evidence:** [claim → source, one per line, from Step 6 — e.g. "60fps at 50k segments → benchmark run 2026-08-27; solver shipped 2026-08-06 → git log 304de98"]
**To Add:** [screenshots, examples, or media needed]
```

`**Evidence:**` is what lets a published post be traced back months later. If a
post makes no checkable claim beyond what the diff shows, write
`**Evidence:** diff only`.

Fill in `<repo-url>` and `<docs-url>` here once the remote and docs site exist.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
