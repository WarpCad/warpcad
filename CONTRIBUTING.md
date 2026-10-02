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

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
