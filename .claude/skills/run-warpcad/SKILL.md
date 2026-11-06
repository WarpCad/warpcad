---
name: run-warpcad
description: Launch WarpCad locally so you can look at it, drive it in a browser, or let an MCP agent edit the open project. Use whenever asked to run, start, open, screenshot, or check the WarpCad app, or to confirm a change works in the real app. Builds a production bundle and serves it with the preview server; do not use the dev server unless debugging.
---

# Run WarpCad locally

Run the app the fast way: build once, then serve the build.

```bash
cd /Users/johncole/src/@WarpCad/warpcad
npm run build      # vite build -> dist/
npm run preview    # vite preview: serves dist/ on a local port (4173 by default)
```

Leave `npm run preview` running in the background (`run_in_background`), read the
`Local: http://localhost:<port>/` URL it prints, and open that URL in the browser.
Rebuild (`npm run build`) after source changes; the preview server serves whatever
is in `dist/` when it started, so stop it and restart it after a rebuild if it has
cached the old files.

## Why not `npm run dev`

`npm run dev` (`vite`, fixed port 5183) runs every module through the dev server on
each request, so first load and every change are much slower than a build served from
disk. Use it only when you are debugging something that needs the dev server: HMR
behaviour or a stack trace with unminified source. For everything else, build and preview.

## Live MCP editing (an agent changes the open project)

The live MCP endpoint lets an MCP client edit the project open in the browser tab. It runs on
both servers, but a build has to be made for it on purpose:

- **Preview (preferred):** build with the flag, then preview. The flag leaves a marker in `dist/`,
  and the preview server mounts the endpoint only when it finds that marker.

  ```bash
  npm run mcp:add -- --preview          # once: registers http://127.0.0.1:4173/mcp with the MCP client
  VITE_LIVE_BRIDGE=1 npm run build
  npm run preview
  ```

- **Dev:** `npm run mcp:add -- --dev`, then `npm run dev` (endpoint at `http://127.0.0.1:5183/mcp`).
  Use this only when the task also needs the dev server.

A default build (`npm run build` with no flag) carries no endpoint, and `npm run preview` after it
serves none. So for a live-editing task, always rebuild with `VITE_LIVE_BRIDGE=1`.

In WarpCad, the user must enable access first: **Assistant → Live MCP access** → a lease (for
example **15 minutes**) → **Enable access**. Until then, MCP calls are refused with
"live MCP access is off". Do not enable access on the user's behalf.

`WARPCAD_LIVE_BRIDGE=0` turns the endpoint off on either server.

## Notes

- `npm run build` also runs the PWA and help build steps; a failing build means the app
  cannot be previewed, so fix the build error first rather than falling back to dev.
- Playwright (`npm run test:e2e:headless`) starts its own server. Do not start a second
  preview on the same port while an e2e run is in progress.
- Stop a background preview server when finished (`TaskStop`), so the port is free for
  the next run.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
