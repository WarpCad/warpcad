---
title: Saving a group as a user part drops its user colour overrides
category: core
kind: finding
priority: low
model: sonnet
milestone: M9
depends: [core-037, ui-055]
status: open
---

## Problem

`capturePart` (`src/core/userPart.js`) rewrites a body's lineage into a part, and verifies the result
against the body's geometry. A **user colour override** (`style.recolor` / `Body.colorOverrides`, set from
the Inspector's Color control) lives beside the lineage, not in it, so a group recoloured by hand saves as a
part in its default colours and the placed copy does not match the original. Known and documented in
`docs/decisions/user-library.md` ("Known limits in v1"); `ui-055` made it reachable from a button.

## Reproduction

1. Place a Cube and a Cylinder, Combine into group, set the group's colour in the Inspector.
2. Save to library... as Standoff, then File > New and drag Standoff in.
3. Expected: the same colour. Actual: the default colour.

## Proposed fix

Carry the colour overrides as a `style.recolor` step inside the captured records (the allowed-ops list
already permits `style.`), re-keyed to the part's local ids, and extend `sameGeometry`'s check to cover it.

## Affected files

`src/core/userPart.js`, `src/core/userPart.spec.js`.

## Effort

S.

## Testing

- **Unit**: capture a recoloured group, expand, assert the colours; the replay must still equal the body.
- **Acceptance**: 3 and 6 (composite placement); re-run the `ui-055` repro above.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
