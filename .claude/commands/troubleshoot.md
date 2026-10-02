# Log a Troubleshooting Discovery

Use this skill whenever you:
- Discover that a tool or command gave a misleading result
- Find a non-obvious root cause for a bug
- Use a clever workaround that future sessions should know about
- Notice that tests reported passing when they were actually failing (or vice versa)

Log it immediately — before moving on — so the knowledge isn't lost.

---

## Step 1 — Read TROUBLESHOOTING.md first

Before starting any debug work, read `TROUBLESHOOTING.md` in the project root.
Check whether a similar issue has already been logged. If so, follow the documented fix.

```
read TROUBLESHOOTING.md
```

---

## Step 2 — Describe what happened

Capture:
1. **What was observed** — what the tool/test/command reported
2. **What was expected** — what should have happened
3. **Root cause** — the specific mechanism that caused the discrepancy
4. **Fix or prevention** — concrete commands or patterns to avoid the problem next time
5. **Steps taken** — numbered list of what resolved it

Keep each section factual and specific. Don't editorialize.

---

## Step 3 — Append the entry

Append a new entry to `TROUBLESHOOTING.md` using this format:

```markdown
### YYYY-MM-DD — [Short title describing the discovery]

**What happened:**
[Observation. Expected vs. actual.]

**Why it happened:**
[Root cause. Specific mechanism.]

**Fix / Prevention:**
[What to do differently. Concrete commands or patterns.]

**Steps taken to resolve:**
[Numbered list.]
```

Insert the entry **above** the template comment at the bottom, below the last existing entry.
Use today's date in ISO format.

---

## Step 4 — Confirm

Tell the user what was logged and in which file.
If the discovery affects how tests are run or verified, say so explicitly.

---

## When to Invoke This Skill Automatically

Invoke this skill (without being asked) whenever you:

- Use `tail`, `head`, or any truncating filter on test output and later find the result was incomplete
- Run tests and report a result that the user contradicts
- Apply a workaround that required reasoning beyond the obvious first approach
- Discover that a tool behaved unexpectedly (wrong exit code, truncated output, cached result, etc.)
- Fix a bug whose root cause was non-obvious (environment-specific, timing, ordering, etc.)
- Chase a rendering or numeric discrepancy that turned out to be environmental —
  device pixel ratio, GPU/software rasterizer differences, float precision between
  the main thread and a worker, headed vs. headless canvas output. These are the
  ones most expensive to rediscover, and the least likely to be obvious next time.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
