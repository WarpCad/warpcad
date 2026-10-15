---
title: Phone library item — pick the handset model and its case, enlarge the case with parameters, and make the body and every camera plateau separately selectable
category: core
kind: feature
priority: medium
model: sonnet
milestone: M16
depends: []
status: done
---

> **Shipped (2026-10-15).** As specified, with these decisions written down: a record with none of `model`, `case`, the enlarge fields or `plateauClearance` takes the legacy path (one fused `phone` body); otherwise the model path emits named records `body`, `plateau` (`plateau2`, ... where a table row has more). A numeric param **present in the record is an override**; absent follows the table; a record holding the complete legacy eight, still at the old defaults, treats them as unedited so choosing a model resizes it. A record naming a model but no case behaves as `TechWeave`. `TechWeave` is geometry-exact only on the iPhone 17 Pro; on another handset it adds the same margins (a lenient superset of "iPhone 17 Pro only", so the Library dropdown never offers a choice that throws). Android rows could not be read from Samsung's or Google's own pages (truncated fetches), so all three are `estimate`; the Galaxy S25/S25+ and Pixel 10 were not found and are left out. Every plateau is an `estimate`. Added `OpUi.extraChoices` (a second pre-drag dropdown), `OpUi.nameFor` (the dropped name, `iPhone 17 Pro in Slim case 1`) and `OpUi.absent` (what a record without a key behaves as). The Phone row is labelled `Phone`.

## Goal

Requested by the user on 2026-10-15. The `kit.phone` row ("Phone (iPhone 17 Pro, TechWeave)") was
added by accident while testing the MCP server, and it turned out to be useful: it is the stand-in
you *subtract* from a plate so a phone can lie flat despite its camera plateau. Today it is one
hard-coded estimate (77 × 157 × 9 mm slab, 74 × 46 × 4 mm plateau), fused into **one** body named
`phone`, so you cannot pick the plateau on its own and you cannot choose another handset.

"Done" is:

1. A **Model** dropdown beside the Library row, in the same place and with the same behaviour as the
   Raspberry Pi row's Model dropdown, listing the popular handsets below (iPhones *and* Android).
2. A **Case** dropdown beside it: `None`, plus a few case styles, so the placed object is the handset
   alone or the handset in a case.
3. Parameters in the Inspector that **enlarge the case** (an added margin per axis, and one overall
   enlarge) so a case that is a millimetre bigger than the preset takes one edit, not seven.
4. The result is a **group** whose parts are separately selectable: at minimum `body` and
   `plateau`, and one part per extra raised feature a model has (`plateau`, `plateau2`, a separate
   lens ring). An iPhone 17 Pro has two selectable items; a phone with a camera island plus a
   flash/sensor bump has three.
5. Subtracting **only the plateau** from a plate (select the plate, then the plateau part) cuts the
   pocket without cutting the whole slab, which is the thing people actually do with this part.

Nothing about *how it is used* changes: it is still a stand-in you cut with, not a part you print,
and it still lies back-face-down with the plateau protruding toward −Z at the +Y end.

## Interaction model

- **Precondition** — none; it is a creation action, so it follows the Library's placement rules.
- **Trigger** — the existing Library row, now with **Model** and **Case** dropdowns beside it (choose
  them *before* you drag, as with the Raspberry Pi row; both are also editable afterwards in the
  Inspector, where a changed model rebuilds the same group in place).
- **Feedback** — a preview follows the pointer and the group commits on release. The Inspector
  names the group `<Model>[ in <case>]`, e.g. `iPhone 17 Pro in Slim case`, and lists the parts.
- **Placement** — drag into the 3D view (preview follows the pointer, commit on release), like every
  other Library part (`CLAUDE.md` Interaction Model). Do not spawn at the origin.
- **Selection response** — clicking the body selects the group; the second click on a part drills
  into it (`ui-016`), exactly as it does for a Pi's `ethernet`. The breadcrumb reads
  `iPhone 17 Pro 1 › plateau`.
- **Selection count** — the part-level Subtract above needs the plate **and** one part: two
  operands, addressed with `{ id, pieces }` (`core-024`), so the existing Subtract enablement rule
  applies unchanged.
- **Small-screen behavior** — the two dropdowns sit under the row on a phone, 44 px tall; the
  Library sheet already does this for the Pi's Model dropdown, so reuse that row component.

## What to look up, and what has already been found

The implementing agent must **cite a source and a retrieval date for every row** it adds to the
table, mark each row `verified` (manufacturer's own spec page) or `estimate`, and refuse to ship a
number it cannot source. A spec-sheet *outer size* is a published number; a **plateau size and
height** almost never is, so those are estimates until someone puts calipers on a handset (the
module comment in `recipes/kit.phone.js` already says nobody should trust a spec sheet over calipers).

### Handset outer size (height × width × depth, mm)

Retrieved 2026-10-15 from Apple's iPhone comparison page (`apple.com/iphone/compare/`), so these are
**verified** for Apple. Depth is Apple's published depth, which does not include the camera plateau.

| Model | Height (Y) | Width (X) | Depth | Plateau data |
|---|---|---|---|---|
| iPhone 17 Pro | 150.0 | 71.9 | 8.75 | none published; estimate |
| iPhone 17 Pro Max | 163.4 | 78.0 | 8.75 | none published; estimate |
| iPhone 17 | 149.6 | 71.5 | 7.95 | none published; estimate |
| iPhone Air | 156.2 | 74.7 | 5.64 | none published; Apple's depth excludes the camera bar |
| iPhone 16 Pro | 149.6 | 71.5 | 8.25 | none published; estimate |
| iPhone 16 Pro Max | 163.0 | 77.6 | 8.25 | none published; estimate |
| iPhone 16 | 147.6 | 71.6 | 7.80 | none published; estimate |
| iPhone 16 Plus | 160.9 | 77.8 | 7.80 | none published; estimate |
| iPhone 16e | 146.7 | 71.5 | 7.80 | none published; estimate |
| iPhone SE (3rd gen) | 138.4 | 67.3 | 7.3 | none published; estimate |

The compare page lists many older iPhones (back to the iPhone 7); include as many as are cheap, but
the first release needs the current line-up plus the SE.

Android, from the search done for this TODO. **These are not yet verified against the manufacturer's
own page** and the first row came from a third-party database (GSMArena), so treat each as an
`estimate` until the implementing agent fetches the manufacturer's page:

| Model | Height (Y) | Width (X) | Depth | Status |
|---|---|---|---|---|
| Samsung Galaxy S25 Ultra | 162.8 | 77.6 | 8.2 | third-party, one fetch |
| Google Pixel 10 Pro | 152.8 | 72.0 | 8.6 | third-party comparison sites; one lists 8.5 |
| Google Pixel 10 Pro XL | 162.8 | 76.6 | 8.5 | one source |
| Samsung Galaxy S25 / S25+ | — | — | — | **not found**; fetch Samsung's spec page |
| Google Pixel 10 | — | — | — | **not found**; fetch Google's spec page |

(Two of the fetches in the search returned a page for a different phone than the URL guessed, which
is why every Android row is flagged. Do not copy a number whose page you did not read.)

### Case sizes

Only **one** case has a manufacturer-published size so far: OtterBox's own listing for the
**Defender Pro for iPhone 17 Pro** is 161.75 × 84.65 × 16.73 mm. Against the bare phone
(150.0 × 71.9 × 8.75) that is **+11.75 mm length, +12.75 mm width, +7.98 mm depth**, i.e. roughly
6 mm of wall per side and 8 mm front-to-back. A UK retailer listed 161.5 × 84.4 × 15.1 for what is
probably a different variant, so the same product line varies by a millimetre or more depending on
the SKU. That is the case for the enlarge parameters below.

Apple's own cases and thin cases do not have published dimensions in the sources found. The
presets below are therefore **estimates** that the implementing agent must label as such, and the
Documentation must say plainly that they are a starting point to adjust:

| Case preset | Added per side (X, Y) | Added depth | Basis |
|---|---|---|---|
| `None` | 0 | 0 | the bare handset |
| `Slim` | ~1.5 mm | ~1.5 mm | estimate; typical thin silicone or clear case |
| `Protective` | ~3 mm | ~3 mm | estimate; typical dual-layer case |
| `Rugged` | ~6 mm | ~8 mm | OtterBox Defender Pro 17 Pro, above (the one cited data point) |
| `TechWeave` | 2.55 mm X, 3.5 mm Y | ~0.25 mm | the original default, kept at the user's request; an estimate, iPhone 17 Pro only |
| `Custom` | the three enlarge fields only | | the user's own caliper readings |

The existing default (77 × 157 × 9 mm, "TechWeave") is ~+5 mm width and ~+7 mm length over an iPhone
17 Pro, so it is a `Slim`-to-`Protective` case. **Decided by the user on 2026-10-15: keep it.** It
stays as its own case preset, `TechWeave` (iPhone 17 Pro only), with exactly today's numbers
(77 × 157 × 9 mm, corner radius 12, plateau 74 × 46 × 4 mm, plateau corner radius 10), listed in the
**Case** dropdown beside `Slim`, `Protective` and `Rugged`. Choosing it reproduces the old default
geometry, and it is the case the legacy path (no `model` param) maps to. Its numbers are the
estimates they always were; label them so, as with the other presets.

## Parameters

On top of the existing numeric params (`width`, `length`, `thickness`, `cornerRadius`,
`plateauWidth`, `plateauLength`, `plateauHeight`, `plateauCornerRadius`), the Inspector gains:

- `model` (enum) and `case` (enum), as above. Changing either re-derives the numeric params from the
  table; a numeric param the user has since edited by hand is kept (`customized` flag, the way
  `hardware.bolt`'s `fit` follows `spec` only until edited — decide the exact rule in Step 2 and
  write it down).
- `caseEnlarge` (mm, default 0): added to **all three** outer dimensions at once, applied on top of
  the preset. "My case is a millimetre bigger" is one field.
- `caseEnlargeX`, `caseEnlargeY`, `caseEnlargeZ` (mm, default 0): per-axis, added on top of
  `caseEnlarge`, for a case that is fatter than it is long.
- `plateauClearance` (mm, default 0): added around every plateau so the cut-out is not a press fit.
  This is separate from the case enlarge because a pocket wants slack that the outer slab does not.

All are plain millimetres, validated as finite and non-negative with the existing
`requirePositiveMm` / `requireCornerRadiusMm` helpers, and bound-able to a project variable
(`ui-059`) like any other numeric param, so one `caseSize` variable can drive several parts.

## The group and its parts

`kit.phone` stops fusing the slab and the plateau with `boolean.union`. It emits **named records**
instead, as `raspberrypi.bplus` does for its connectors, so each is an addressable part:

- `body` — the rounded-rectangle slab (handset plus case).
- `plateau` — the principal camera plateau (and `plateau2`, `plateau3` for models with more raised
  features, named by what they are where the table knows: `cameraBar`, `lensRing`). Each plateau
  record carries its own width, length, height, corner radius and **position on the back** (an X/Y
  offset from the +Y edge), because they are not all flush with the +Y edge the way today's single
  block is: the Pixel's bar spans the width, the Pro iPhones' plateau sits in a corner of the back.
- The group's name is the handset's, so the Inspector header and the BOM read
  `iPhone 17 Pro in Slim case`, not `phone`.

Keep **parts addressable by name** across a model change where the same feature exists in the
target model (`plateau` stays `plateau`), the way `BPLUS_PART_ALIASES` keeps a Pi's connector names
through a revision change, so a Subtract that references `plateau` survives switching the handset.

## Compatibility — old documents must replay unchanged

Projects saved before this task have `kit.phone` records with **no `model`/`case` params** and a
single fused `phone` body. They must keep producing the same geometry and the same part names.
Recommended: when `model` is absent the recipe takes the legacy path (one fused `phone` body, the
defaults above), and a *new* placement always writes `model` and `case`. State the choice in Step 2
and add a replay test with a pre-change record, as `ui-060` did with `snapAlignReplay.spec.js`.
Do not change the op name; the registry key stays `kit.phone`.

## Affected files

- `src/core/kernel/recipes/kit.phone.js` — the recipe: table lookup, the enlarge params, named
  multi-plateau parts, legacy path.
- `src/core/kernel/recipes/phoneModels.js` (new, data only) — the handset table with `source`,
  `retrieved`, and `verified | estimate` on every row. Pure data, no imports, so a spec can assert
  that every row carries a source and a status.
- `src/core/kernel/registry.js` — the `kit.phone` entry (label, `defaults`), a `PARAM_SCHEMAS` entry
  with `enumParam('Model', …)` and `enumParam('Case', …)` like `raspberrypi.bplus`, and the
  `partAliases` map if any part is renamed between models.
- `src/core/kernel/recipes/kit.phone.spec.js` — extend; see Testing.
- `src/core/library.spec.js` — the row label (`Phone (iPhone 17 Pro, TechWeave)` is asserted at
  lines 147-153 and 337).
- The Library row component and its Model-dropdown wiring, wherever the Pi row's dropdown is
  rendered — find it by grepping for the `model` param rather than adding a second mechanism.
- `docs/hardware-library.md` ("Cutting a pocket for a phone's camera plateau"),
  `docs/primitive-placement.md` (the kit-parts table, line ~132), `e2e/docs/` (see Documentation).
- `src/ai/tools/` — if the tool descriptions list `kit.phone`'s params, update them so the AI
  partner can choose a model and a case by name.

## Effort

M. The table and the recipe are straightforward; the care is in (a) getting every number sourced and
flagged honestly, (b) the legacy path, and (c) keeping a part's name stable across a model change.

## Testing

- **Unit** (`kit.phone.spec.js`, `phoneModels.spec.js`), explicit tolerance with `toBeCloseTo`:
  - every table row has `source`, `retrieved` and a `verified|estimate` status, and a width/length
    /depth that are finite and positive;
  - for each model with `case: 'None'` the body's bounding box equals the table's size (the oracle is
    the table, not the recipe's own arithmetic); with a preset it is larger by exactly the preset's
    added amounts; `caseEnlarge` and the per-axis fields add exactly what they say, in every
    combination, including all zero and a negative value (rejected with the module's usual wording);
  - the result has the expected named parts (`body`, `plateau`, and the extras for a three-part
    model), each addressable with `{ id, pieces }`, and `bodies()` reports **one** group;
  - degenerate cases: a plateau larger than the slab (already refused — keep it), a corner radius
    larger than half the short side, a zero-extent plateau, `plateauClearance` large enough to
    reach the slab edge;
  - the legacy path: a pre-change `kit.phone` record replays to the same bounds and the same single
    part name `phone` (a hand-pinned fixture, not regenerated from the new code).
- **Subtract the plateau alone**: a unit or integration test that a plate minus `{ id, pieces:
  'plateau' }` has a pocket of `plateauHeight` and a flat top elsewhere, and that subtracting the
  whole group cuts the slab as well (so the two are visibly different results).
- **E2E** (`e2e/phone-library.e2e.js`, navigates to `/`, real mouse): choose a model and a case in the
  Library row, drag it in, assert the Inspector's group name and parts list, click a plateau and
  assert the breadcrumb, change the model in the Inspector and assert the same parts rebuilt in
  place, edit `caseEnlarge` and assert the body's dimensions change by that amount. Runs at all three
  viewports (the dropdown layout differs at 390 px) and on **all three engines** (the Library drag
  and a WebGL snapshot are engine-sensitive, per `CLAUDE.md`).
- **Acceptance scenarios to re-drive by hand**: **3** (a Library drag renders complete, not partial —
  this is a Library drag that now makes a multi-part group), **4** (boolean gating with a plate and a
  *part* of a group selected), **6** (group versus sub-part selection), and **10** (save and reload
  keeps the model, the case and the enlarge values). Report PASS/FAIL for each.
- **Closed findings whose repro gets re-run**: `ui-016` (drill into a sub-part and step back out),
  `ui-035`/`ui-063` (a sub-part as an operand on either side of Snap/Align — the plateau is a new
  kind of sub-part), `core-024` (`pieces` addressing), and the finding that introduced `kit.phone`'s
  Subtract recipe in `docs/hardware-library.md`.

## Documentation

- **Page** — `docs/hardware-library.md`, rewrite "Cutting a pocket for a phone's camera plateau" for
  the new row, and `docs/primitive-placement.md`'s kit-parts table (the Phone row and its defaults).
- **Example** — "Open **Library → Kit Parts**. Next to **Phone** choose **Model: iPhone 17 Pro** and
  **Case: Slim**, then drag it onto the grid. Select the phone: the Inspector reads *iPhone 17 Pro in
  Slim case* and lists `body` and `plateau`. Your case is a millimetre bigger than the preset? Set
  **Case enlarge** to `1`. Place a Board under it so the phone's back sits on the board's top face,
  select the **board**, then click the phone twice to select its **plateau**, and press **Subtract**:
  the board has a camera-bump pocket and is flat everywhere else."
- **Be honest in the page** about the numbers: the handset sizes are manufacturers' published outer
  sizes; plateau sizes and case margins are estimates until measured, and a printed case pocket
  should be test-fitted. Link to the sources the table carries rather than restating them.
- **Media** — `e2e/docs/` shot(s) for the Library row with its two dropdowns, the placed group with
  the plateau selected, and the Subtract result; generated by `npm run docs:media`, never by hand,
  and `e2e/docs-media.spec.js` must stay green (no orphan, no dead link).

## Notes

- The tool's name still says "TechWeave" in the registry label and `library.spec.js`; that label goes
  away with this task (the preset is `Slim`/`Protective`, the model is chosen in the dropdown).
  Update the two spec assertions together with the label.
- Not in scope: a hole or button layout on the phone's edges, a MagSafe ring, tablets, folding
  phones (the iPhone Duo in Apple's compare table changes size when opened), or *printing* the case.
  File separately if wanted.
- `ui-061`'s help topics: if the Library row gets a `?`, point it at the rewritten section, and add
  the new heading to `src/help/topics.js` (its spec builds the real docs, so a renamed heading fails
  loudly).

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
