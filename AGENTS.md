# Agent instructions

The authoritative project instructions are in [`CLAUDE.md`](CLAUDE.md). Read it first —
including its **Licensing** section, which applies to every file you create or edit.

Short version of the licensing rules:

- Code is AGPL-3.0-or-later; prompts, specs, docs and every other Markdown file are CC BY-SA 4.0.
  See [`LICENSING.md`](LICENSING.md).
- Every new `.js`/`.mjs`/`.cjs`/`.ts`/`.vue`/`.css`/`.md` file gets its `SPDX-License-Identifier`
  marker (`node scripts/spdx.mjs --fix`). Never remove or change one.
- Do not copy in code, text or assets under an incompatible license, and do not add a
  dependency outside the allow-list in `package.json`'s `licenses` script.
- Do not strip license or attribution notices from anything under `TODO/` or `.claude/`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
