# Saving and reopening your work

WarpCad keeps your work for you. You don't press Save to keep a model safe: every change
you make is stored in your browser automatically, a moment after you make it, and the
next time you open WarpCad on the same device and browser your model is right there.

## Try it

1. Open WarpCad. Drag a **Cube** and a **Cylinder** from the Library into the 3D view.
2. Select both (click one, Shift-click the other) and press **Union** in the toolbar over
   the 3D view.
3. Look at the far right of the **top bar**. Right after your last change it says
   **Saving…**, and about half a second later **Saved · 14:02** (with the current time).
4. Reload the page (**F5**, **Ctrl/Cmd+R**, or the browser's reload button).
5. Your unioned shape is back, exactly where it was, and the view has moved to show all
   of it. The top bar says **Restored your last session** for a few seconds.

There is no "Do you want to restore?" question — reopening WarpCad means reopening your
model. Reloading right after a change is fine too: WarpCad saves the moment the page is
being closed, hidden or switched away from, so the last thing you did is not lost.

## The status light in the top bar

At the right of the top bar, beside the undo and redo buttons, there is a small status
indicator. On a laptop or tablet it shows a light and words; on a phone, where the top
bar is crowded, it shows just the light (screen readers still read out the words).

| Light | Words | What it means |
|---|---|---|
| Grey | **Autosave on** | Nothing to save yet — you haven't changed anything |
| Amber ring | **Saving…** | A change was just made and is about to be stored |
| Green dot | **Saved · 14:02** | Your latest change is stored, at that time |
| Green dot | **Restored your last session** | Your model was just reopened from where you left off |
| Red square | **Not saved — browser storage unavailable** | See below |

The light differs in *shape* as well as colour (ring, disc, square), so it doesn't rely on
telling red from green.

## If it says "Not saved"

WarpCad stores your model in your browser's own storage. Some situations stop the browser
from allowing that:

- **Private or incognito windows**, in some browsers, block storage outright, or wipe it
  when the window closes.
- **Storage that is full**, in which case the message says
  **Not saved — browser storage is full**.
- **Browser settings or extensions** that block site data.

Nothing else stops working: you can keep modelling as normal. But your work will **not**
be there if you reload, and the red light stays on until a save succeeds. If you see it,
either leave the private window or free up space, and make a change — WarpCad tries again
on your next change.

If WarpCad finds a stored model it can't read (for example, one written by a newer
version), it starts empty, says so in the top bar — **Couldn't restore your last session**
followed by the reason — and keeps the unreadable copy aside rather than writing over it.

## What is and isn't kept

- **Kept:** every shape you placed, moved, rotated, combined or edited, any sketch lines,
  steps you have suppressed, and a rollback point in the history, if you set one.
- **Not kept:** the **undo history** (after a reload both undo and redo start greyed out —
  see [Undoing and redoing a change](undo-redo.md)), what is **selected**, and where the
  **camera** was. WarpCad points the camera at your whole model when it reopens, so a
  model you had panned away from is not mistaken for an empty scene.
- **Only on this browser, on this device.** Autosave is not a backup and does not sync:
  clearing your browser's site data for WarpCad removes it, and a different browser or
  device starts empty. For a copy you can keep or hand to someone, use a project file
  (below).
- **Two tabs of WarpCad on the same browser share one saved model, and the most recent
  change wins.** If you keep two tabs open on different models, whichever changed last is
  the one that reopens. Work in one tab at a time.

## Saving a portable file, and opening one — arriving with the File menu

> **Not in the app yet.** The **File** menu that will hold *Save*, *Open…* and
> *Download copy* is a separate piece of work. Nothing on this page needs it, and there
> is no button for it today.

What is already in place underneath it, so you know what to expect:

- A project file is a plain text file named `warpcad-project.ndjson` (on browsers that
  can only download, `warpcad-project-20260919-1402.ndjson`, with the date and time, so
  copies don't overwrite each other). It contains the same steps autosave keeps.
- **On desktop Chrome and Edge** you'll get **Save** and **Save As…**, which write to a
  file you choose and can save over it again. **On every other browser — Firefox, Safari,
  and all phones and tablets, including Chrome on Android —** you'll get one item,
  **Download copy**, which downloads a fresh file each time. On an iPhone or iPad that
  file lands wherever Safari's downloads go (usually the Files app's **Downloads**
  folder). This isn't a limitation of WarpCad: those browsers don't let a web page write
  to a file on your device directly.
- **Open…** will check the whole file first. A file that isn't a WarpCad project, or that
  needs a newer version of WarpCad, is refused **by name** (with the line number where it
  goes wrong) and your current model is left exactly as it was. Opening a file replaces
  your model and, like a reload, clears the undo history.
