---
model: sonnet
---

# Commit — Rich Message + Social Post

Create a thoughtful, well-structured commit for staged (or all) changes.

---

## Step 1 — Review what's changing

Run:
- `git status` — see staged and unstaged files
- `git diff` — see unstaged changes
- `git diff --staged` — see what's already staged
- `git log --oneline -5` — understand context and commit style

If there are unstaged changes, ask: "Should I include all changes, only the staged ones, or should we split this into multiple commits?"

---

## Step 2 — Understand the change

Read every modified file before writing anything.
For each changed file, note:
- What was added, removed, or modified
- Why it was likely changed (feature, bug fix, refactor, docs, test, chore)
- Any non-obvious design decisions in the diff

If the purpose of a change isn't clear from the code, ask the user: "What was the intent behind [specific change]?"

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
```

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

Ask: "Ready to commit? Any edits to the message or posts?"

Only commit when the user confirms — **unless** this run has standing
authorization to commit unattended (a `/loop` or scheduled routine the user
set up specifically to drive this skill end-to-end, e.g. via `/fix-todo`).
That authorization covers skipping the wait; it never covers skipping the
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
