# Architecture Audit: Organization, Reuse, Theming, Security, Native

An analysis pass over both repositories (`warpcad` and `../warpcad-native`). Its only output is new
TODO files and their roadmap rows. It doesn't edit source code, and it doesn't commit.

Written for Claude Fable 5.2. Start a session in this repository with
`claude --model claude-fable-5-2` (high effort is the right starting point), then say
"Run `.claude/prompts/architecture-audit.md`". Expect a long run. It reads most of `src/` and the
native shell before filing anything.

Overlap with the other prompts: `project-audit.md` covers geometry correctness, the interaction
model, reachability, I/O, tests and docs. `componentize-audit.md` covers splitting large views.
This prompt covers structure, Vue component reuse, a theming architecture, security, and how the
app behaves inside the native shell. Where a finding belongs to one of the other two, leave it to
that prompt.

---

## Prompt

Audit WarpCad for code organization, code reuse (Vue components above all), themability,
security, and problems that appear only in the native app builds. Record every problem worth
fixing as a TODO file that `/fix-todo` can pick up later without re-reading this audit. This is
analysis only: change nothing outside `TODO/` in either repository, and don't commit.

### Read first

`CLAUDE.md` holds the architecture, the conventions, and the reasons behind them. `TODO/README.md`
holds the file template, naming, and the `model:` field. `TODO/ROADMAP.md` and the files in
`TODO/` and `TODO/done/` of **both** repositories show what is already filed. `docs/decisions/`
records settled choices. In the native repository, read `CLAUDE.md`, `TODO/README.md`,
`src-tauri/tauri.conf.json`, `src-tauri/capabilities/`, and `src-tauri/src/`. Then read the
code itself. Don't treat a file's name or a registry entry as evidence of what the code does.

### What to look at

The lists below are places where problems are likely, not a checklist. Follow the evidence. When
something matters more than anything listed here, file it.

**1. Code organization.** Does each module sit where `CLAUDE.md`'s Project Structure says it
should, and does it hold to that boundary? Things to check:

- whether `src/core/` and `src/native/` really are framework-free (no Vue, DOM, or three.js imports);
- whether any component mutates the document without going through the command layer;
- whether any store mirrors document state;
- whether any component does geometry math;
- whether any view goes much past the 30-template-line guideline;
- whether components are filed in the wrong category;
- circular imports, dead modules, and exports nothing uses;
- the same responsibility split across modules that don't know about each other.

**2. Code reuse, Vue components first.** There are about 125 `.vue` files. Look for markup,
styling, or behavior written more than once that should be one shared component or composable:

- sheets, popovers, dialogs, toasts, banners, chips;
- icon buttons, segmented toggles;
- unit-aware number fields, form rows;
- list rows with eye, delete, or bind affordances;
- drag-to-dismiss and focus-trap logic;
- outside-click handling, keyboard shortcuts.

For each cluster, name every copy by file, describe the shared shape, and say how the copies
differ. A difference may be deliberate, so look before calling it drift. Duplicated non-UI logic
across `src/` counts too.

**3. Themability.** The owner wants to restyle the whole UI by editing a small, known set of files.
Treat this area as a design, not just a hunt for hardcoded values. Work out:

- **The current state.** What `src/styles/tokens.css` defines, and every place that styles outside
  it. That includes colour literals in `<style>` blocks, inline `:style` bindings, SVG `fill` and
  `stroke`, and one-off spacing, radius, font, shadow, z-index, and motion values. It also includes
  colours set in JavaScript in `src/render/`: scene background, grid, gizmos, selection highlight,
  axes, dimension lines. If those don't read from the tokens, a theme change stops at the edge of
  the 3D view. The light theme counts as well: find what `prefers-color-scheme: light` misses.
- **The target.** Three things:
  - A token structure. Base values feed semantic roles, which feed component-level tokens if
    those earn their place.
  - A layer of base components: button, icon button, field, sheet, popover, dialog, toast, chip,
    list row, and whatever else the reuse audit turns up. Every other component builds from those,
    so restyling one base part restyles it everywhere.
  - A way to switch themes beyond `prefers-color-scheme`, if one is warranted.

  `controls/` and `display/` may be the right home for base parts, or a new category may be better.
  Adding a category changes `CLAUDE.md`'s Component Categories list, so recommend one and record it
  as a decision for the owner.
- **A guard.** Say how the rule gets enforced from then on. One option is a spec, modelled on
  `e2e/docs-media.spec.js`, that fails on a raw colour literal outside the token files. Another is
  a lint rule. The goal is that the next component can't quietly bring hardcoded styling back.
- **The renderer bridge.** Explain how the three.js side would read theme values without breaking
  the Performance rules: no per-frame allocation, and a re-read only when the theme actually
  changes.

File this area as one umbrella TODO that describes the target architecture and the order to build
it in. Then file one TODO per piece of work: tokens, the renderer bridge, each base component or
small group of them, migrating existing components onto them, and the guard. Chain them with
`depends:` so `/fix-todo` can take them one at a time. Each base-component TODO lists the existing
components that move onto it.

**4. Security.** Ground every finding in WarpCad's actual trust boundaries, not a generic web
checklist. The boundaries that matter here:

- **The BYOK API key** stored by `src/storage/tokenStorage.js`. Any script injection is key theft,
  so look for `v-html`, `innerHTML`, markdown or help rendering, and SVG import.
- **The Content Security Policy** and what `src/csp.spec.js` actually proves.
- **Untrusted documents.** A project opened from `#/gist/<id>`, a shared link, or a file. Its names,
  intent, and standing instructions must stay data and never become model instructions or markup.
  Check whether the tool-call limits in `src/ai/tools/` really hold.
- **Importers of hostile files** (STL, 3MF, STEP). Look for zip bombs in 3MF archives, triangle
  counts that exhaust memory, and malformed numbers that end up in geometry.
- **The MCP server** in `mcp/`. Look for path traversal in project paths, and whether the lock and
  atomic rename survive races.
- **The dev-only live bridge.** Confirm it can't end up in a production or native build.
- **What leaves the device.** Sentry and `src/analytics/` must not send document content, keys, or
  file paths.
- **The service worker and update flow.**
- **Any GitHub token or OAuth handling.**
- **The supply chain.** Production dependencies flagged by `npm audit`, and the `cargo deny`
  configuration in the native repository.

For the native shell, check:

- whether the capabilities and permissions are least-privilege;
- the CSP in `tauri.conf.json`;
- whether `withGlobalTauri` or IPC commands expose more than the web code uses;
- whether IPC handlers validate their input;
- navigation and deep-link handling;
- where native credentials will live (`M19-ai-025`).

Give each finding an attacker, an entry point, and an impact. Rank by impact times likelihood.

**5. Native app versions.** The app ships inside Tauri on iOS, iPadOS, macOS, Android, and Windows.
The web views there (WKWebView, Android WebView, WebView2) differ from the browsers the E2E matrix
covers. Look for browser APIs and assumptions the shell won't honour:

- the File System Access API, `<a download>` exports, `window.open` and external links;
- service-worker registration under a custom scheme, plus PWA install and update UI (`src/pwa.js`,
  `UpdateToast.vue`) showing where it makes no sense;
- `BASE_PATH` and asset URLs in `build:native`, and URL-hash handling under `tauri://`;
- cross-origin `fetch` to the Messages API and GitHub from a non-https origin;
- IndexedDB eviction and storage quotas on iOS, and memory ceilings for workers and large meshes;
- WebGL context loss when the app goes to the background (`M19-render-006` exists, so extend it
  rather than duplicate it);
- safe-area insets, the on-screen keyboard resizing the viewport, hover-only affordances, and
  clipboard permissions.

Check too whether `isNativeShell` branching stays inside `src/native/` or has spread through
components. For each risk, say which platforms it affects. When confirming it would need a device
or simulator, say so plainly. Mark the finding as a hypothesis, and put the device check in its
Testing section.

### Rules for the TODO files

- Follow `TODO/README.md` exactly: front matter, sections, naming. Use `kind: finding` and the
  `FIND-` prefix, unless a piece of work plainly belongs to an open milestone (most native-shell
  work belongs to M19).
- Ids are shared across both repositories. Take the next free `NNN` in each category by checking
  `TODO/` and `TODO/done/` in **both** repositories.
- File native-shell work (`src-tauri/`, capabilities, signing, platform configuration) in
  `../warpcad-native/TODO/`. File web code that misbehaves in the shell in `TODO/` here. Work that
  edits both repositories carries the `> Two repositories` banner that the native `TODO/README.md`
  describes.
- Give each new file a row in the matching table of `TODO/ROADMAP.md`. Findings go in "Findings
  (open rows)"; also update "All open work", following that file's "Keeping this file up to date"
  section. Then run `npm --prefix ../warpcad-native run roadmap:sync`.
- End every file with the SPDX marker `<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->`.
- Each file is one problem. Cite specific files and lines, and describe a concrete failure or cost.
  When the same pattern appears in many places, file one TODO that lists every instance, not one
  per instance. Leave out stylistic nits that have no real cost.
- Before filing, check what's already open or done in both repositories. If an existing TODO covers
  a problem, don't file it again. When a finding extends one, name that TODO in **Proposed fix** and
  put it in `depends:`. Where an existing skill does the mechanics (`/refactor-ui` for component
  extraction), say so instead of re-describing them.
- Set `model: opus` when the work matches the list in `TODO/README.md`. The theme architecture
  umbrella and the renderer bridge probably do.
- Fill in every UI-touching file's Testing section: the E2E spec, viewport and engine coverage,
  the docs page, and which `TODO/ACCEPTANCE.md` scenarios it re-drives. A restyle touches every
  screen, so the theming TODOs need snapshots at all three viewports in all three engines.

### How to work

You are working autonomously. The owner is not watching and can't answer questions mid-run, so
don't stop to ask permission for reading, searching, running the unit tests, or running
`npm audit`. Don't start the app with a real API key; mock the endpoint or leave that check to a
TODO.

Before you claim something is a problem, confirm it in the code. A finding that says "probably" or
"may" must say what would confirm it.

Hold the scope the owner set: five areas, and TODO files as the output. Don't fix anything you
find. If you can't finish one area, finish every other area in full, and say exactly what you
skipped and why.

### When you finish

Reply with:

- the number of TODOs filed in each area and in each repository, with their paths;
- your top five by priority, with one line each on why;
- a short outline of the proposed theming architecture: the token structure, the list of base
  components, and the guard;
- anything you couldn't verify without a device or a running build.

Then put each decision only the owner can make to them, through `AskUserQuestion` as `CLAUDE.md`
requires. Examples: a new component category, adopting a new dependency or lint rule, which themes
to support. Write each decision into the TODO it blocks first, so the record survives without the
answer.

---

## After the audit

- `/whats-next` shows where the new TODOs land in the ranked list.
- `/fix-todo <id>` runs one TODO. `/loop /run-todos` runs the backlog under `TODO/BUDGET.md`'s pacing.
- Component extractions from the reuse and theming areas run through `/refactor-ui`, one base
  component at a time, starting with the umbrella TODO's first step.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
