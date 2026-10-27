# Sharing a project by link

You can send a project to anyone as a link in a text message or an email. They tap it and see
your model on their phone or computer. They don't need to install anything or sign up, and they
don't need to know what CAD is. The project itself is inside the link, so it doesn't pass through
any WarpCad server.

## Send a project

1. Open your project. It needs at least one shape. On an empty project **Share** is greyed out,
   and it says *Nothing to share yet*.
2. Tap **Share**, at the top of the screen to the left of **File ▾**. On a phone it is the icon
   with an arrow pointing up out of a box. **File ▾ → Share…** opens the same sheet, if you can't
   find the button.
3. Check the **Name**. It is the title the other person will see over the model. It starts as
   your project's name, or *Untitled*.
4. Send it:
   - **On a phone or tablet**, tap **Send…**. Your device's own share sheet opens, the one with
     Messages, Mail, WhatsApp and AirDrop. Pick one and send. If you change your mind, close the
     share sheet. Nothing else happens.
   - **On a computer**, click **Copy link** and paste it into an email or a chat. A note at the
     top says *Link copied* and how big the link is, for example *Link copied, 2.3 KB*.

![The Share sheet on a phone: the Name field reading "Phone stand", a Copy link button, Send the file underneath, and the line about who can open the link.](./screenshots/share-sheet.png)

**Example.** Open your project. Tap **Share**. Tap **Send…**, pick **Messages** and your dad's
name, and tap send. Dad's message reads *"Here's a model I made in WarpCad: Phone stand"*
followed by the link.

Before you send it, read the line at the bottom of the sheet: *Anyone with this link can open and
copy this project, including its notes. It can't be taken back.* The link holds the whole project,
including the notes and instructions you gave the Assistant. Anyone who has it can make their own
copy, and you can't recall a link once it's sent.

**If your project is too big for a link**, the sheet says *This project is too big to send as a
link*. A project with an imported 3D model file usually is. Use **Send the file** instead. It saves
the project file, which you can attach to an email or a message. The person you send it to opens
it with **File ▾ → Open…** ([Saving and reopening your work](save-load.md)). **Send the file** is
always at the bottom of the sheet, for anyone who already uses WarpCad.

**If you send it again after changing it**, the person who already has your project open is asked
whether to **Merge their changes** into theirs. See *Sending an update* below.

## If someone sent you a WarpCad link

You don't need to know anything about WarpCad to look at it.

1. **Tap the link.** WarpCad opens in your browser and the model appears, with its name above it.
2. **Look around.** Drag one finger across the model to turn it. Pinch two fingers to zoom in and
   out. On a computer, drag with the mouse and scroll to zoom. The buttons in the bottom corner do
   the same thing if you prefer to tap, and **Home** in the box at the top right turns it back to
   a standard view.
3. **That's all you have to do.** Tapping the model doesn't change it. Nothing you do on this
   screen changes the model, and nothing on your device is saved or overwritten.

![The Shared view on a phone: the project's name at the top, a cube and a sphere in the middle with the navigation buttons and the view box in the corners, and a large Make my own copy to edit button at the bottom.](./screenshots/shared-view.png)

**Example.** Tap the link. The model appears. Drag one finger to turn it, pinch to zoom. Tap
**Make my own copy to edit** only if you want to change it.

There are two buttons:

- **Make my own copy to edit** opens the model in the full WarpCad editor as **your own new
  project**, so you can change it. Your copy is separate from the sender's. Changing it doesn't
  change theirs, and theirs doesn't change yours. If you already had a project open in WarpCad on
  this device, it first asks **Replace the project?**. Tap **Download yours first** (or **Save
  yours first**) to keep a copy of yours, then **Replace**. Tap **Cancel** to go back to the shared
  model.
- **Save a copy of the file** saves the shared project as a file on your device, without opening
  the editor.

**If the link doesn't work**, WarpCad shows *This link looks incomplete*. Some email programs cut
long links short. Ask the person who sent it to send it again, or to send the file instead. Tap
**Start WarpCad** to go to the app anyway.

### Sending an update

If you send a newer version of a project to someone who already has **that same project** open,
not a copy they made of it, their **Make my own copy to edit** asks **Merge their changes?**
instead. **Merge their changes** brings in what's new and keeps their own changes, the same as
**File ▾ → Merge file…** ([Merging two copies of a project](merging.md)), with **Undo merge** if it
wasn't what they wanted. **Open theirs instead** replaces their copy with yours.

## Where the project goes

The project is packed into the part of the link after `#`. Browsers never send that part to any
server, so the project doesn't pass through WarpCad's host and isn't recorded by its page-view
counter ([Privacy](privacy.md)). The link is opened only in the browser of the person who taps it.
Once the project has loaded, WarpCad removes it from the address bar. Reloading the page then opens
WarpCad as normal, and a screenshot of the address bar doesn't show the project.

Opening a link never saves anything on that device. Only **Make my own copy to edit** does, and
it asks before replacing anything.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
