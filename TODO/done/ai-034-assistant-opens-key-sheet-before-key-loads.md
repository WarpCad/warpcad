---
title: Clicking Assistant before the stored key has loaded opens the key sheet, and it stays open
category: ai
kind: finding
priority: medium
model: sonnet
depends: []
status: done
---

**Shipped:** as proposed, with one narrowing. `open()` remembers the click only when the answer could be the key sheet; on the WebMCP and live-MCP routes chat is right with or without a key, so it opens at once (`ConnectClaudeCode.spec.js` calls `open()` without `start()` and caught this). A failed key load now still marks the store loaded, so a waiting click resolves to the key sheet. `doneWithKeySheet()` needed no change. The `e2e/ai-key.e2e.js` cases (saved key, no key) run in the default matrix; the scripted spec gained a click-straight-after-`goto` case, and 10 runs at default workers had no `assistant-panel` failure (the table above: 3 of 6 before).

## Problem

**In user terms:** click **Assistant** in the first moments after the app opens, and you can be asked for an API
key you have already saved.

**The race**, in `src/stores/assistant.js`: `open()` chooses the view once, from `hasKey`, at the moment of the click.
`start()`, which `AppView.vue` calls at boot without waiting (`void assistant.start()`), sets `hasKey` only after an
`await`. A click in that gap lands on `'key'`, and nothing moves it to `'chat'` when the key arrives.

**Reproduced with the scripted provider, where the gap is `await import('../ai/providers/scripted.js')`.** `perf-003`
(`376760a`) turned that import from static to dynamic, which added this await. `e2e/ai-scripted.e2e.js` fails intermittently at
its `openAssistant` helper: `assistant-panel` is never found. In the failing runs' page snapshots, `dialog "Assistant key"` is
open while the header button already reads `Scripted transcript …`, so the key had loaded and the view had not followed.

Measured 2026-11-02 on `chromium-laptop`, `E2E_DEV=1`, Chromium headless:

| Tree | Workers | Runs | Runs with a failure |
|---|---|---|---|
| `core-076`'s code (`3ecbaf8`, or the same code before committing) | default | 6, two of them with `node_modules/.vite` cleared | 3, all this race (2, 5 and 2 tests) |
| `core-076`'s code | 1 | 3, one with the cache cleared | 0 |
| `8137522`, before `core-076` | default | 6 | 4: 3 are this race, 1 is the failure described below |

A cleared Vite cache does not predict it: a warm run failed 5 tests, and a cold serial run passed. Parallel load widens the gap.

**Nobody saw this because** these specs need the dev server (`E2E_DEV=1`) and report themselves skipped in the default run, so the
full matrix stays green.

**The production path has the same shape, and that part is read from the code, not measured.** With no transcript, `start()` awaits
`deps.keyStore.load()` (IndexedDB) before setting `hasKey`, and that await predates `perf-003`. The window is likely very short in
a real session. The consequence would be someone with a saved key being shown the key sheet, which is why this is filed as a
product finding and not only as a flaky test.

**Not explained by this:** one of the six `8137522` runs failed differently, at `e2e/ai-scripted.e2e.js:376`, where `merge-banner-text`
never appeared after the AI turn landed (`the user moves the cube first, the Assistant fillets it`). It got past `openAssistant`, so it
is not this race. If it survives this fix, it needs its own finding.

## Interaction model

- **Precondition**: none. Unchanged.
- **Trigger**: the existing **Assistant** button (`assistant-button`), at any moment after it renders.
- **Feedback**: the chat opens if there is a key, the key sheet if there is none, whenever the click lands. With a slow load, the
  answer waits for the load and never shows the wrong one first.
- **Placement, selection response, selection count**: n/a.
- **Small-screen behavior**: same as desktop.

## Documentation

**No page changes.** No control is added or moved and no wording becomes wrong, so `docs/ai-partner.md` has nothing new to explain, and no
shot or movie changes.

## Affected files

- `src/stores/assistant.js`: `open()`, `start()`
- `src/stores/assistant.spec.js`
- `e2e/ai-scripted.e2e.js`

## Proposed fix

**Let the choice wait for the answer.** The store already has `loaded`. If `open()` runs while it is false, remember the request instead of
choosing a view, and have `start()` make the choice when it finishes, on every path including a failed key load. If it is already loaded,
behave exactly as today.

- Closing, or any other view change, before the load finishes clears the remembered request, so a cancelled click does not open a panel later.
- `doneWithKeySheet()` has the same `hasKey` read. It is reached only from an open sheet, so it needs no change, but confirm that while here.
- **Do not fix this by awaiting in the spec's helper.** That would turn the test green and leave the race.
- **Do not fix this by making the import static again.** That undoes `perf-003` and leaves the production path as it is.

## Effort

S.

## Testing

- **Unit, `assistant.spec.js`, written first and failing**: `start()` held on a deferred key load; `open()`; the load resolves with a key: the view
  is `chat`, never `key`. The same with no key: `key`. With a rejected load: `key`, and not stuck. `open()`, then `close()`, then the load resolves:
  `closed`. `open()` after the load: unchanged.
- **E2e, `e2e/ai-scripted.e2e.js`, navigates to `/`**: no new spec is needed for the race itself. The existing spec is the check: 10 consecutive runs at
  default workers on `chromium-laptop` with `E2E_DEV=1`, zero `assistant-panel` failures, against the rate in the table above. Add one case that clicks
  **Assistant** straight after `goto`, without waiting for `data-webgl`.
- **Default-run reachability**: `e2e/ai-key.e2e.js` already drives a real key sheet on the production build. Add the no-key click there, so the production
  path has a check that runs in the default matrix.
- **Viewports**: same as desktop, so no new snapshots.
- **Engines**: Chromium for the scripted spec (it is dev-only, and the race is store logic). The `ai-key` case takes that spec's existing matrix, since it
  touches IndexedDB persistence.
- **Acceptance scenarios to re-drive**: 17, 18 and 24 (each opens the Assistant).
- **Closed findings whose repros must be re-run**: `perf-003`, confirming the scripted provider is still not in the production bundle.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
