# TROUBLESHOOTING.md — Non-obvious root causes

Read this before debugging. Appended via `/troubleshoot` (see
`.claude/commands/troubleshoot.md`), newest entry at the bottom.

---

### 2026-09-06 — `group.js`'s `names` list is not deduplicated: two records sharing a `name` would union a body with itself

**What happened:**

Not a failure that was observed — a hazard found by reading, while implementing
`TODO/ui-012` (gizmo/field transform sync), and logged rather than fixed because that
task does not exercise it. Recorded now because it is cheap to see today and expensive
to diagnose the day something does trip it: the symptom would be a *silently wrong
boolean result* or a doubled solid, with no error anywhere.

Expected: adding a part to a `Group` under a name that is already present replaces it,
or is rejected.
Actual: `add()` (`src/core/kernel/group.js`) does `parts[partName] = object` — which does
replace the entry in `parts` — but then appends unconditionally:

```js
const names = options.hidden ? group.names : [...group.names, partName]
```

So `names` ends up holding the same name twice. `combine()` then maps `names` through
`group.parts` and unions the result, meaning the surviving part is unioned **with
itself**. `booleans.union(x, x)` is not an error and not visibly wrong for a single
solid, so nothing fails loudly; it just does redundant kernel work and returns a
geometry whose polygon count and structure are not what the caller expects. `pick()` has
the same shape, since it also builds from `resolvePieces`.

**Why it happened:**

`add()` was ported from `jscad-utils`' `Group.add`, which had the same behaviour. In V1
nothing appended two records with one name to the same group, so it never surfaced. The
`parts` dictionary hides the duplication — only `names` carries it, and `names` is the
list `combine()` actually iterates.

**Why `ui-012` does not trip it, and how to keep it that way:**

`document.bodies()` — the real render path — reads `scene.byId` directly and never calls
`combine()`, so the ordinary viewport does not go through this code at all. More to the
point, `ui-012`'s supersession design appends transform records that are **deliberately
unnamed** (`src/core/transform.js` builds no `name` field, and its spec asserts that).
An unnamed record is never added to the group at all — see the `if (record.name)` guard
in `src/core/kernel/index.js`'s `evaluate` — so a superseding record cannot collide with
its predecessor's name.

**Fix / Prevention:**

If a future task ever needs a *named* superseding record, or any other path that adds two
parts under one name, fix `add()` first rather than working around it:

```js
const names = options.hidden || group.names.includes(partName)
  ? group.names
  : [...group.names, partName]
```

and cover it with a spec asserting `combine()`'s output for a group whose `names` had a
repeat — the assertion that catches it is polygon count or volume, not "it did not
throw", because it never throws.

Until then, the guard is the convention: **transform records carry no `name`**. A change
that starts naming them needs the `add()` fix in the same diff.

**Steps taken to resolve:**

1. Read `add()`, `combine()` and `resolvePieces` in `src/core/kernel/group.js` while
   designing `ui-012`'s supersession mechanism.
2. Confirmed the render path (`Viewport.vue` → `documentStore.raw.bodies()` →
   `src/core/document.js`) reads `scene.byId` and never reaches `combine()`.
3. Chose a design whose transform records are unnamed, so the hazard stays unreachable,
   and asserted that in `src/core/transform.spec.js` rather than leaving it to convention
   alone.
4. Logged it here instead of fixing it, per `TODO/ui-012`'s own instruction — the fix
   belongs with a task that has a reason to call `combine()` and can therefore test it
   against a real expectation.

---

### 2026-09-17 — Firefox Playwright projects can't launch at all in this sandbox: "Could not find profile folder"

**What happened:**

While running `TODO/ui-028`'s full 9-way engine × viewport matrix, every `firefox-*`
project (`firefox-phone`, `firefox-tablet`, `firefox-laptop`) failed **at browser
launch**, before any page loaded or any assertion ran:

```
<launching> .../firefox/Nightly.app/Contents/MacOS/firefox -no-remote -headless -profile ... -juggler-pipe -silent
[err] *** You are running in headless mode.
[err] Could not find profile folder.
<process did exit: exitCode=1, signal=null>
Error: browserType.launch: Failed to launch the browser process.
```

`npx playwright install firefox` completes with no output (it believes the browser is
already installed) and does not fix it.

**Why it happened:**

Not diagnosed further than "the cached Firefox build under
`~/Library/Caches/ms-playwright/firefox-*` in this sandbox is broken" — this is a
sandbox/environment defect, not a Playwright config or test-writing mistake in this
repo. Confirmed by re-running an already-shipped, already-green spec
(`e2e/fillet-chamfer-operation.e2e.js`, from `TODO/done/ui-027-...md`) against
`firefox-laptop` alone: it fails identically, with the same "Could not find profile
folder" message, for a spec that has nothing to do with `ui-028`.

**Why this matters for every future task in this environment:**

Any task whose Testing section calls for the full Chromium/Firefox/WebKit matrix
(`CLAUDE.md`'s Browser Support section) will see this same launch-time failure on all
three `firefox-*` projects, for reasons unrelated to whatever that task actually
changed. Don't spend time trying to fix the code, and don't treat it as a code
regression — confirm it against an unrelated, already-shipped spec first (as above) to
tell the two apart quickly, then report the other 6 (or, on a non-viewport-specific
spec, other 2) matrix cells' results and name Firefox as environment-blocked rather
than fixed or skipped.

**Fix / Prevention:**

Not fixed here (out of scope for a UI task, and the fix is sandbox/cache
reinstallation, not a repo change). If this needs to be unblocked for real: try
removing `~/Library/Caches/ms-playwright/firefox-*` entirely and re-running `npx
playwright install firefox` (a no-op reinstall over a corrupted cache may not
re-fetch), or run the Firefox projects in CI/a different machine instead of this
sandbox until its cache is confirmed healthy.

**Steps taken to resolve:**

1. Ran the full matrix for `e2e/resize-bisect-operation.e2e.js`; all 8 non-Firefox
   projects passed (30/30 tests), all 3 Firefox projects failed at launch (18/18
   launch failures, 0 reaching a page).
2. Ran `npx playwright install firefox` — no-op, failure unchanged.
3. Re-ran the same 3 Firefox projects against `e2e/fillet-chamfer-operation.e2e.js`
   (a different, already-shipped, already-green spec) to isolate repo-code vs.
   environment — identical failure, confirming this is environment-wide, not specific
   to the new spec or the new code.
4. Logged here rather than blocking `ui-028` on it, since 8 of 9 matrix cells are
   green and the 9th fails identically on code that shipped and passed review days
   earlier.

<!-- Template for new entries:

### YYYY-MM-DD — [Short title describing the discovery]

**What happened:**

**Why it happened:**

**Fix / Prevention:**

**Steps taken to resolve:**

-->
