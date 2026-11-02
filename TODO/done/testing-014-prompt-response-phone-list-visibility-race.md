---
title: prompt-response phone test races the Inspector's object list (instant isVisible)
category: testing
kind: finding
priority: high
model: sonnet
milestone: none — found while closing io-023 (filed and closed 2026-10-30)
depends: []
status: done
---

> **Shipped (commit `ad06915`, 2026-11-01; re-checked 2026-11-02).** The fix
> that landed is not the one proposed below. The root cause was the instant `isVisible()` read
> right after `page.reload()`: the phone tab was not laid out yet, so the helper skipped opening
> the sheet. `selectFromList` in `e2e/prompt-response.e2e.js` now waits for the tab, the list or
> the header before it reads any of them. Waiting on the list or header alone cannot work with
> nothing selected, because the header is absent then. The full e2e run on the current tree
> (`.todo-progress/_runs.json`, fingerprint-matched to this tree) passed with 0 failures.
>
> The `io-023` theory in the 2026-10-30 note below was not the cause; the bisect in `ad06915`
> answered its open question. The rest of the file is kept as the record of the investigation.

> **Status (2026-10-30): NOT fixed.** The wait below was tried, and the full matrix still fails this
> test on `chromium-phone`, with a different symptom: `object-list` resolves but stays `hidden` for
> the full 5 s, so the Inspector's objects section never expands under load. The instant-read theory
> was wrong. The spec passed alone on all nine projects with the wait, which is not enough evidence
> of a fix. Open question: why does the objects section stay collapsed on phone in the working tree
> when HEAD passes? Suspect a store or document-load difference from `io-023`'s changes; bisect first.

**Decided 2026-10-31:** fix this before pushing `406b4ba` (io-023's retirement commit). Bisect first: the phone objects section stays collapsed, which is probably caused by io-023's changes.

**Decided 2026-11-01:** run this before `build-017`; it is row 0 of Next up in `TODO/ROADMAP.md`. The push of the 8 unpushed commits waits on it.

## Problem

`an agent's record_response shows under the request at once, and is saved` (`ai-032`'s spec) failed
only on `chromium-phone`, in the full matrix and alone (`locator.click: … waiting for
getByTestId('inspector-objects-header')`). The same test passes at HEAD in under 2 s.

Debugging with a temporary copy showed that HEAD and the working tree are in the same state right
after the Inspector opens: tab visible, closed, one body, `object-list` in the DOM and `empty`
panel state. The difference is timing. An instant `isVisible()` read returned false while the list
was still opening. With a 500 ms wait before the read, the test passed.

## Fix

Wait for `object-list` or `inspector-objects-header` to be visible, then keep the existing check to
choose which one to click. The assertion, the row click and the name check are unchanged.

## Interaction model

n/a — test-only change.

## Documentation

n/a — no user-visible behaviour.

## Testing

- `e2e/prompt-response.e2e.js` on all nine projects: 18 passed.
- Full matrix on the final tree: this spec must stay green there (see io-023's Step 5 run).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
