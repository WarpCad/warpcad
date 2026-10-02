# Rendering: `three.js`

Status: **Committed.** Moves `CLAUDE.md`'s Stack table "Rendering" row from
*Default — reconsider* to **Committed**.

`render-001` is the first task that pulls a rendering library in as a real dependency,
which is exactly the trigger `CLAUDE.md`'s Library-decisions rule names: *"re-run the
health check when it's actually about to be pulled in, not just once at initial
selection."* `docs/decisions/stack-defaults-health-check.md` (written during
`build-001`) deliberately did **not** cover rendering, because nothing had installed a
renderer yet. This document is that missing check, done at full Library-decision rigor
rather than as a one-line re-confirmation, because "three.js, previous attempt" was
explicitly a default to reconsider rather than a settled choice.

All figures below were pulled from the GitHub API and the npm registry on
**2026-09-05**, the day this decision was made.

## Options considered

| | **three.js** | Babylon.js | PlayCanvas |
|---|---|---|---|
| npm package | `three` | `@babylonjs/core` | `playcanvas` |
| Latest version / date | 0.185.1 · 2026-07-01 | 9.25.0 · 2026-09-03 | 2.22.0 · 2026-09-04 |
| Total releases | 317 | 809 | 398 |
| Last repo push | 2026-09-05 (same day) | 2026-09-04 | 2026-09-05 (same day) |
| GitHub stars | **115,158** | 26,025 | 16,639 |
| Forks | 36,527 | 3,683 | 1,972 |
| Open issues (issues only, PRs excluded) | 253 | **10** | 479 |
| Closed issues | 13,519 | 3,221 | 2,127 |
| Open/total issue ratio | 1.8% | **0.3%** | 18.4% |
| Contributors | 363+ | 296 | 145 |
| npm maintainers | 2 (`mrdoob`, `mugen87`) | **4** (`raananw`, `sebavan`, `ryantrem`, `vicentecartas`) | 1 (a single org account) |
| npm downloads / week | **15,193,062** | 339,283 | 58,945 |
| Unpacked package size | **23.2 MB** | 70.2 MB | 85.5 MB |
| Full build, minified + gzip | **~84 KB** (`three.module.min.js`) | ~450 KB+ before tree-shaking | ~380 KB+ before tree-shaking |
| Measured in this app | **160 KB gzip total** (598 KB raw) — the whole `render-001` bundle: Vue + Pinia + three.js | not built | not built |
| License | MIT | Apache-2.0 | MIT |
| TypeScript types | DefinitelyTyped (`@types/three` 0.185.4) — **not first-party** | First-party | First-party |

A fourth option — **hand-written WebGL/WebGPU with no engine** — was considered and is
covered in the rejection table below rather than the comparison table, since it isn't
a library with health metrics to compare.

Two entries in that table deserve to be called out rather than buried, because they
cut *against* the winner:

- **Babylon.js has visibly better issue hygiene.** 10 open issues against 3,221 closed
  is a 0.3% open ratio; three.js's 253/13,519 is 1.8%. Both are healthy, but Babylon's
  is exceptional, and it is backed by four npm maintainers to three.js's two. If this
  decision were made on maintenance-process quality alone, Babylon would win it.
- **three.js has only two npm maintainers.** That is the one genuine bus-factor concern
  in this table. It is materially offset by 363+ repo contributors, same-day commits,
  15.2M weekly downloads, and an MIT license that makes a fork viable — but it is not
  nothing, and it is the metric to re-check if this decision is ever revisited.

## Rejection table

| Rejected option | Specific reason |
|---|---|
| **Babylon.js** | It is a *game engine*, and this app needs a *drawing surface*. Babylon's differentiators — the Inspector, node material editor, physics plugins, WebXR, asset/scene-file pipeline, animation system — are all things WarpCad will never call, while the parts it would use (camera, lines, meshes, a canvas renderer) are exactly the parts three.js is smaller at: 23.2 MB unpacked versus 70.2 MB, and a full minified+gzipped build of ~84 KB versus ~450 KB+. Its opinionated `Engine`/`Scene` lifecycle also sits awkwardly against `CLAUDE.md`'s requirement that camera state be a framework-free single source of truth this project owns (`src/render/camera.js`), rather than state living inside an engine's own camera-controller objects. Its better issue hygiene and larger maintainer count are real advantages and are recorded above rather than argued away — they just don't outweigh paying an engine's whole surface area for a fraction of it. |
| **PlayCanvas** | Worst health metrics of the three by a wide margin — 479 open issues against 2,127 closed is an 18.4% open ratio, roughly 10× three.js's and 60× Babylon's — and a **single npm maintainer account**, which is a sharper bus-factor risk than three.js's two named humans. Largest unpacked payload (85.5 MB), smallest community (16.6k stars, 59k weekly downloads, 145 contributors), and its engine is shaped around the PlayCanvas hosted-editor product workflow, which this project does not use. Nothing it offers that the other two don't compensates for any of that. |
| **Raw WebGL / WebGPU, no library** | Means hand-writing matrix math, shader compilation, resource lifecycle, context-loss recovery, and picking — precisely the code three.js has had debugged across 363 contributors and 13,519 closed issues. `CLAUDE.md`'s Browser Support section requires Chromium/Firefox/WebKit parity on a surface where engines diverge more than anywhere else in the platform; absorbing that divergence by hand is the single largest schedule risk this project could take on voluntarily. Choosing three.js also does not foreclose WebGPU: three.js ships a `WebGPURenderer` (`three/webgpu`) behind the same scene-graph API, so a future move is a renderer swap rather than a library migration. |

## Prior three.js experience, factored in explicitly (not skipped)

`CLAUDE.md`'s Library-decisions rule requires direct prior experience to be weighed
explicitly rather than re-derived — the same treatment `docs/decisions/geometry-kernel.md`
gave `manifold-3d`. This project has **two** attempts' worth of three.js experience, and
the honest summary is that it produced **zero library-attributable failures** and
**three application-level failure modes this task must design against.**

What the retrospectives actually say:

- `PREVIOUS-ATTEMPT.md` lists *"A 3D viewport rendered, with camera navigation, from
  early in the build"* under **What worked**, and names three.js among the choices that
  *"all still look like the right calls in isolation."* Its rendering complaints are
  about assembly (components never mounted), not about the renderer.
- `SECOND-ATTEMPT.md`'s stop-note bugs that touch the viewport are: **the scene was too
  dark to see anything in** (`render-009` — no light sources in `createViewport`), and
  **"clicking dragging in the 3D viewport just rotates the base grid"** (orbit-only
  navigation with no independently reachable pan/zoom chrome). It also records a
  Safari/iPad-only touch-orbit bug that broke on vertical drag only.

None of those three is a three.js defect. All three are things the application built on
top of three.js failed to do: add lights, provide pan/zoom controls, and handle touch
events correctly across engines. That distinction matters for this decision in both
directions — it means the library carries no accumulated grievance, **and** it means
switching libraries would have fixed none of the actual bugs. Concretely, this task
treats all three as design constraints rather than history:

| Prior failure | What `render-001` does about it |
|---|---|
| `render-009` — scene too dark | Lights are added in `src/render/scene.js` at scene construction, alongside a deliberately non-black background, and the e2e spec samples rendered canvas pixels to assert the frame is neither uniform nor black — a check that fails loudly rather than looking "a bit dark" to a human weeks later. |
| Orbit-only navigation, no pan/zoom chrome | `NavigationChrome.vue` ships on-screen orbit / pan / zoom controls as tappable buttons from the first commit, driving the *same* `src/render/camera.js` functions pointer-drag drives — one camera model, two input paths, per this task's own Proposed fix. |
| Safari/iPad touch-orbit bug found only on-device | The e2e spec runs all three engines × all three reference viewports from line one, with touch input (Playwright `hasTouch`) on the phone and tablet projects rather than mouse-only emulation. |

## Version pinning — a real three.js-specific cost, handled rather than ignored

three.js does **not** follow semver. It publishes as `0.x` revision releases (`r185` is
`0.185.1`), and a minor-looking bump can and regularly does contain breaking API
changes and removals. This is a genuine ongoing maintenance cost that Babylon.js (on
real semver, at 9.x) does not have, and it is the second-strongest argument against
three.js after the maintainer count.

Mitigation, applied now rather than promised: `three` is pinned to an **exact** version
(`"three": "0.185.1"`, no caret) in `package.json`, matching the convention
`@jscad/modeling` 2.13.0 already set in this repo. Upgrades become a deliberate task
with the test matrix as the gate, not an incidental `npm install` side effect.

Second, smaller cost: three.js ships no first-party TypeScript types, so
`@types/three` (DefinitelyTyped, 0.185.4) is a dev dependency and can lag or drift from
the runtime package. `npm run typecheck` is a CI gate here (`CLAUDE.md` Conventions), so
drift surfaces as a failing build rather than as silent type erosion.

## Verdict

**three.js, confirmed. No red flag found, so this is decided here rather than escalated**
— per `render-001`'s own instruction not to manufacture an escalation when the default
is genuinely fine. It is actively developed (pushed the same day as this check), MIT,
overwhelmingly the most-used option (15.2M weekly downloads — 45× Babylon's), the
smallest payload of the three, and the closest fit to what this application actually
needs: a scene graph, a camera, lines, and meshes, with the camera-control policy owned
by this project rather than by the library.

## Sources

GitHub REST API (`/repos`, `/search/issues`, `/contributors`) and the npm registry
(`registry.npmjs.org`, `api.npmjs.org/downloads`), both queried 2026-09-05. Bundle
figures measured locally against the installed `node_modules/three/build/*.min.js`
with `gzip -c`. Prior-experience claims are quoted from `PREVIOUS-ATTEMPT.md` and
`SECOND-ATTEMPT.md` in this repo.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
