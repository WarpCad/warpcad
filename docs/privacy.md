# Privacy: what the hosted app measures

WarpCad keeps your projects in your own browser (or in the files you save). This page covers the
one thing the **hosted** app can report about you, and how to switch it off.

## Page views, through Google Analytics

When the hosted app was built with a Google Analytics 4 measurement ID, it counts visits with
Google Analytics. A copy you build or run yourself has no ID and sends nothing.

| What is sent | What is never sent |
|---|---|
| One **page view** each time the app loads: the site address and path (for example `https://app.warpcad.com/`), your browser and operating system, screen size and language, and a rough location Google derives from your IP address | The part of the address after `#` (shared-project and help links), your project, its name or its parts, anything you type, your Assistant API key, or anything stored in your browser's database |

- **Cookies.** Google Analytics sets cookies (named `_ga` and `_ga_` followed by the property) to tell one
  visitor from another. There is no consent banner. If that is a problem where you live, use one of
  the ways to opt out below.
- **IP address.** Google Analytics 4 does not log or store IP addresses; it uses the address to work
  out a rough location (country and city) and then discards it.
- **Google signals and ad personalisation are switched off** in the tag. The app asks for no
  advertising features and no cross-device tracking.
- **A shared-project link contains the project itself**, after the `#`, and is read only in the
  browser of the person who opens it; it is never sent to WarpCad's host or to Google Analytics
  ([Sharing a project by link](sharing.md)).
- **Publishing a gist sends your project to GitHub.** **Share → Publish to a gist** uploads the
  whole project file to a gist under your GitHub account; nothing is sent to GitHub until you tap
  it ([Publish a project as a gist](sharing.md#publish-a-project-as-a-gist)).
- **Nothing is sent from your own machine.** `npm run dev`, a local preview, `localhost`, a page
  served over plain `http`, and automated test browsers all skip it.

## Opting out

Any one of these stops the page view being sent:

1. Turn on **Do Not Track** or **Global Privacy Control** in your browser. The app checks both and
   sends nothing.
2. Install Google's opt-out extension, [Google Analytics Opt-out Browser Add-on](https://tools.google.com/dlpage/gaoptout), or any content
   blocker that blocks `googletagmanager.com`.
3. Use a private window and clear site data when you close it.

## Try it: check what a visit sends

1. Open the hosted app in a desktop browser and press **F12** to open the developer tools.
2. Open the **Network** tab and reload the page. Type `collect` in the filter box.
3. Click the request to `google-analytics.com`. Its **Payload** shows the page address (`dl`)
   with no `#` part, next to `en=page_view`. If you turned on Do
   Not Track first, no request appears.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
