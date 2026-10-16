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

Commit identity:

- Commits in this repo are authored with the GitHub noreply address, never a personal email.
  The repo's local git config must set `user.email` to
  `230922+johnwebbcole@users.noreply.github.com`. Before the first commit in a session, check it
  with `git config --local user.email`, and set it if it's missing or different. Do not rely on
  the global config, which may hold a personal address.
- Sign off every commit with `git commit -s` (DCO), as `CONTRIBUTING.md` requires.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
