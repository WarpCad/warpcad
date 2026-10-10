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

**Update 2026-10-04 (`TODO/sketch-003`):** no longer reproduces. All three `firefox-*` projects
launched and passed `e2e/sketch-reference-image.e2e.js` (and the full matrix run) in this
sandbox with no reinstall; the cache was evidently repaired in between. Run Firefox again
rather than assuming this entry still holds.

### 2026-09-24 — `TODO/ui-045`'s "trusted touch stops selecting" could not be reproduced as a pointer/raycast bug; it reproduces as viewport-chrome occlusion instead

**What happened:**

`TODO/ui-045` reported that on webkit-phone, a **trusted** `page.touchscreen.tap`
directly on a body's canvas pixel selected nothing after a trusted tap had already
landed on empty space, while a **synthetic** `PointerEvent` dispatched at the same
point/state selected correctly — and named `Viewport.vue`'s `onPointerDown`/
`onPointerUp` (specifically `setPointerCapture` succeeding only for a trusted
pointer, and WebKit's post-touch compatibility `click`) as the likely cause.

Extensive controlled reproduction in this sandbox (Playwright's WebKit-phone/tablet
and Chromium-phone/tablet projects, both `page.touchscreen.tap` and synthetic
`canvas.dispatchEvent(new PointerEvent(...))`, with temporary `console.log`
instrumentation of `onPointerUp` and `pickAt`'s `raycastHit` result) could **not**
reproduce a case where a trusted tap that genuinely reached the canvas
(`isClick: true`, `pressTravelPx: 0`, `pickAt` called) found no hit while a
synthetic tap at the identical point/state found one. Every reproduction that
looked like the reported symptom, on inspection, turned out to be one of these,
all ruled out one at a time:

1. **Literal coordinates from the finding are not portable.** The finding's own
   pixel examples ((372,240)/(135,290)/(268,255)) only mean anything for the exact
   camera/scene state they were measured against; replayed against a freshly
   dropped scene in this sandbox they simply don't land on the bodies at all —
   confirmed because even a *synthetic* tap at those same literal coordinates also
   found no hit.
2. **X-ray twin meshes were not the culprit.** `addXrayTwin` (`src/render/mesh.js`)
   sets `twin.raycast = () => {}`, explicitly excluding twins from picking — so a
   selected body's x-ray twin cannot be what a raycast resolves to instead of the
   real mesh.
3. **The transform gizmo's own screen-space rings are a real, separate overlap
   hazard.** A tap that lands on the gizmo attached to the *previously* selected
   body (e.g. a tap aimed at "empty grid" near a still-selected body) is captured
   by `Gizmo.vue`'s `onHandleDown`, which calls `event.stopPropagation()` — so it
   never reaches the canvas's own `onPointerDown` at all. For a press that doesn't
   move, `onHandleUp` correctly forwards to `pickAt` via a `handle-click` emit, so
   this path is *not* a bug in isolation — but it is the first proof that a real,
   coordinate-based trusted tap can be intercepted by DOM/SVG overlay chrome in a
   way a same-element `canvas.dispatchEvent()` (what every existing spec's
   `clickViewportAt` helper does) structurally cannot be.
4. **The real, reproducible chain**: `NavigationChrome` (`src/components/viewport/
   NavigationChrome.vue`) raises itself above an open bottom sheet via
   `--viewport-bottom-inset`. Once raised, at phone width its cluster (mode
   toggles + D-pad + zoom + settings gear) occupies a real, ~194×200px hit region
   that can land on top of wherever a body happens to be rendered on canvas. A
   trusted tap aimed at that body instead presses a real nav-chrome button
   (confirmed via a capture-phase window listener logging `event.target`:
   `target=nav-step-right`, not the canvas) — and if that button is a
   camera-moving one (a D-pad step, in the reproduction), **the camera silently
   orbits**. Every *subsequent* tap, computed for the body's pre-nudge screen
   position, then misses for a real, separate, correct reason: the body moved on
   screen because the camera did. Chained together this reproduces "tap the Cube,
   then the Cylinder — nothing is selected, either time" byte-for-byte, entirely
   without any bug in `pickAt`/raycasting, and — critically — **entirely on
   Chromium too**, not only WebKit, which the original finding's own synthetic-vs-
   trusted comparison could never have shown, because dispatching a `PointerEvent`
   directly on the canvas node always invokes its listeners regardless of what
   visually and positionally overlaps it. Filed separately as `TODO/ui-046` (a
   layout hazard, not a pointer-handling bug) rather than folded into `ui-045`.
5. **With coordinates verified clear of every overlay band** (Operations toolbar,
   orientation gizmo, navigation chrome even fully raised, Inspector/Library
   sheets), the exact empty→body→body sequence — and body→body with *no*
   intervening empty tap — worked correctly on **every single trusted-tap
   repetition**, on both webkit-phone and chromium-phone, **both before and after**
   any code change. This was checked explicitly by `git stash`-ing the code change
   out and re-running the identical instrumented sequence.

**Why it happened:**

Most likely, the original diagnosis session's own synthetic-vs-trusted comparison
was itself contaminated by exactly the mechanism in point 4 above (or something
adjacent to it — the gizmo in point 3 is a second, independently-confirmed way a
"same point" comparison can differ between a real hit-test and a same-element
dispatch) without realizing that a synthetic `canvas.dispatchEvent()` bypasses real
DOM hit-testing entirely, so it can never be blocked by whatever chrome/gizmo/sheet
genuinely sits on top of the canvas at that pixel. That would make "trusted fails,
synthetic succeeds at the same point" look like a WebKit/touch-trust bug when it is
actually "the trusted tap's real target wasn't the canvas at all." This sandbox's
Playwright-driven WebKit is also a plausible but unconfirmed second factor — see
Fix/Prevention.

**Fix / Prevention:**

- Applied a real, defensible, low-risk improvement regardless of the above:
  `Viewport.vue`'s `onPointerDown` now calls `event.preventDefault()`, which is the
  spec-defined way to suppress WebKit's post-touch compatibility mouse/`click`
  sequence — the concrete artifact the original finding's own event log flagged as
  suspicious, even though no listener in this codebase was found to react to it.
- Added `e2e/selection-inspector.e2e.js`'s new trusted-touch test (`page.
  touchscreen.tap`, not a synthetic dispatch) driving repeated empty/body/body
  taps, including body→body with no intervening empty tap, at coordinates verified
  clear of every overlay band — durable coverage of a gesture no existing spec in
  this repo drives with real touch input.
- This test **passes both before and after** the `preventDefault()` change in this
  sandbox, so it does not constitute proof the original defect is fixed — only that
  it cannot be reproduced here once DOM occlusion is controlled for. **The
  decisive check is still the real-device row `TODO/core-031` already logged in
  `TODO/VERIFY.md`** — an actual iPhone/iPad is the only thing that can confirm or
  rule this out, exactly as `TODO/ui-045`'s own "Not yet known" note anticipated.
- If a real device *does* reproduce a canvas-targeted trusted-tap failure, re-open
  with that device's own event log (target, `pointerId`, coordinates) captured the
  same way this session's temporary instrumentation did — `console.log` in
  `onPointerUp` and in `pickAt` right before its `raycastHit` call — since that is
  what let every hypothesis here be confirmed or ruled out on the actual evidence
  rather than by re-reading the code.

**Steps taken to resolve:**

1. Reproduced the exact `TODO/ui-045` literal coordinates against a freshly dropped
   scene; found even a synthetic tap at the same coordinates missed, ruling out
   "trust" as the variable for that specific case (coordinates aren't portable
   across scenes).
2. Read `addXrayTwin` (`src/render/mesh.js`) and confirmed `twin.raycast = () =>
   {}` rules out x-ray twins as a raycast-order hazard.
3. Instrumented `window` with capture-phase `pointerdown`/`pointerup`/`click`
   listeners logging `event.target`'s `data-testid`; found a "cube tap" landing on
   `nav-step-right` instead of the canvas once `NavigationChrome` had raised itself
   above an auto-opened Inspector sheet.
4. Instrumented `Viewport.vue`'s `onPointerUp` and `pickAt` directly (temporary
   `console.log`, removed before commit) to confirm: when a tap's target truly is
   the canvas, `isClick` is `true` and `raycastHit` runs — and found a case where
   the *identical* screen point that hit the cylinder cleanly earlier in the same
   test run later missed, traced to the camera having silently orbited (`data-
   camera-azimuth` changed) because an intervening tap had pressed a nav-chrome
   button rather than reaching the canvas.
5. Rebuilt the reproduction with coordinates checked against `navigation-chrome`'s,
   `orientation-gizmo`'s, and the Inspector sheet's own `boundingBox()`s to
   guarantee no overlap, and confirmed the full empty/body/body sequence — with and
   without intervening empty taps — passes on **every** repetition, on both
   `webkit-phone` and `chromium-phone`.
6. Re-ran step 5's exact sequence with `git stash` isolating the `preventDefault()`
   change in or out of the tree, to confirm honestly that the new test does not
   distinguish the two — logged here rather than silently claimed as a proven fix.
7. Filed `TODO/ui-046` for the confirmed, separate chrome-occlusion hazard (point 4
   above), since it is real and reproducible but is a layout question, not this
   finding's pointer-handling one.

### 2026-09-28 — A click can fall through a body along a shared triangle edge: three.js's raycast is not watertight on edges

**What happened:**

`e2e/selection-inspector.e2e.js` "at phone width one bottom sheet at a time" started
failing on chromium-phone and webkit-phone after `TODO/core-035` made new documents fold
at Normal resolution: a click on a freshly dropped Ø40 cylinder at canvas fraction
(0.5, 0.26) — (195, 205.66) px on a 390 px phone — selected nothing. It was
deterministic, not timing (waiting 1.5 s changed nothing), and not the mesh: a hit grid
over the cylinder was identical at Normal and Legacy, and **±0.3 px** either side of that
exact point hit at Normal too. At Legacy the same point hit.

**Why it happened:**

`Raycaster.intersectObjects` tests each triangle separately, and its ray–triangle test is
not watertight: a ray that lands **exactly** on the edge two triangles share can be
rejected by both through rounding. The crack is zero pixels wide, but a click lands on
exact CSS-pixel coordinates, and the canvas centre column is the camera's own axis, so a
symmetric body can put an edge precisely under it. Normal gives a Ø40 cylinder 48 sides
instead of 32; one of the new side-wall edges happened to project onto that column.
Finer resolutions mean more edges and so more such points — a class of miss that existed
before, made likelier.

**Fix / Prevention:**

`Viewport.vue`'s `raycastHit` raycasts the exact point first and, **only on a miss**,
retries at a quarter pixel each way (`src/render/pick.js`'s `PICK_OFFSETS_PX`) before
treating the click as empty space. Hits are unchanged; a miss by a whole pixel is still a
miss. If a pick "sometimes" misses at one exact coordinate, probe ±0.3 px before
suspecting the pointer path, the selection store or the mesh.

**Steps taken to resolve:**

1. Replayed the spec's exact synthetic clicks in a standalone Playwright script at
   Normal and at Legacy (the document switched to Legacy before the drop) — miss vs hit.
2. Ruled out placement (identical record params and bounds at both), timing (150 ms vs
   1.5 s wait), and the mesh (an 11 × 10 hit grid over the cylinder, identical).
3. Probed ±0.3 px and ±1 px around the miss: every neighbour hit. Zero-width crack.
4. Added the retry offsets; the spec passes unchanged at the same coordinates.

### 2026-09-29 — A row revised in place keeps its id, so the viewport kept drawing the old mesh

**What happened:**

Hand-driving `TODO/ui-052` (a Pi 4 changed to a Pi 5 with a cube snapped to its AV jack,
committed with **Leave broken**): the cube's Inspector, gizmo and dimension lines all
moved back to the cube's pre-snap position, but the cube's **mesh** stayed drawn at the
snapped position. Clicking where the gizmo said the cube was picked nothing. Every test
passed — they all read `data-body-center`/`data-body-volume`, which come from the
document, not from the three.js scene.

**Why it happened:**

`Viewport.vue`'s mesh sync skipped a body whenever `existing.userData.recordId ===
body.recordId` — "same terminal record, nothing to rebuild". That held while every edit
appended a record. `data-004`'s replace path, and `ui-052`'s `reviseRecords`, change a
row **in place**: the terminal record keeps its id while its evaluated geometry changes (a
snap left broken folds as identity; a revised row re-folds). Same id, different solid, so
the mesh was never swapped.

**Why this matters for every future task in this environment:**

Any feature that revises a record in place (mid-history edit, suppress, a condition
toggled, a composite param edit) can leave the rendered mesh out of step with the
document while every DOM-reported number is right. A spec that only reads
`scene-bodies` attributes cannot see it; it takes a pixel check or a pick.

**Fix / Prevention:**

`src/render/mesh.js`'s `bodyObjectIsCurrent(userData, body, hiddenShownKey)`: keep a mesh
only when the record id **and the evaluated geometry object** are both unchanged. The
fold cache (`core-031`) returns the same geometry object for an untouched record, so this
costs nothing at rest. Guarded by `mesh.spec.js` and by a pick in
`e2e/composite-param-edit.e2e.js` (click the gizmo hub's spot with nothing selected and
the cube must be picked), which fails against the old id-only check.

**Steps taken to resolve:**

1. Compared the cube's `data-body-center` (pre-snap) with a screenshot (mesh at the snap).
2. Found the id-only early-out in the mesh sync loop.
3. Added the geometry-identity check, wrote the unit test RED first, then proved the e2e
   pick fails with the old check and passes with the new one.

### 2026-10-10 — A real touch drag on an SVG handle ends in `pointercancel` at (0, 0), and "compute the move on release" throws the thing to the corner

**What happened:**

`TODO/io-007`'s cut-plane handle (an SVG circle in an overlay over the canvas) passed a spec that drives it with synthetic `PointerEvent`s, and was unusable with a real finger at phone width: the offset crept up for six moves, then jumped to the minimum. Two separate causes hid behind the one spec.

**Why it happened:**

1. The Split bottom sheet and the auto-opened Inspector sheet sat on top of the handle. `dispatchEvent` goes straight to the element, so it never notices; `document.elementFromPoint(handleCentre)` returned the sheet's paragraph.
2. The browser cancelled the touch after a few moves (an SVG child under an overlay did not carry `touch-action: none` on its ancestors). A `pointercancel` event has `clientX = clientY = 0`; the handler treated cancel like release, computed `(0 - startX)` of travel and clamped the offset to the minimum.

**Fix / Prevention:**

Ignore `pointercancel` position (keep the offset reached), put `touch-action: none` on the overlay `<svg>` as well as the handle, and assert in the e2e that `elementFromPoint` at the handle's centre is the handle. A trusted touch (`Input.dispatchTouchEvent` through a CDP session, `hasTouch` and `isMobile` context) is the only emulation that exercises both. The drag also converts each pointer step with the axis as projected at that moment, not one start-to-now conversion, because perspective changes pixels-per-mm as the plane moves and a synthetic burst under load otherwise drifts by a couple of millimetres.

**Steps taken to resolve:**

Hand-drove the Split sheet with CDP touch at 390x844, logged the offset per move, saw it jump at move 7, then read `onUp`.

<!-- Template for new entries:

### YYYY-MM-DD — [Short title describing the discovery]

**What happened:**

**Why it happened:**

**Fix / Prevention:**

**Steps taken to resolve:**

-->

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
