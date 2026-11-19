---
name: add-clearances
description: Open a fit gap between WarpCad parts that must go together, such as a peg in a socket, a part in a pocket or a lid on a box. Use when the user asks for clearance, tolerance, a looser or tighter fit, or says printed parts do not fit.
license: CC-BY-SA-4.0
---

# Add clearances to a group

Takes a group of parts that must fit together, and opens a gap on every face where one part meets another. Every gap is a step in the History, so it survives a rebuild.

## The rule for the gap

This rule is stated once here. The other steps refer back to it.

- The clearance is **per side**. It is the gap between one face and the face it meets, so a 10 mm peg in a socket with 0.2 mm clearance has a 10.4 mm hole.
- The clearance is an input. Use the number the user gives. If they give none, use the default for how the part is made:
  - FDM print: **0.2 mm** per side for a snug or press fit, and 0.4 mm for a sliding fit.
  - Resin and CNC defaults are not set yet. For those processes, ask for the number.
- Cut the gap into the **printed** part, never into a bought one. For a bolt, nut, washer or bearing, choose its `fit` param instead (`"close"`, `"loose"`, `"clearance"`). A split made with `modify.splitWithJoint` already has its own `clearanceMm`.
- Prefer making the hole bigger to making the part that goes in smaller. Shrinking a part also shrinks any hole through it.

## 1. Find the mating pairs

1. Call `describe_scene` to get the group's bodies and their parts. Call `describe_body { id }` to get each body's op, params, centre and rotation. For one part of a group, call `describe_step { id: "<group>", part: "<part name>" }` to get the op and params of the step that made it.
2. A mating pair is a part that goes in (A) and the part it goes into (B). For each pair, call `check_clearance { a, b }`. If they overlap, or the gap is under the clearance, the pair needs a gap.
3. `check_clearance { a, b }` takes whole bodies. For two parts of one group, pass the group as `a` and `b`, with `aPieces` and `bPieces` naming the parts (comma-separated if there is more than one). `measure { ids }` takes whole bodies only. To read one part's size, use `evaluate_formula { formula }`, for example `[Bracket].[pin].width`.

## 2. Open the gap, one pair at a time

**If A was made by a single create step** (`describe_body` shows a Library op such as `primitive.cylinder`), cut B with a copy of A that is offset by the clearance. `copy` makes a new body with A's op and params, standing exactly where A stands. Send it as one `apply_records { steps }` call, so the cutter and the cut land together:

```
apply_records { steps: [
  { copy: { id: "<A>", name: "<A's name> cutter" } },
  { operate: { op: "modify.offset", operands: [{ id: "@1" }], params: { distanceMm: 0.2 } } },
  { operate: { op: "boolean.subtract", operands: [{ id: "<B>" }, { id: "@2" }] } }
] }
```

- `distanceMm` is the clearance itself, not twice it. Every face of the copy moves out by that distance, so every face A meets gets the clearance, and the offset is exact for a box, an L-shape and a round pin alike. Where A sticks out of B, the extra growth is harmless. If `modify.offset` refuses (a thin feature, or two faces in one plane facing opposite ways), say so, and for a box or a round pin fall back to `modify.enlarge` with `deltaMm` of `[0.4, 0.4, 0.4]` (2 × clearance on every axis, never 0 on an axis).
- `copy` copies only the step that made A, not a later turn. If A has turned (its rotation is not `[0, 0, 0]`), add `{ operate: { op: "transform.rotate", operands: [{ id: "@1" }], params: { deltaDeg: <A's rotation> } } }` and then `{ operate: { op: "group.align", operands: [{ id: "@1" }, { id: "<A>" }], params: { axes: "xyz" } } }` after the copy step, and shift the later `@n` numbers to match.
- The subtract uses up the cutter and returns B's new id. Use that id from now on.

**If A and B are parts of one group** (`describe_scene` lists them under `parts`; the user says "the group called Housing"), address B as `{ "id": "<group>", "pieces": "<B's part name>" }`. A subtract with that base keeps the group's other parts, so the group is not rebuilt. Call `describe_step { id: "<group>", part: "<A>" }` to read the op and params of the step that made A. If that op is a Library op (a box, a round pin, a cone), copy A with `copy { id: "<group>", part: "<A>" }`. The copy stands where A stands in the group, even after the group has moved, so it is exact for a round pin as well as a box:

```
apply_records { steps: [
  { copy: { id: "<group>", part: "<A>", name: "<A> cutter" } },
  { operate: { op: "modify.offset", operands: [{ id: "@1" }], params: { distanceMm: 0.2 } } },
  { operate: { op: "boolean.subtract", operands: [{ id: "<group>", pieces: "<B>" }, { id: "@2" }] } }
] }
```

The subtract returns a new id for the group (the last `applied` row's `bodyId`), and that body keeps all the group's parts. Only B is cut. Use the new id from now on. Its name is now "Subtract 1", so give it the group's old name back with `operate { op: "style.rename", operands: [{ id: "<new id>" }], params: { name: "<group's name>" } }`. Tell the user that the old steps stay in the History.

If `describe_step` says A has no step of its own (it is made inside a recipe, like a Raspberry Pi's mounting hole), or A's op is not a Library op (a Union, say), `copy` refuses. If A is a box, measure it with `evaluate_formula`: `[<group>].[<A>].width`, `.depth`, `.height` and `.min.x`, `.min.y`, `.min.z`. Then use a `primitive.cuboid` of that size as the first step, with `positionMm` at the centre of its footprint and its lowest Z. If A has any other shape, do not build a cutter for it: say so, and leave that pair alone.

**If A was built by several steps**, and has no hole running across the fit, shrink A instead: `operate { op: "modify.offset", operands: [{ id: "<A>" }], params: { distanceMm: -0.2 } }`. The shrink takes the clearance off every face, and it is exact on facets. If it refuses because a wall or pin is thinner than twice the distance, say which feature, and leave that pair alone.

**If the user may want to tune the fit later**, define the gap once. Call `define_variable { name: "clearance", kind: "number", value: 0.2, unit: "mm", min: 0, max: 1 }`. Then bind the offset's `distanceMm` to `clearance` directly wherever `list_variables { id }` offers it (a fallback `modify.enlarge` binds its `deltaMm` slots to `define_formula { name: "clearanceTotal", formula: "2 * clearance" }`). After that, a single `set_variable { name, value }` re-fits every pair.

## 3. Check your work

1. Call `check_clearance { a, b }` for every pair of separate bodies, and with `aPieces` and `bPieces` for every pair of parts in one group. There should be no overlap volume, and a gap within 0.01 mm of the clearance (an offset gives exactly the distance on a flat face; curved faces are tessellated, so 0.2 mm can read about 0.198). A gap of 0 means a face still touches. Find that face, and open it or say why it stays.
2. Call `measure { ids }` on every whole body you changed. Its size should have changed by exactly what you meant, and by nothing else. For a part inside a group, check its size with `evaluate_formula`.
3. Call `get_timeline` and confirm no step is broken.
4. Call `check_printability { ids }` on each printed part. A clearance can thin a wall below 1.2 mm.
5. Tell the user the clearance you used and where it came from (their number, or the FDM default). Give each pair's measured gap, and anything you could not measure.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
