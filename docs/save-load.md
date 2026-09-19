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

## Keeping a copy in a GitHub repository — arriving with the File menu

Autosave keeps your work in *this* browser, on *this* device. Connecting a GitHub
repository gives you the other thing: a copy that outlives the browser, that you can open
on another machine, and that has a history of commits you can read.

> **Not in the app yet.** The **File** menu items described here — *Connect repository…*,
> *Save to owner/repo*, *Load from owner/repo*, *Auto-push* and *Disconnect* — are a
> separate piece of work, and there are no buttons for them today. What is in place is
> everything underneath: the connection, the saving and loading, the conflict check, and
> where your token is kept. This section describes what you will do, so that nothing about
> it is a surprise — and so you can decide *now* what kind of token to create.

### What you will need

A **fine-grained personal access token**, created at
`github.com/settings/personal-access-tokens`, with:

- **Repository access** limited to the *one* repository you want WarpCad to write to —
  not "all repositories". WarpCad only ever touches one file in one repository, so
  anything wider is access it will never use.
- The **Contents** permission set to **Read and write**. Nothing else.
- An **expiry date** you are comfortable with. When it expires, WarpCad tells you the
  token was rejected, and you paste a new one; nothing is lost, because your work is also
  autosaved in the browser.

### Connecting

1. **File ▾ → Connect repository…**
2. Paste the token, type the repository as `owner/repo` (for example
   `janecoder/enclosure-parts`), and leave the path as `warpcad-project.ndjson` unless you
   want the file somewhere else in the repository.
3. Press **Connect**. WarpCad checks the token against GitHub **before** storing anything,
   so a typo or an expired token is rejected there and then, with the reason: *GitHub
   rejected this token*, *Repository not found, or the token has no access to it*, *This
   token does not have permission to write to that repository*, or *Rate limited — try
   again in N minutes*.
4. If the repository has no project file yet, that is not an error: you will see *No
   project file yet — the first Save to owner/repo will create it*.

WarpCad writes to the repository's **default branch** (usually `main`), and to the one file
you named. It does not create branches, open pull requests, or touch any other file.

### Saving and loading

- **File ▾ → Save to owner/repo** commits the current model, with the commit message
  `WarpCad: save`. The file it writes is exactly the project file described above — the
  same bytes as *Download copy*, so anything saved to GitHub opens with **Open…** and the
  reverse.
- **File ▾ → Load from owner/repo** replaces your current model with the repository's copy.
  It is checked the same way **Open…** checks a file: a file that isn't a WarpCad project
  is refused by name, with the line that goes wrong, and your current model is left exactly
  as it was. Like opening a file, loading clears the undo history.

### Auto-push, if you want it

**Auto-push is off until you switch it on**, for every repository you connect. Every write
is a commit, and committing on your behalf is not something WarpCad decides for you.

When you do switch it on (**File ▾ → Auto-push**): it pushes once immediately, so you can
see it work, and after that it pushes **about half a minute after you stop making changes**
— so a burst of work (a drag, a few dimension edits, a union) becomes **one** commit named
`WarpCad: auto-push <time>`, not five. If you keep working without a pause it pushes anyway
every five minutes. Undo and redo count as changes; moving a shape *while you are still
dragging it* does not.

The dot on the **File** button tells you where things stand without opening the menu, by
shape as well as colour:

| Dot | Means |
|---|---|
| **●** solid | In sync — the repository has your latest change |
| **◌** hollow ring | Waiting — your recent edits will push in a moment |
| animated ring | Pushing now |
| **!** amber | Paused, and it needs you — see below |
| **✕** red | Stopped — the token was rejected |

**Ctrl/Cmd+S never pushes.** It saves or downloads a local file, with auto-push on or off.
Nothing in WarpCad uses the network because you pressed a keyboard shortcut.

### If the repository copy changed: "someone else got there first"

This is the case worth understanding, because it is the one where work could be lost if
WarpCad guessed.

If the file in the repository changed since you last loaded or saved it — you edited from
another browser, a colleague committed, you edited the file on github.com — then **WarpCad
refuses to write over it** and asks:

> **The repository copy changed since you last loaded or saved it.**
> **Overwrite remote** · **Load remote (replaces this project)** · **Cancel**

- **Overwrite remote** — your version wins. Theirs stays in the repository's history, so it
  is recoverable from GitHub, but it is no longer the current file.
- **Load remote (replaces this project)** — their version wins, in front of you. **Anything
  you have not pushed is replaced**, and the undo history is cleared, exactly as opening a
  file does.
- **Cancel** — nothing is written and nothing is loaded. Auto-push stays **paused** (not
  off) so it cannot quietly overwrite anything while you decide; pick it up again with
  *Save to owner/repo*, *Load from owner/repo*, or by switching Auto-push off and on.

**WarpCad never merges two versions.** There is no algorithm here quietly deciding which of
two models is right — you are asked, every time, and only ever with those three answers.
The same question appears the first time you save into a repository that already had a
project file, so connecting to the wrong repository cannot silently replace what is in it.

If the network drops instead, that is not a conflict and you are not asked anything: the
dot goes amber, the status says **Offline — will retry**, and WarpCad retries on its own
(after 10 seconds, then 30, then 2 minutes, then every 5). Your work is still autosaved in
the browser the whole time.

### Where your token is kept, and how to remove it

- The token is stored in **this browser's own storage (IndexedDB)**, on this device only. It
  is not sent anywhere except `api.github.com`, and it is never put in a web address, a
  status message, an error message, or the project file.
- After you connect, WarpCad **never shows the token again** — the dialog says *Token saved
  in this browser* and offers **Replace token** if you need to change it.
- Browser storage is **not encrypted**. That is exactly why the advice above is a
  fine-grained token limited to one repository: if someone can read your browser profile,
  the worst they get is write access to one repository's parts file, not your account.
- **File ▾ → Disconnect** deletes the stored token and the connection outright, and turns
  auto-push off. Your model stays exactly where it is — disconnecting is about the
  repository, not about your work.
- Clearing site data for WarpCad removes the token too, along with the autosave.
