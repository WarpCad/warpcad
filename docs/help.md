# Using the built-in help

WarpCad carries its own documentation. Every page in this folder is inside the app, so you
can read how a tool works without leaving the project you are editing, and it opens with the
network off.

There are three ways in, and they all open the same **Help** sheet:

| You want | Do this |
|---|---|
| The page for the tool you are using | Press the **?** in that tool's pop-up or sheet header. |
| To browse every page | **File ▾ → Help and documentation**, or the **?** at the top of the window (laptop and tablet). |
| To do it from a keyboard | Press **?** (Shift + /) or **F1**, when no text field has the cursor. |

## Try it: from the Align pop-up

1. Place a Cube and a Cylinder, then click the Cube and Shift-click the Cylinder. Both are
   selected.
2. Press **⇔ Align** on the Operations toolbar. The Align pop-up opens.
3. Set **Snap** to *Inside* and type `7` in **Offset**, so there is something of yours in the pop-up.
4. Press the **?** in the pop-up's top-right corner.

![The Align pop-up with the Help sheet open over it, on Precise placement: Align, scrolled to The popover's fields with that heading highlighted](./screenshots/help-from-popup.png)

The Help sheet opens on *Precise placement: Align*, scrolled to the section about
the pop-up's fields, with that heading marked. Your selection and the pop-up stay exactly as
they were underneath it.

5. Close the sheet with **×** (or press Esc). The Align pop-up is still open, **Snap** still
   says *Inside* and the offset still says `7`. Tap an axis button to carry on.

![Selecting two shapes, opening Align, pressing ? to read its help, closing it, and the pop-up still there with its choices intact](./media/help-open-close.gif)

## Reading the sheet

- **Back** returns along the pages you followed with in-page links, one step at a time.
- **Contents** lists every page. On a laptop it is the column on the left; on a phone it is
  folded behind the **Contents** button so the page gets the whole width.
- Links between pages stay inside the sheet. Links to other websites open in a new tab.
- **×**, **Esc**, or a tap outside the sheet closes it. Only the sheet closes: a pop-up under
  it stays open, and so do your selection and the tool you were using.
- Pictures load as you scroll to them. Short clips (GIFs) are kept for offline use the first
  time you see them, so a clip you have never opened online shows its description instead
  when you are offline.

![The Help sheet at phone width with the Contents list open over the page: Getting started, the docs index, then every page by name](./screenshots/help-contents-phone.png)

## The ? is always there

The **?** is never greyed out, even when the tool it belongs to is. If **Align** is dimmed and
you do not know why, the **?** beside it still opens the page that says "you need 1 or 2
shapes selected".

Tools without a pop-up of their own (Union, Subtract, Intersect and Group commit on one
click) share the **?** at the right-hand end of the Operations toolbar's "2 selected" line,
which opens *Combining shapes*. On a phone, and in the narrow view column of a tablet, that line
has no room for it: open **File ▾ → Help and documentation** and pick *Combining shapes* from
Contents.

## Offline

The text of every page and its still pictures are saved on your device the first time WarpCad
loads (it is a progressive web app, so this happens when you install or first visit it). After
that **Help** works with no connection, and always shows the pages for the version of WarpCad
you are running, never a newer or older copy from the internet.

To check: open WarpCad once, turn the network off (airplane mode, or the browser's Offline
setting), reload, and open **File ▾ → Help and documentation**.

## Updating WarpCad

WarpCad updates itself. When a new version is released, your browser fetches it in the
background, and a banner appears at the bottom of the window: *A new version of WarpCad is
available.* The banner is never in the way: it sits below the viewport, so the view, the
navigation controls and the chat stay fully visible above it.

![The window with the update banner along the bottom: A new version of WarpCad is available, with Reload and Later buttons](./screenshots/pwa-update-toast.png)

1. Finish what you are doing. Your project is already kept in the browser (and in your file, if
   you saved one), so a reload loses only what is on screen, such as an open pop-up.
2. Click **Reload**. If you are in the middle of something (dragging, typing in a field, a
   pop-up open, or a save that has not finished) the banner first asks *Reload anyway?*.
3. The page restarts on the new version. **Later** hides the banner until the next time a
   newer version is found.

If you never see the banner, open **Help**, scroll to the version line at the bottom of any
page and click **Check for updates**. It answers *You are on the latest version* or *Update
found, reload to apply*. The number on that line (for example `0.0.0+a1b2c3d`) is the build you
are running; after **Reload** it changes to the new one.

A tab left open looks for a new version about every 30 minutes and whenever you switch back to
it. A page you simply reload (without the banner) also picks up the new version, within a
reload or two of its release. Updating never needs you to clear site data.

## Sharing a help view

While the sheet is open, the address ends in `#/help/align` (or whichever topic or page you
are on). Send that address and the other person's WarpCad opens straight onto the same page.
If the address already carries a shared project (`#/gist/…`), help leaves it alone.

## The source code

WarpCad is free software under the AGPL-3.0, so you can always get the code of the copy you are
running. To find it:

1. Open **File ▾ → Help and documentation**.
2. Scroll to the bottom of any page.
3. Press **Source code** under the line *WarpCad is free software under the AGPL-3.0*. The
   project's GitHub repository opens in a new tab.

## The libraries WarpCad is built with

WarpCad is built on open-source libraries (three.js, Vue and others), each under its own licence.
To read them:

1. Open **File ▾ → Help and documentation**.
2. Scroll to the bottom of any page.
3. Press **Third-party notices**, next to **Source code**. A plain-text page opens in a new tab,
   listing every library with its version, licence and copyright line.

## See also

- [Getting started in five minutes](getting-started.md)
- [Using WarpCad on a phone or tablet](mobile.md)
- [The full list of pages](README.md)

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
