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

1. Call `describe_scene` to get the group's bodies and their parts. Call `describe_body { id }` to get each body's op, params, centre and rotation.
2. A mating pair is a part that goes in (A) and the part it goes into (B). For each pair, call `check_clearance { a, b }`. If they overlap, or the gap is under the clearance, the pair needs a gap.
3. `check_clearance { a, b }` takes whole bodies. For two parts of one group, pass the group as `a` and `b`, with `aPieces` and `bPieces` naming the parts (comma-separated if there is more than one). `measure { ids }` takes whole bodies only. To read one part's size, use `evaluate_formula { formula }`, for example `[Bracket].[pin].width`.

## 2. Open the gap, one pair at a time

**If A was made by a single create step** (`describe_body` shows a Library op such as `primitive.cylinder`), cut B with a copy of A that is 2 × clearance bigger. Send it as one `apply_records { steps }` call, so the cutter and the cut land together:

```
apply_records { steps: [
  { create: { op: "<A's op>", positionMm: [0, 0, 0], params: <A's params, without center> } },
  { operate: { op: "group.align", operands: [{ id: "@1" }, { id: "<A>" }], params: { axes: "xyz" } } },
  { operate: { op: "modify.enlarge", operands: [{ id: "@1" }], params: { deltaMm: [0.4, 0.4, 0.4] } } },
  { operate: { op: "boolean.subtract", operands: [{ id: "<B>" }, { id: "@1" }] } }
] }
```

- `deltaMm` is 2 × clearance on every axis, which gives the clearance on every face A meets. Where A sticks out of B, the extra growth is harmless.
- If A has turned (its rotation is not `[0, 0, 0]`), turn the copy the same way with `transform.rotate` before the align step.
- The subtract uses up the cutter and returns B's new id. Use that id from now on.

**If A and B are parts of one group** (`describe_scene` lists them under `parts`; the user says "the group called Housing"), address B as `{ "id": "<group>", "pieces": "<B's part name>" }`. A subtract with that base keeps the group's other parts, so the group is not rebuilt. No tool shows a part's op or params (`get_timeline` has no params), so measure A with `evaluate_formula`: `[<group>].[<A>].width`, `.depth`, `.height` and `.min.x`, `.min.y`, `.min.z`. Then build the cutter as a `primitive.cuboid` of that size, with `positionMm` at the centre of its footprint and its lowest Z. This is exact only for a box. If A is round or otherwise shaped, do not build a cutter for it: say so, and leave that pair alone.

```
apply_records { steps: [
  { create: { op: "primitive.cuboid", positionMm: [<A's centre x>, <centre y>, <A's min z>], params: { size: [<A's width>, <A's depth>, <A's height>] } } },
  { operate: { op: "modify.enlarge", operands: [{ id: "@1" }], params: { deltaMm: [0.4, 0.4, 0.4] } } },
  { operate: { op: "boolean.subtract", operands: [{ id: "<group>", pieces: "<B>" }, { id: "@2" }] } }
] }
```

The group keeps its id and its other parts. Only B is cut. Tell the user that the old steps stay in the History.

**If A was built by several steps**, and has no hole running across the fit, shrink A instead: `operate { op: "modify.enlarge", operands: [{ id: "<A>" }], params: { deltaMm: [-0.4, -0.4, 0] } }`. Use 0 on the axis A slides in along. Enlarge scales the part about the centre of its bounds. That is exact for boxes and cylinders, and approximate for anything else.

**If the user may want to tune the fit later**, define the gap once. Call `define_variable { name: "clearance", kind: "number", value: 0.2, unit: "mm", min: 0, max: 1 }`. Then bind the enlarge's `deltaMm` slots to `define_formula { name: "clearanceTotal", formula: "2 * clearance" }` wherever `list_variables { id }` offers them. After that, a single `set_variable { name, value }` re-fits every pair.

## 3. Check your work

1. Call `check_clearance { a, b }` for every pair of separate bodies, and with `aPieces` and `bPieces` for every pair of parts in one group. There should be no overlap volume, and a gap within 0.05 mm of the clearance (curved faces are tessellated, so 0.2 mm reads about 0.198). A gap of 0 means a face still touches. Find that face, and open it or say why it stays.
2. Call `measure { ids }` on every whole body you changed. Its size should have changed by exactly what you meant, and by nothing else. For a part inside a group, check its size with `evaluate_formula`.
3. Call `get_timeline` and confirm no step is broken.
4. Call `check_printability { ids }` on each printed part. A clearance can thin a wall below 1.2 mm.
5. Tell the user the clearance you used and where it came from (their number, or the FDM default). Give each pair's measured gap, and anything you could not measure.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
