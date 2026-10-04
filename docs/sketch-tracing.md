# Tracing a photo

You can put a photo under a sketch and draw over it. The usual case: a part broke and
you want to print a replacement. Photograph it next to a ruler, load the photo onto a
sketch's slice, tell WarpCad how long a stretch of the ruler is, and trace the part's
outline at its real size.

This page covers taking a usable photo, loading it, setting its scale, and what happens
to the photo when you share the project. Drawing the outlines themselves is on
[Sketch primitives](sketch-mode.md).

> **Coming later:** **Auto-trace**, which finds the part's outline in the photo for you,
> is not available yet. For now, trace the outline by hand with **Line** (and tidy it
> with the point editing on the Sketch primitives page).

## Taking a usable photo

- Lay the part **flat** on a plain surface that contrasts with it (a dark part on a light
  table, or the other way round).
- Put a **ruler** right beside it, flat on the same surface.
- Photograph from **straight above**, with the part and the ruler filling most of the
  frame. Avoid shadows across the edges you want to trace.

WarpCad takes **PNG, JPEG and WebP** images. An iPhone normally hands a JPEG to the
browser. If it offers a HEIC file instead, WarpCad says *Choose a JPEG or PNG — iPhone
HEIC photos can be exported as JPEG*. Export the photo as a JPEG first, or in iOS
Settings → Camera → Formats choose **Most Compatible**. Images larger than 40 megapixels,
or over 8192 pixels on a side, are refused. Save a smaller copy and load that instead.

## Loading the photo

1. Drag **Sketch** from the Library into the view. The sketch editor opens.
2. Tap **Slices** in the Sketch toolbar. The photo belongs to the **active slice**, so
   each slice (each rib of a wing, say) can have its own.
3. Under **Reference image**, tap **Add image…** and choose the photo. On a phone you can
   take a new photo with the camera or pick one from your library.

The photo appears on the slice, centred on the sketch's origin, under the grid lines,
at half opacity. Until you set its scale it shows a **Not to scale** badge, both in the
Slices panel and under the photo's bottom-left corner. Its starting size is a guess:
one pixel of the photo is 0.1 mm.

![A sketch with the bracket photo loaded under the grid and a "Not to scale" badge, and the Slices panel open showing the Reference image group: Replace image…, Remove image, Opacity 50%, X/Y offset, Rotation and Set scale](./screenshots/sketch-trace-photo.png)

The **Reference image** group then offers:

- **Replace image…**: choose a different photo for this slice. It keeps the opacity but
  not the scale, because a new photo needs a new measurement.
- **Opacity**: from faint to solid. Fainter makes your outlines easier to see.
- **X** and **Y** (mm) and **Rot** (degrees): move and turn the photo to line it up with
  the sketch's axes. X and Y are where the photo's centre sits on the slice.
- **Set scale**: see below.
- **Remove image**: takes the photo off the slice. Your outlines stay.

The photo is a tracing aid, not part of the shape. It is only shown while the sketch
editor is open. It never appears in the 3D view, in an export or in a boolean. Tapping
it does nothing: a drag that starts on the photo draws, exactly as on an empty grid.

## Setting the scale from the ruler

1. Tap **Set scale**. The Sketch toolbar gives way to a banner with the instruction and a
   **Cancel** button. The Slices panel folds down to its title (on a phone and tablet it
   steps aside completely) so the photo is free to tap. It comes back when you are done.
2. Press on one mark of the ruler in the photo and drag to another, then let go. Or tap
   one mark, then the other. No modifier key is needed, and two fingers still pan and
   zoom while you look for the marks.
3. Type the real length between the two marks, pick its unit (**mm**, **cm** or
   **in**), and tap **Apply**.

![The Set scale banner asking "How long is that line?" with 100 typed and mm picked, and a dashed line drawn along the photo's ruler from the 0 mark to the 10 cm mark](./screenshots/sketch-trace-set-scale.png)

The photo resizes to its real scale **about the first mark**, so the ruler stays where
you were looking. The line stays drawn, labelled with the length as you typed it
("100 mm"). The badge now reads the photo's real scale, for example *1 px = 0.2 mm*.

![After Apply: the photo twice as large, the line along the ruler labelled "100 mm", and the badges reading "1 px = 0.2 mm"](./screenshots/sketch-trace-scaled.png)

![Setting the scale: Set scale, a drag from the ruler's 0 mark to its 10 cm mark, 100 typed, Apply](./media/sketch-trace-scale.gif)

If the slice already has outlines when you apply a scale, WarpCad asks: *Rescale the N
outlines on this slice to match the image?* **Yes** (the default) resizes them with the
photo, about the same point, for when you traced first and measured second. **No**
leaves them as they are.

Press **Esc**, or tap **Cancel** in the banner, to stop without changing anything. To
measure again, tap **Set scale** again. Everything here is part of the sketch you are
editing: **Cancel** in the Sketch toolbar throws it all away, and **Done** keeps the
photo and its scale with the sketch, as one step that **Undo** takes back in one go.

## Example: a replacement part from a photo

Put the broken part flat on a table with a ruler beside it. Photograph it from straight
above, filling the frame. Drag **Sketch** into the view. Tap **Slices**, then
**Add image…**, and choose the photo. It appears under the grid with a *Not to scale*
badge. Tap **Set scale**, press on the ruler's 0 mark and drag to its 5-inch mark, type
**5**, pick **in**, then tap **Apply**. The badge now reads the photo's real scale. Close
the Slices panel, pick **Line**, and click (or tap) around the part's edge, finishing on
the first point to close the outline. Draw each bolt hole with **Circle** and make it a
**Hole**. Open **Extrude ▾**, choose **Linear**, type the part's thickness in **Height**,
then tap **Done**.

## Getting an accurate result

The scale is uniform: one number for the whole photo. That makes a few limits worth
knowing.

- **Shoot straight down.** A photo taken at an angle is stretched more in one direction
  than the other, and no scale setting can fix that.
- **Keep the ruler level with the surface you trace.** With a thick part, its top outline
  is closer to the lens and looks bigger than its bottom. Trace the outline that sits at
  the ruler's height.
- **Measure along the longest stretch of ruler you can.** A pixel of error at each end
  matters less over 20 cm than over 2 cm.
- **Check it.** After setting the scale, draw a circle over a hole you can measure and
  compare its size in the Inspector with your calipers.

## What happens to the photo when you share the project

The photo is **saved inside the project file**, so it travels with it: anyone who opens
the project sees the same photo on the same slice at the same scale.

When you add a photo, WarpCad makes a fresh copy of it from its pixels alone. It is
re-saved as a JPEG (or a PNG if it has see-through areas), at most 2048 pixels on its
long side. Everything else the original file carried is left behind, including the
**location** your phone recorded, the camera details and any comments. The original
photo on your device is not changed.

A project from someone else is treated with care. A photo in it is only ever used if it
is plainly a PNG, JPEG or WebP image of a sensible size, stored in the project itself.
One that is anything else (for example a link to an image elsewhere on the internet, or
an SVG drawing) is **removed when the project opens**. WarpCad says so in the status
next to the File menu, the sketch still loads, and its row in the Slices panel reads
*Reference image removed — it couldn't be verified as a safe image*. Tap **Remove image**
there to clear the note. Opening a project never fetches anything from another website.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
