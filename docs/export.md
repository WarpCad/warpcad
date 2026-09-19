# Exporting your model: STL, OBJ and glTF

> **Status: the file writing is built; the button is not yet.** WarpCad can already turn
> your model into STL, OBJ and glTF files, and the rules below are what those files
> contain. The control that asks for one — **File ▾ → Export…** in the top bar — arrives
> with the export dialog task (`ui-034`). Until then there is nothing on screen to click,
> and this page describes what the button will hand you when it lands. Nothing below is
> a button you can press today.

## What you will do (once the Export dialog lands)

1. Select a body in the 3D view — or select nothing, to export everything.
2. Open **File ▾ → Export…**, pick **STL**, and press **Export**.
3. A file called something like `union-1.stl` downloads right away. Open it in your slicer
   or any mesh viewer: it should look exactly like what you had on screen.

## What gets exported

| You had selected | The file contains |
|---|---|
| Nothing | Every body in the scene |
| One body | Just that body |
| Several bodies | Just those bodies, **together in one file** |
| A part inside a group (you had drilled in to one bolt thread, say) | The **whole body** that part belongs to |

Several bodies always go into a single file, never one file per body — that is what a
slicer plate or a mesh viewer expects, and the suggested name says so.

A body made of several named parts (a bolt, a nut, a library item) exports as the **one
combined solid** you would actually print: its visible parts fused together, with any
holes cut out. A part that is hidden stays out, exactly as it is on screen. Sketch lines
are not solids and are not exported.

## The three formats

| Format | File | Best for | Notes |
|---|---|---|---|
| **STL** | `.stl` (binary) | Slicers and 3D printing | The default. Written so the surface is closed — no gaps for a slicer to complain about or "repair" into the wrong shape. |
| **OBJ** | `.obj` | Mesh viewers and other modelling tools | Triangles, with shared corner points. |
| **glTF** | `.glb` (one binary file) | Web viewers, game engines, AR | A single self-contained file — there is no separate `.bin` to lose. |

STL and OBJ carry no unit of their own; they are written in **millimetres**, with **Z up**,
which is what slicers assume — your 40 mm cube is a 40-unit cube.

glTF is the exception, because the format itself insists on **metres** and **Y up**. The
file records that conversion in one place (so it opens the right way up and the right
size in a glTF viewer) and leaves your geometry untouched.

## File names

- One body: its name, lowercased — `Union 1` becomes `union-1.stl`, `Cube 1` becomes
  `cube-1.obj`.
- Several bodies, or the whole scene: `warpcad-scene.stl` (or `.obj` / `.glb`).

## When an export is refused

WarpCad would rather tell you than hand you a file that will not open:

| You see | Why |
|---|---|
| **Nothing to export** | The scene has no bodies. |
| **Cannot export "Ghost": it has no triangles** | That body has no surface to write — an empty result of a boolean, say. The message names the body. |
| **Cannot export "Hollow One": …** | That body's shape could not be reduced to one solid (a group with every part hidden). Named so you know which one to fix. |
| **The selection no longer matches anything** | Something you had selected was changed or absorbed by an operation before you exported; reselect and try again. |

## Checking a file

The quickest check is to open it somewhere else. Any slicer (PrusaSlicer, Cura, Bambu
Studio), a mesh viewer (MeshLab, Blender, macOS Quick Look for STL and OBJ), or an online
glTF viewer will do. The shape should match your viewport, at the size you built it.

## Related

- [Saving and reopening your work](save-load.md) — saving your *model* (which you can
  edit again) is separate from exporting a *mesh* (a finished shape other tools read).
- Why STL is written from the modelling kernel rather than from what is drawn on screen:
  [`decisions/persistence-export.md`](decisions/persistence-export.md).
