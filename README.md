# WarpCad

A browser-based parametric CAD application — 2D sketching to 3D solids, CSG
modeling, installable as a PWA, designed to be driven by an AI partner as well
as by hand. See `CLAUDE.md` for the full project brief, `Initial design.md`
for the kickoff design decisions, and `TODO/ROADMAP.md` for the build plan.

## Requirements

Node 24+.

## Install

```
npm install
```

## Develop

```
npm run dev
```

Serves the app at `http://localhost:5183` (a dedicated, strict port — see
`vite.config.js`).

## Test

```
npm run typecheck      # vue-tsc --noEmit
npm run test:unit       # Vitest, watch mode (add -- --run for a single pass)
npm run test:e2e:headless   # Playwright, against a real running app
npm test                # all three, in order, single-pass
```

## Component workshop

```
npm run storybook
```

## Build

```
npm run build
npm run preview   # serve the production build locally
```

## License

WarpCad is copyleft. The code is [AGPL-3.0-or-later](LICENSE); the prompts, TODO specs,
slash commands and docs that were used to build it are [CC BY-SA 4.0](LICENSE-DOCS). If you
modify or build on either and share the result, you share it under the same terms. See
[LICENSING.md](LICENSING.md) for the path-by-path map and [CONTRIBUTING.md](CONTRIBUTING.md)
for the sign-off every contribution needs.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
