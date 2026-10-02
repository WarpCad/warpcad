# Licensing

WarpCad is copyleft: if you modify it or build on it and share the result, you share your
changes under the same terms. That applies to the code **and** to the prompts, specs and
workflows that were used to build it — those are a first-class part of this project, not
incidental notes.

Copyright © 2026 John Cole.

## Which license covers what

| Path | License | File |
|---|---|---|
| `src/`, `mcp/`, `e2e/`, `scripts/`, `bench/`, `build/`, `.storybook/`, root `*.js` / `*.ts` config, `index.html` | **AGPL-3.0-or-later** | [`LICENSE`](LICENSE) |
| `TODO/` (roadmap, specs, acceptance scenarios, findings), `.claude/commands/`, `.claude/prompts/`, `CLAUDE.md`, `AGENTS.md`, `docs/`, `README.md`, `PREVIOUS-ATTEMPT.md`, `SECOND-ATTEMPT.md`, `TROUBLESHOOTING.md`, `Initial design.md`, every other `*.md` | **CC BY-SA 4.0** | [`LICENSE-DOCS`](LICENSE-DOCS) |
| `docs/screenshots/` and other images or GIFs under `docs/` | **CC BY-SA 4.0** by path (binary files cannot carry an SPDX marker) | [`LICENSE-DOCS`](LICENSE-DOCS) |
| `chat/` (drafted social posts) | All rights reserved | — |

Every `.js`, `.mjs`, `.cjs`, `.ts`, `.vue`, `.css` and `.md` file also carries an
`SPDX-License-Identifier` marker so the license travels with a file that is copied on its own.
Where a marker and this table disagree, the marker wins.

## What that means in practice

- **Fork the code and run it as a service** (including a hosted web app or MCP server):
  AGPL-3.0 requires you to offer your users the corresponding source, including your changes.
- **Reuse the TODO specs, prompts, slash commands or `CLAUDE.md`** — in your own project,
  to generate your own app, or in a derivative: CC BY-SA 4.0 requires you to credit the
  original, say what you changed, and license your adapted version under CC BY-SA 4.0 (or a
  compatible license such as GPLv3 / AGPLv3).
- **Code an AI generates from these prompts** is not automatically covered by the prompts'
  license — whatever a model produces is judged on its own terms. If you copy the *generated
  code in this repository*, AGPL-3.0 applies.
- Neither license stops you reading, studying or privately running any of it.

## Dependencies

Runtime dependencies are all permissively licensed (MIT) and compatible with AGPL-3.0.
`npm run licenses` fails if a production dependency's license is outside an allow-list, and
`npm run spdx` fails if a tracked file lacks its marker. Both run in CI.

## Contributing

Contributions are accepted under the same licenses, certified with a
[Developer Certificate of Origin](CONTRIBUTING.md) sign-off.

## AI agents

Agents working in this repo follow the "Licensing" section of [`CLAUDE.md`](CLAUDE.md) (also
reachable from [`AGENTS.md`](AGENTS.md)). No license can bind a tool, so the rules are backed by
the CI checks above rather than by trust.

This document is a plain-language summary, not legal advice; the license texts control.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
