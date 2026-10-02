---
title: Docs movie pipeline — record dynamic actions in Playwright, convert to GIF with ffmpeg
category: docs
kind: feature
priority: high
model: sonnet
milestone: M10
depends: [docs-005]
status: done
---

> **Shipped note:** landed as scoped, using `page.screencast.start({path})` (present in Playwright 1.63), so there is no blank lead-in and no `playwright.config.js` change. Recordings go to git-ignored `.docs-movies/` (not `test-results/`, which Playwright wipes) with a sidecar JSON; movie specs carry the `@movie` tag so `docs:screenshots` skips them. A real `page.mouse` drag works on the Library row, so no synthetic-event fallback or TROUBLESHOOTING entry was needed. Git LFS: not used; revisit past ~25 MB of GIFs (written in CONTRIBUTING.md).

## Goal

Dragging a part out of the Library, pulling a gizmo handle, subtracting one solid from
another — these are *motion*, and a still cannot show them. This task adds a second kind of
docs spec that records the run as video and converts it to a looping GIF that the markdown
embeds:

```
e2e/docs/<topic>.docs.js  ──(recordVideo)──▶  test-results/…/video.webm
        ──(scripts/docs-gifs.mjs + ffmpeg)──▶  docs/media/<name>.gif
```

"Done": one pilot movie — drag a cube out of the Library into the 3D view and release —
produces `docs/media/primitive-drag-cube.gif` under the size budget, the cursor is visible
in it, it starts at the first meaningful frame (no blank load), holds the final frame for a
beat, and loops.

## Interaction model

n/a — tooling only.

## Documentation

n/a for end users; add the "how to add a movie" paragraph to the `CONTRIBUTING.md` Docs
media section that `docs-005` creates.

## Affected files

- `playwright.config.js` — a `movie` fixture/option usable by the `docs-*` projects:
  `video: { mode: 'on', size: { width: 960, height: 600 } }`. Check first whether the
  installed Playwright (^1.63) has the explicit `page.screencast` start/stop API; if so use
  it, because it removes the blank-load lead-in. Otherwise keep `recordVideo` and trim.
- `e2e/docs/support.js` — `startMovie(page, name)` / `endMovie(page)` (marks the trim window
  and attaches the video path to the test), plus `humanDrag(page, from, to, { steps, ms })`
  and `installCursor(page)`.
- `scripts/docs-gifs.mjs` — finds each recorded movie, trims, converts, writes to
  `docs/media/`, and updates `docs/media/manifest.json`.
- `package.json` — `docs:movies` (run the movie specs), `docs:gifs` (convert), `docs:media`
  (stills + movies + gifs).
- `docs/media/manifest.json` — per GIF: source spec, spec content hash, byte size, duration.
- `LICENSING.md` — `docs/media/` is CC BY-SA 4.0 by path.

## Proposed fix

- **The cursor is not in the recording.** Headless video never draws the OS pointer, so a
  drag looks like a part sliding by itself. `installCursor` injects a fixed-position dot
  that follows `pointermove` and pulses on `pointerdown`, at the top z-index, `pointer-events:
  none`. It is injected only in docs runs.
- **Human-paced input.** `humanDrag` uses real `page.mouse` with interpolated `steps` and an
  ease-in-out so the ghost preview visibly follows the pointer. Several existing specs
  dispatch synthetic `PointerEvent`s on `window` (see `primitive-placement.e2e.js`); verify
  that a real `page.mouse` drag works for the Library row. If it does not (the
  `ui-053` first-drag-after-escape bug is the kind of thing to watch for), fall back to
  synthetic events *interpolated over time* with the cursor overlay — and record why in
  `TROUBLESHOOTING.md`.
- **Conversion** (ffmpeg is already installed at `/opt/homebrew/bin/ffmpeg`; `gifsicle` is
  not, so do not depend on it): two-pass palette for quality —
  `fps=15,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`
  — `-ss <trim>` from the recorded marker, `tpad=stop_mode=clone:stop_duration=1.5` to hold
  the last frame, `-loop 0`. Fail with an actionable message if `ffmpeg` is missing.
- **Budget, enforced by the script:** ≤ 12 s and ≤ 1.5 MB per GIF; over budget is a
  failure that says which knob to turn (fps, width, duration), not a silent oversize
  commit. Record the repo-growth concern: ~30 GIFs × ~1 MB is real; decide here whether
  `docs/media/*.gif` goes in Git LFS or is accepted as-is, and write the decision down.
- **GIFs are not pixel-compared** (palette/encoder output is not byte-stable). Their
  correctness gate is the *spec*: every movie spec ends by asserting the end state (for
  example `data-body-count`) and calls `toHaveScreenshot` on the final frame, which is also
  usable as the page's still. Staleness gate: the manifest's spec hash — if a movie spec
  changed and its GIF was not regenerated, `docs-007`'s guard reports it.
- **Movies do not replace acceptance driving.** These are scripted recordings. `CLAUDE.md`'s
  Verification section still requires `TODO/ACCEPTANCE.md` scenarios to be driven by hand;
  say so in the contributor paragraph so nobody counts a green movie as that check.

## Effort

M

## Testing

- The pilot movie spec, run via `npm run docs:media`, produces a GIF within budget; `ffprobe`
  (ships with ffmpeg) reports duration and frame size; a unit test (`scripts/docs-gifs.spec.js`,
  Vitest, ffmpeg mocked at the boundary) covers budget failure, missing-ffmpeg message, and
  manifest update.
- Re-run twice: the *final-frame still* must be stable even though the GIF bytes are not.
- Engines: **Chromium only** — recording is a docs tool, not a behaviour gate. Viewports:
  laptop for the pilot; phone/tablet movies arrive with `docs-018`.
- `TODO/ACCEPTANCE.md` scenarios: none (no `src/` change). Closed findings: `ui-053` is only
  *consulted* for the drag approach, not extended.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
