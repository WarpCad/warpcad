---
title: prompt-response phone test races the Inspector's object list (instant isVisible)
category: testing
kind: finding
priority: high
model: sonnet
milestone: none — found while closing io-023 (filed and closed 2026-10-30)
depends: []
status: open
---

> **Status (2026-10-30): NOT fixed.** The wait below was tried, and the full matrix still fails this
> test on `chromium-phone`, with a different symptom: `object-list` resolves but stays `hidden` for
> the full 5 s, so the Inspector's objects section never expands under load. The instant-read theory
> was wrong. The spec passed alone on all nine projects with the wait, which is not enough evidence
> of a fix. Open question: why does the objects section stay collapsed on phone in the working tree
> when HEAD passes? Suspect a store or document-load difference from `io-023`'s changes; bisect first.

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
