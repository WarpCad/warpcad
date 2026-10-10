---
title: Re-capturing a placed user part whose definition ends in a translate refuses on the exact-geometry check
category: core
kind: finding
priority: low
model: sonnet
milestone: M9
depends: [core-037, core-054]
status: open
---

## Problem

Found by the `core-054` agent. Place a user part, then select it and **Save to library...** again: when the
part's own definition ends in a translate, `capturePart` refuses with "its history doesn't rebuild to exactly
the same geometry". It reproduces at baseline with no colour involved, so it is not a `core-054` regression.

## Reproduction

1. Save any group whose last build step is a translate as a part.
2. Drag it in from My parts, select the copy, choose Save to library... again.
3. Expected: a second part. Actual: refused on the exact-geometry check.

## Proposed fix

Unconfirmed. Start by finding which step the rebuild disagrees on (`sameGeometry` against the placed body) and
whether the translate is re-keyed or re-applied twice when a placed part is captured.

## Affected files

`src/core/userPart.js`, `src/core/userPart.spec.js`.

## Effort

S.

## Testing

- **Unit**: capture a placed part whose definition ends in a translate; the result must expand to the same body.
- **Acceptance**: 3 and 6; re-run the `ui-055` and `core-054` repros.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
