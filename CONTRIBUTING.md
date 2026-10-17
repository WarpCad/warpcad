# Contributing

Thanks for helping. Before you open a pull request:

1. Read [`LICENSING.md`](LICENSING.md). Code is AGPL-3.0-or-later; prompts, specs and docs
   are CC BY-SA 4.0. Your contribution is accepted under the license that covers the files
   you touch.
2. **Sign off every commit** with the [Developer Certificate of Origin](https://developercertificate.org/):

   ```
   git commit -s -m "feat(viewport): ..."
   ```

   That adds a `Signed-off-by: Your Name <you@example.com>` line, certifying you wrote the
   change (or have the right to submit it) and agree it is released under the project's
   license. Pull requests with unsigned commits will not be merged. If an AI agent helped
   write the change, the human submitting it is the one who signs off.
3. New source and prose files need an SPDX marker — run `node scripts/spdx.mjs --fix` after
   `git add`ing them. CI runs `npm run spdx` and `npm run licenses`.
4. Do not add code, assets or prompts copied from a source whose license is incompatible with
   AGPL-3.0 or CC BY-SA 4.0 (proprietary, "non-commercial", SSPL, and similar).
5. No third-party logo or brand image goes into the repository without a licence check, and a new
   third-party product name needs its owner added to
   [Trademarks and names](LICENSING.md#trademarks-and-names).

Project workflow (specs under `TODO/`, `/fix-todo`, acceptance scenarios) is described in
[`CLAUDE.md`](CLAUDE.md) and [`TODO/README.md`](TODO/README.md).

## Docs media

Pictures in `docs/` and `README.md` are test by-products, so they cannot go stale silently.

- **Add a shot:** write `e2e/docs/<topic>.docs.js`, using `openApp`, `loadScene` (a fixture in
  `e2e/docs/fixtures/`, loaded through File ▸ Open) and `shot(page, '<name>.png')` from
  `e2e/docs/support.js`. The image lands at `docs/screenshots/<name>.png`; link to that path.
  Put the viewport in the name for phone/tablet shots (`…-phone.png`).
- **Check:** `npm run docs:screenshots` fails when the UI has drifted from a documented picture.
- **Refresh:** `npm run docs:screenshots:update` rewrites the images; commit the changed PNGs.
- **Canonical platform:** baselines are generated on the maintainer's Mac (Chromium, software
  GL via SwiftShader, `deviceScaleFactor: 2`). Font hinting differs on Linux, so the check is a
  local/nightly gate, not a blocking PR check, until a Linux generation path exists.

### Movies (GIFs)

Dynamic actions (a drag, a gizmo pull) are recorded as video and converted to a looping GIF.

- **Add a movie:** write a `*.docs.js` test tagged `{ tag: '@movie' }` (see
  `e2e/docs/primitive-drag-cube.docs.js`). Call `openApp`, then `startMovie(page, '<name>')`, drive
  with `humanDrag` (real mouse, eased, with a visible cursor dot), assert the end state, then
  `endMovie(page, '<name>')` and take a final-frame `shot`. The GIF lands at `docs/media/<name>.gif`.
- **Record and convert:** `npm run docs:movies` records to `.docs-movies/` (git-ignored),
  `npm run docs:gifs` converts with ffmpeg, and `npm run docs:media` does stills, movies and GIFs.
  Refresh the final-frame still with `npm run docs:movies -- --update-snapshots`.
- **Budget:** each GIF is at most 12 s and 1.5 MB; the converter fails and says which knob to turn.
  `docs/media/manifest.json` records the source spec's hash so a stale GIF can be detected.
- **Repo size:** GIFs are stored in Git LFS (`.gitattributes` routes `docs/media/**/*.gif` to
  it), so install Git LFS and run `git lfs install` before cloning or committing a regenerated
  GIF. Regenerate them at milestone ends rather than on every change, to limit LFS storage.
- **A movie is not an acceptance check.** It replays the sequence its author scripted.
  `TODO/ACCEPTANCE.md` scenarios still have to be driven by hand.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
