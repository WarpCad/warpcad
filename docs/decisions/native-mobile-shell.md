# Native mobile shell: Capacitor, tools in the page, an outbound relay for outside agents

**Status:** proposed 2026-10-20 (`TODO/build-003`). Research only: no code, no dependency, no
roadmap row is added by this record. The recommendation at the end is for the user to accept or
reject.

**The question.** What is the right way to turn the WarpCad PWA into an iOS and Android app that
can also expose the AI tool surface (`src/ai/tools/`) to an agent outside the phone?

The TODO's working hypothesis was Capacitor + tools in the page + an open question about
reachability. This record tests it. In short: the shell half holds, and the reachability half
needs correcting on three points.

1. `mcp/server.js` does **not** run "as-is" on a phone under any option: it is a stdio server,
   and stdio needs the client to spawn it on the same machine.
2. The iOS Local Network prompt is **not** triggered by a listener accepting TCP. It is
   triggered by Bonjour advertising and by native code dialling a LAN address.
3. A remote turn over the relay does **not** land as one atomic `ai`-origin merge today. It lands
   as a group of atomic `mcp`-origin batches. That is Decision 11 of `ai-partner.md`, and the
   phone makes its gaps worse (question 5).

How figures were gathered, **2026-10-20**:

- **GitHub**: `gh api repos/<r>` (stars, last push, archived, licence), `releases/latest` and
  `releases`, `contributors?per_page=100` (so `100` means "100 or more"). Issue counts use the
  search API (`type:issue`, so pull requests are excluded), the same method as `ai-partner.md`.
- **npm**: `npm view <pkg> version time.modified license maintainers dist.unpackedSize`.
- **JS runtime cost**: a scratch install, then `esbuild --bundle --minify --format=esm
  --platform=browser`, then `gzip -9`. The entries were `@capacitor/core` + `@capacitor/filesystem`
  + `@capacitor/share` (one import each), and `@tauri-apps/api/core`'s `invoke`.
- **App baseline**: the local `dist/` built 2026-10-20 (`main` at `f01cc62`). The main chunk
  `index-*.js` is 1,238,732 B minified, 356,233 B gzip. `dist/` is 94 MB, of which
  **89 MB is `dist/help/img`** (the Help GIFs) and 3.5 MB is `dist/assets`.
- **Platform behaviour**: Apple technotes TN3179 and TN2277, the WebKit blog, Capacitor's docs
  and source, Chrome's TWA docs, plus forum and bug reports where nothing official exists. Each
  of those is labelled.
- **Not done**: no native build. No Xcode or Android Studio spike was run, so **native binary
  sizes and on-device WebGL behaviour are unmeasured** and are labelled that way below. The
  TODO allows a throwaway spike. It is the first follow-up row instead, because a real one needs
  signing, a device and an Apple account.

Anything not verified is marked **unverified**.

---

## What the app already does that a shell inherits

These are read from the code, because questions 2 to 5 depend on them:

- **Tools are framework-free and run anywhere JS runs.** `src/ai/tools/index.js` is the one
  registry. The BYOK agent (`src/ai/agent.js`), the closed-file server (`mcp/server.js`), the
  dev-host bridge (`src/ai/bridge/tabEndpoint.js`) and WebMCP (`src/ai/webmcp/`) all adapt it.
  None of them adds a tool. Inside a WebView the registry is unchanged, and so are
  `capture_view` (WebGL) and the selection tools.
- **The closed-file server needs Node and a filesystem.** `mcp/projectFile.js` and
  `mcp/lock.js` import `node:fs/promises`, `node:crypto` and `node:path`. `mcp/server.js`
  serves stdio only (`serveStdio`). `mcp/package.json` declares `"engines": { "node": ">=22" }`.
- **Storage** is IndexedDB through `idb` 8.0.3: `src/storage/indexeddb.js` holds the autosave and
  `src/storage/tokenStorage.js` (database `warpcad-credentials`) holds the GitHub token and,
  through `src/storage/aiKey.js`, the Anthropic key. A synchronous `localStorage` lifeboat,
  `src/storage/localMirror.js`, covers a page torn down inside `pagehide`. **Nothing in `src/`
  calls `navigator.storage.persist()`** (grep, 2026-10-20).
- **Files**: `src/storage/fileSystem.js` has two modes, `native` (File System Access, desktop
  Chromium only) and `fallback` (`<a download>` on a Blob, plus `<input type=file>`). It already
  widens `accept` to `.json` and `.txt` so iOS's picker does not grey out `.ndjson`.
- **WebGL context loss**: `src/components/viewport/Viewport.vue` (`onContextLost`, line ~3521)
  calls `preventDefault()`, withdraws `capture_view`, and shows *"The 3D context was lost … Reload
  the page to restore the view."* There is **no `webglcontextrestored` handler**, so the view does
  not come back without a reload.
- **Service worker**: `src/pwa.js` registers only when `import.meta.env.PROD` and
  `'serviceWorker' in navigator` are both true.

---

## Question 1: Shell comparison

### Options

| | **Capacitor 8** | Tauri 2 (mobile) | nodejs-mobile | Android TWA (Bubblewrap) | Cordova | PWABuilder packages | Plain PWA install (baseline) |
|---|---|---|---|---|---|---|---|
| What it is | Native iOS/Android project hosting the Vite build in WKWebView / Android System WebView, with a JS↔native plugin bridge | Rust core and a system WebView (WKWebView / Android WebView), with JS↔Rust IPC | **Not a shell.** A Node.js runtime embedded in a native app; it still needs a WebView shell (React Native, Cordova, or the community `Capacitor-NodeJS`) for the UI | An Android app that opens the site in the user's **Chrome** with no URL bar | Capacitor's predecessor: WKWebView / Android WebView plus Cordova plugins | A packaging service. Android output is a TWA (Bubblewrap); iOS output is a generated Swift project around WKWebView | Add to Home Screen / Chrome install from `app.warpcad.com` |
| Platforms | iOS, Android (+ web) | iOS, Android, desktop | iOS, Android | **Android only** | iOS, Android | iOS, Android, Windows | All |
| Vue + three.js unchanged | Yes | Yes | n/a (UI is the shell's) | Yes (it is the site) | Yes | Yes | Yes |
| Native file save/open, share sheet, Keychain | Official `@capacitor/filesystem` 8.1.5 and `@capacitor/share` 8.0.3; community file picker and secure storage (see Q2, Q3) | `fs` and `dialog` plugins exist; mobile coverage per plugin is **unverified** (the plugin table's platform marks did not render). No official share plugin (community `sharesheet`); `stronghold` is an encrypted file, not the Keychain | Node `fs` inside the app sandbox | None. Web APIs only; the app has "no access to web state, like cookies and `localStorage`" | Cordova plugins (Capacitor also runs most of them) | iOS: whatever Swift you hand-edit into the template | None |
| Local listener / outbound socket from native | Plugin or our own Swift/Kotlin; one generic HTTP-server plugin found (Q4) | Write it in Rust; the official `localhost` plugin serves assets, not an API | Node `http` / `net` | No | Old plugins (`cordova-plugin-webserver` last published 2022) | No | No |
| JS runtime added to the bundle | **6,669 B gzip** (core + filesystem + share, measured) | **884 B gzip** (`invoke`, measured) | n/a | 0 | not measured | 0 | 0 |
| Native binary size | **Unmeasured** (no build) | **Unmeasured** on mobile; Tauri states "less than 600KB" for a minimal app (desktop figure) | Embedding Node adds tens of MB (**unverified**, not measured) | Small Android wrapper (**unmeasured**) | Unmeasured | Unmeasured | 0 |
| Web payload shipped in the binary | `dist/`: 3.5 MB of assets, **plus 89 MB of Help GIFs** unless they are excluded or runtime-cached | Same | n/a | None (served from Pages) | Same as Capacitor | iOS: **unverified** whether it bundles or loads the live URL | None |
| Licence | MIT | Apache-2.0 OR MIT | Node's licence (GitHub reports `NOASSERTION`) | Apache-2.0 | Apache-2.0 | GitHub reports `NOASSERTION` | n/a |
| Stars | 16,913 | 112,067 (mostly desktop use) | 879 (fork); 2,597 (original, last push 2021) | 3,138 | 2,226 (ios) / 3,795 (android) | 3,797 | n/a |
| Issues open / closed | **84 / 3,832 (2.1% open)** | 1,315 / 5,215 overall (20%). **Mobile labels: iOS 46 / 88 (34% open), Android 91 / 116 (44% open)** | 40 / 26 (61% open) | 129 / 362 (26%) | 52 / 724 (ios), 88 / 805 (android) | 56 / 4,193 | n/a |
| Latest release | 8.5.3, 2026-10-07; npm modified 2026-10-20 | 2.12.4, 2026-10-14; **3.0.0-alpha.5 the same day** (a major version is in flight) | **v18.20.4, 2024-10-07** (Node 18, which is end-of-life); no release since | 1.27.0, 2026-10-09 | `rel/8.1.1` 2026-07-08 (ios), `rel/15.1.0` 2026-07-22 (android) | GitHub release tag `feb-2024`; repo pushed 2026-10-20 (the hosted service is the product) | n/a |
| Last push | 2026-10-20 | 2026-10-20 | 2026-04-30 (last commit 2025-11-13) | 2026-10-12 | 2026-10-21 / 2026-10-18 | 2026-10-20 | n/a |
| Maintainers | 20 npm maintainers (Ionic and OutSystems addresses); 100+ contributors | 7 npm maintainers; 100+ contributors | 2 npm maintainers on the RN binding; 6 contributors | 8 npm maintainers (Google/Chromium addresses); 57 contributors | Apache PMC; 100+ contributors | 100+ contributors | n/a |
| WebGL engine | WKWebView = WebKit (iOS); Android System WebView = Chromium, updated through Play | Same two WebViews | n/a | The user's Chrome | Same as Capacitor | Same as Capacitor (iOS), Chrome (Android) | Safari / Chrome |
| WebGL context loss | Engine behaviour, nothing added by the shell (below) | Same | n/a | Chrome's | Same | Same | Same |
| WebContent process killed (iOS) | **Handled**: `WebViewDelegationHandler.swift` `webViewWebContentProcessDidTerminate` calls `bridge?.reset()` and `webView.reload()` (read in source 2026-10-20) | **Unverified** | n/a | Chrome's tab recovery | **Unverified** | **Unverified** | Safari's tab recovery |
| Toolchain | Node 22+, Xcode 26, iOS 15+ deployment target, Android minSdk 24 (from third-party Capacitor 8 upgrade guides, **not confirmed against Capacitor's own docs**); SPM by default | Rust + Xcode + Android NDK | Native toolchains + a Node cross-build | JDK + Android SDK (Bubblewrap installs them) | Native toolchains | None (a web service) | None |

### WebGL and three.js inside these WebViews

- **The engines are the ones we already test.** WKWebView is WebKit, so it matches the
  Playwright `webkit` project. The Android System WebView is Chromium, so it matches `chromium`.
  A TWA is Chrome itself. No option ships its own GPU path, so Tauri and Capacitor behave the same
  for rendering. **On-device frame times in a WebView are unmeasured.** The forum reports found
  are anecdotal and mixed: an empty-scene stutter in a mobile WebView (three.js forum, 2023-24),
  and jitter in Tauri's macOS WebKit at a reported 60 fps.
- **Context loss after backgrounding is a real WKWebView behaviour.** It was reported for iOS 17
  WKWebView with three.js, Babylon.js and plain WebGL (Apple forums thread 737042; PlayCanvas
  forum, "persisted in WKWebView up to iOS 17.2"). One report could not reproduce it on iOS 26.2
  (Textastic feedback 4001). **Current status on iOS 26: unverified.**
- **What that means for WarpCad.** In a browser the context-lost message says "Reload the page",
  and the browser has a reload button. **A native shell has no browser chrome, so that message
  is a dead end.** A shell needs either a `webglcontextrestored` path that rebuilds the renderer,
  or an in-app **Reload view** control. The restore path also helps Safari and the PWA; follow-up
  row 2.
- **Memory.** iOS kills the WebContent process under memory pressure. Capacitor reloads the page
  when that happens (verified in source), and a reload loses whatever is in memory: undo stacks,
  the AI-turn stack, and edits since the last autosave. The `localMirror.js` lifeboat covers only
  a clean `pagehide`, not a kill.

### Other options looked at and set aside without a full row

- **React Native / Expo DOM components / NativeScript / Flutter**: a second UI runtime, or a
  rewrite of a Vue 3 app. That contradicts the committed Vue 3 + Vite row.
- **Hotwire Native**: built around server-rendered navigation; WarpCad is one client-side screen.
- **`hampoelz/Capacitor-NodeJS`**: nodejs-mobile inside Capacitor. 105 stars, 1 contributor,
  5 open / 23 closed issues, latest tag `v1.0.0-beta.10`, last push 2026-05-26. It inherits
  nodejs-mobile's Node 18.

---

## Question 2: Storage survival

### iOS (WKWebView: Capacitor, Tauri, Cordova, PWABuilder iOS)

- **Quota is lower than Safari's.** WebKit's storage policy (Aug 2023) gives browser apps up to
  60% of disk per origin and 80% overall; **"other apps" get 15% per origin and 20% overall.**
  Reaching the overall quota can trigger eviction, and eviction deletes an origin "as a whole".
- **Eviction is best effort.** It applies under storage pressure, past the quota, or for an
  origin unused for a while. Capacitor's own storage guide says: *"the OS will reclaim local
  storage from Web Views if a device is running low on space. The same can be said for
  IndexedDB at least on iOS."* It recommends Preferences or SQLite for data that must survive.
- **ITP is on in every WKWebView app** (WebKit, "App-Bound Domains": *"enabled by default in all
  `WKWebView` applications"*, iOS 14+). Whether the 7-day script-writable storage cap applies to
  an app's own first-party bundle is **unverified**. WebKit's 2020 post ties the cap to "days of
  Safari use" and says home-screen apps keep their own counter, where "we do not expect the
  first-party … to have its website data deleted". Third-party write-ups (Ionic 2020,
  Thinktecture) say a WKWebView app's counter resets each launch. No current Apple statement was
  found.
- **`navigator.storage.persist()`** is granted "based on heuristics like whether the website is
  opened as a Home Screen Web App" (WebKit). Its behaviour inside a WKWebView app is
  **unverified**. Do not rely on it.
- **Reported failure:** WebKit bug 277615 (2024, a Capacitor app): the IndexedDB connection is
  lost after hours in the background (*"UnknownError: Connection to Indexed Database server
  lost"*). It was closed as a duplicate, and its fixed status is **unverified**.
- **The origin changes.** Capacitor serves the bundle from `capacitor://localhost` on iOS and
  `https://localhost` on Android (config defaults `server.iosScheme: capacitor`,
  `server.androidScheme: https`). That is **not** `app.warpcad.com`, so a user's hosted-PWA
  autosave, key and library do not appear in the app. Moving between them goes through a project
  file or the hosted git backend. Changing the scheme later would change the origin again and
  orphan every user's IndexedDB, so the scheme is fixed at the first release.
- **Service workers** in WKWebView are reported to work only for App-Bound Domains (Apple forums
  781744 and 726686; WebKit bug 206741 still NEW). **Unverified officially.** A bundled shell does
  not need one, since assets are local and offline by construction. `src/pwa.js` should simply
  not register in the shell; that needs checking on device, not assuming.

### Android

- **Android System WebView (Capacitor, Tauri, Cordova).** Data lives in the app's private data
  directory. It survives app updates and is removed by **Settings → Clear storage** or uninstall.
  Chromium's quota and eviction rules apply. Capacitor's guide says the persisted-storage API is
  available on Android to mark IndexedDB persistent; eviction specifics inside a WebView are
  **unverified**.
- **TWA.** Storage belongs to the user's **Chrome** profile for `app.warpcad.com`, shared with
  that site in Chrome. Clearing Chrome's site data clears it. It behaves like the installed PWA,
  not like an app sandbox.

### What to mirror, and what can stay

| Data | Today | In a shell | Why |
|---|---|---|---|
| **The open project (autosave)** | IndexedDB `warpcad` / `autosave`, plus the `localStorage` lifeboat | **Mirror to a native file** in the app container (`@capacitor/filesystem`, `Directory.Library` or `Documents`). IndexedDB can stay the fast path, with the file as the copy that survives eviction | This is the user's work. Capacitor's own docs call WebView storage reclaimable. The file is also included in device backups (**unverified** which `Directory` values are backed up) |
| **The user library (My parts)** | IndexedDB (`src/storage/userLibrary.js`) | **Mirror to a native file**, same as above | Also user work, not reproducible |
| **The BYOK Anthropic key and the GitHub token** | IndexedDB `warpcad-credentials` (`tokenStorage.js`, `aiKey.js`), readable by any script on the origin | **Keychain / Keystore**, behind the same `createCredentialStore` interface. Candidate: `@aparajita/capacitor-secure-storage` 8.0.1 (MIT, 174 stars, 2 open issues, pushed 2026-09-23, **1 npm maintainer**) | Losing a key to eviction is a nuisance, because it can be pasted again (`aiKey.js` already tolerates `{ persisted: false }`). The real gain is that the secret leaves origin-readable storage. Decision 8's "XSS on the origin" exposure narrows to a running script calling the plugin. Single-maintainer risk: re-check before pulling it in |
| UI preferences, WebMCP preference, mouse preset | `localStorage` | Stay | Re-creatable defaults |
| The `localStorage` lifeboat | `localMirror.js` | Stay; additionally flush on `@capacitor/app` `appStateChange` → inactive | The native pause event gives an earlier, more reliable flush point than `pagehide`. How much time iOS allows there is **unverified** |
| Fold caches, meshes | Memory only | Stay | Derived and disposable (CLAUDE.md Architecture) |

Separately from any shell: calling `navigator.storage.persist()` on the hosted PWA is cheap, and
WebKit says installed home-screen apps are likely to be granted it (follow-up row 4).

---

## Question 3: File access

- **The web fallback partly survives inside a WebView.**
  - `<input type=file>` works: Capacitor's Android `BridgeWebChromeClient` implements
    `onShowFileChooser` (source, 2026-10-20), and WKWebView presents the document picker.
  - **`<a download>` on a Blob does not.** Capacitor issue
    [#5478](https://github.com/ionic-team/capacitor/issues/5478) *"Blob downloads don't work on
    iOS & Android"* has been open since 2022-03-02, and a search of Capacitor's source found no
    `setDownloadListener` (Android) or `WKDownloadDelegate` (iOS). **The Download copy item in
    `fileSystem.js` would silently do nothing in the shell.** That is the same class of failure
    as the iPad Save button `persistence-export.md` warned about. Tauri's behaviour here is
    **unverified**.
- **Plugins that cover save and open (Capacitor):**
  - **Save / Download copy**: `@capacitor/filesystem` 8.1.5 (official, MIT) writes the NDJSON
    text into the container. Then `@capacitor/share` 8.0.3 (official, MIT) opens the share sheet
    with that file's URI. The share sheet's **Save to Files** (iOS) and the Android equivalents
    make it user-visible.
  - **Open**: keep `<input type=file>` (it works), or use `@capawesome/capacitor-file-picker`
    8.1.1 (MIT, published 2026-10-19, **1 npm maintainer**; Capawesome repo 493 stars, 37 open
    issues). The plugin earns its place only if it returns a re-readable path or bookmark rather
    than a one-time copy, which is **unverified**.
    `@capgo/capacitor-file-picker` 8.2.7 is an alternative (MPL-2.0, which is already on the app's
    `npm run licenses` allow-list).
- **How it fits the existing "no handle" fallback.**
  - `getFileCapabilities()` gets a third mode beside `native` and `fallback`, for example
    `shell`.
  - **Save** becomes "write the file in the container, then **Share…**", and the label says what
    happens. That keeps `persistence-export.md`'s rule that a control is labelled by what the path
    can do. "Save" in place is honest only for the app's own container copy.
  - **Merge file…** (`ui-062`) is unchanged: pick a file, merge it in.
  - **Auto-merge on focus (`io-010`)** needs a re-readable handle. A file in the app's own
    container has one, so `readCurrent` can be implemented for it. A file picked from iCloud
    Drive or another provider would need a security-scoped bookmark, so it stays on the
    "no handle" path until proven otherwise.
  - **Inbound share**: "Open in WarpCad" from Files or Mail needs a document-type registration and
    an `appUrlOpen` handler (`@capacitor/app`). Not researched in detail; follow-up row 3.

---

## Question 4: Outside reachability

The target case: Claude Code on the user's laptop drives the project open on their phone or iPad,
as `ai-012` does for a desktop tab. Every route below ends in the same `TabEndpoint`
(`src/ai/bridge/tabEndpoint.js`), so the one-writer rules are the same in all of them. Only the
transport differs.

| | **A. Outbound relay (the phone dials out)** | B. Foreground local listener (the phone listens) | C. WebMCP |
|---|---|---|---|
| Shape | The laptop runs the **reserved standalone `--live` host** (`mcp/server.js --live`, `ai-partner.md` Decision 11) on the LAN. Claude Code talks stdio to it; the app opens a WebSocket to `<laptop-ip>:<port>`. `mcp/bridge.js`'s core is reused unchanged | A native HTTP server in the app takes Streamable-HTTP MCP from the laptop and hands each request to JS (`TabEndpoint`) | The page registers tools on `document.modelContext` for an agent in the same browser |
| Available in the shell | Yes | Only through our own native code or one immature plugin: `@cantoo/capacitor-http-server` 1.0.8 (MIT on npm, **0 stars**, GitHub reports no licence; NanoHTTPD on Android, GCDWebServer on iOS) | **No.** WebKit does not implement it (Playwright's WebMCP docs). Android WebView exposure is **unverified**, and Chrome's is a flag or origin trial. There is also no agent *inside* a WebView to call it |
| iOS permission prompt | **Depends on who owns the socket.** TN3179: *"Traffic originating from WKWebView, SFSafariViewController, and Safari doesn't require local network access."* So a WebSocket opened by page JS shows **no prompt**. A socket opened by native code to a LAN address **does** prompt (`NSLocalNetworkUsageDescription`) | TN3179's table: *"Listening for and accepting incoming TCP connections"*: **not required**. *"Registering a service with Bonjour"*: **required**. So the user types the phone's address and sees no prompt, or uses discovery and sees one | n/a |
| Android permission | `INTERNET` only (**unverified** whether Android WebView applies Chromium's Local Network Access prompt) | `INTERNET`. Staying alive with the screen locked needs a **foreground service** with a visible notification; the cantoo plugin uses type `dataSync` plus `POST_NOTIFICATIONS`. Play's per-type foreground-service time limits are **unverified** | n/a |
| Mixed content | **The open risk.** Android Capacitor serves `https://localhost`, so a `ws://` LAN URL is mixed content and blocked unless `android.allowMixedContent` (docs: "not intended for production"). On iOS, whether the `capacitor://` scheme counts as a secure context that blocks `ws://` is **unverified**. If it does, the socket moves to native code, which triggers the iOS prompt. A `wss://` relay with a self-signed LAN certificate is rejected by the WebView. Spike item | n/a: the laptop dials the phone | n/a |
| App in foreground | Works | Works | n/a |
| App backgrounded / screen locked | **iOS**: the process is suspended shortly after backgrounding, page JS stops, and the socket's resources "might get reclaimed" (TN2277). Forum reports put a WKWebView socket's survival at about 30-60 s; Apple DTS says it is suspension, not backgrounding, that kills it. **Android**: the process usually lives; whether WebView timers keep running is **unverified** | **iOS**: TN2277: *"your app should close the listening socket when it goes into the background"*. While suspended, *"the kernel will accept the connection but your app won't communicate over it"*. Requests hang until the client gives up. **Android**: survives with the foreground service | n/a |
| Phone sleeps mid-turn | The call in flight either ran (the registry is synchronous) or did not. The answer is lost with the socket. The laptop host refuses after `CALL_TIMEOUT_MS` (60 s) with *"it may still have landed; check `get_timeline`"*. Later calls fail until the app returns to the foreground and reconnects | iOS: the client's request hangs and then times out on the laptop. The same "may have landed" ambiguity applies if the reply was not flushed | n/a |
| Exposure | One outbound connection; the laptop's port is on the LAN, not loopback, so **Decision 11's loopback gate no longer holds** and an authorization policy is needed (Decision 11 already says one must be decided when the standalone host is built). A pairing code shown on the laptop and typed on the phone is the obvious candidate | **The phone exposes an MCP endpoint to everyone on the Wi-Fi**, in plain HTTP, carrying project contents. It needs a token and preferably TLS, so a certificate problem moves to the laptop side | n/a |
| New code | The standalone host (reserved), a dial-out client in the tab, reconnect on resume | Native server, request/response bridging, foreground service, address display | none |

A fourth route, a **hosted `wss://` relay on the internet**, avoids LAN, mixed-content and prompt
problems, and works on cellular. It needs a backend, and `hosting.md` has none. Its own
"Revisit when" names "a relay for `mcp/server.js --live`" as the trigger. It is not proposed now.

**nodejs-mobile does not change this table.** Running `mcp/server.js` on the phone still leaves
Claude Code on the laptop needing a network transport into the phone (route B's listener and all
its problems), because stdio cannot cross machines. It also adds a second writer (question 5).

**Answer:** route **A** (outbound relay to a laptop host), with the socket opened by page JS if
the spike shows mixed content allows it, and by native code (accepting the one iOS prompt) if not.
Route B is rejected below. Route C is not available in any shell.

---

## Question 5: The single-writer rule, and where the relay breaks it

### What the code does today

- **BYOK chat turn (`src/ai/agent.js`)**. The fork is a replica seeded with
  `fork.mergeFrom(live.mergeState(), { origin: 'merge' })` (line ~292). Every tool call writes to
  the fork. The turn lands as **one** `live.mergeFrom(forkState, { origin: 'ai' })` (line ~720),
  which is atomic and on neither undo stack. Stop, error or a cap hit drops the fork. **This is
  the only path that is "one atomic `ai`-origin merge".** It carries into a WebView unchanged.
  On a phone: if the app is suspended mid-turn, the streaming `fetch` to the Messages API fails,
  the turn errors and the fork is dropped. Nothing lands, and the rule holds. The cost is the
  tokens spent. If iOS kills the WebContent process, the fork dies with the page, and the rule
  still holds.
- **Relay (`TabEndpoint`, Decision 11).** A remote turn is **not** a fork and not one merge. Each
  write call lands at once on the **live** document as one atomic `mcp`-origin batch
  (`src/ai/tools/batch.js`). Consecutive same-`request` calls within `GROUP_IDLE_MS` (60 s) form
  one `AiTurn` group, so **Undo AI turn** removes them in one step. One writer is enforced
  per call: calls are serial, a call waits up to 10 s for a gesture and is then refused, and a
  call is refused if `documentRevision()` (the Lamport clock) moved between arrival and run. The
  tab is the only replica writing; the relay holds no document. So the relay preserves
  **single-writer**. It never preserved **turn atomicity**, by design.

### Cases where the relay design does not give one atomic AI change

1. **A half-landed turn, for as long as the phone sleeps.** The agent's calls 1-3 land, the phone
   suspends, and call 4 never runs. The document holds a partial turn. On desktop the gap between
   calls is seconds; on a phone it is unbounded. Each batch is still atomic, but the turn is not.
2. **One turn becomes two groups.** If the phone is away for more than 60 s and the agent resumes
   with the same `request`, the idle gap has passed, so the rest of the turn forms a **second**
   `AiTurn`. Undoing "the turn" then takes two presses, and the first press removes only the tail.
3. **"May have landed" leads to duplicates.** A call that ran just before suspension loses its
   reply with the socket, and the host answers *"it may still have landed"*. An agent that
   retries without checking `get_timeline` lands the same records twice. Both copies are
   undoable, but neither is refused, because the duplicate is a new call on a fresh revision.
4. **The AI-turn stack does not survive a WebContent kill.** `aiTurns` is in memory (Decision 5,
   point 5). If iOS kills the page while backgrounded, Capacitor reloads it: a new replica, an
   empty AI-turn stack, and the bridge sees a new tab. The landed `mcp` rows remain, with their
   chip, but can no longer be removed as a group. Each row has to be removed through History.
5. **Two writers if the closed-file server runs on the phone.** Route nodejs-mobile, or any design
   where `mcp/projectFile.js` writes a file in the app container while the WebView has it open,
   makes two replicas. That is permitted by `docs-022` (it is the `io-010` merge), but it is **not**
   single-writer. It also needs a native file-change → `mergeIn` path, because the existing
   trigger needs a File System Access handle (desktop Chromium only, `CLAUDE.md` AI Partner).
6. **Two devices with the same project.** If the phone and the laptop tab both have the project
   open and both connect, the bridge already refuses ambiguous routing ("exactly one MCP session
   and one enabled tab"). The rule holds, but only within one host. Two hosts, each with its own
   tab, are two writers to two copies, which reconcile later by file merge. This is not new, but
   a phone makes it likely.

### What would make a remote turn atomic, if wanted

Give the relay the BYOK path's shape: a remote turn opens a fork (an explicit `begin_turn`, or
the first write of a new `request`) and lands with one `live.mergeFrom(fork, { origin: 'mcp' })`
on `end_turn` or an idle timeout. A suspended or killed phone then lands **nothing**, as the BYOK
chat does. The cost: MCP has no turn boundary (Decision 11 point 3), so the timeout picks between
auto-landing and auto-discarding, and the agent no longer sees its writes reflected in the live
viewport until the turn lands, unless the user turns Watch on. This is a change to an accepted
decision, so it is listed as a suggestion (row 7), not made here.

---

## Question 6: Health check of the recommended shell (Capacitor), 2026-10-20

| Signal | Value | Verdict |
|---|---|---|
| Stars | 16,913 | Smaller than Tauri, but it is used for mobile apps, which is the part we need |
| Issues | 84 open / 3,832 closed (2.1% open); 10 open with `platform: ios` | Well triaged |
| Latest release | `@capacitor/core` 8.5.3 on 2026-10-07; `@capacitor/ios`/`android`/`cli` 8.5.3; npm `time.modified` 2026-10-20 | Active |
| Last push | 2026-10-20 | Active |
| Maintainers | 20 npm maintainers on `@capacitor/core` (Ionic and OutSystems addresses); 100+ contributors | Company-staffed, not single-maintainer |
| Official plugins | `ionic-team/capacitor-plugins`: 687 stars, 60 open issues, pushed 2026-10-07. `@capacitor/filesystem` 8.1.5 (2026-10-15), `@capacitor/share` 8.0.3, `@capacitor/app` 8.1.2, `@capacitor/preferences` 8.0.1 | Active |
| Licence | MIT, on the allow-list | OK |
| Known open bugs that matter here | #5478 Blob downloads (open since 2022) | Designed around in Q3 |
| Single-maintainer dependencies it would pull in | `@aparajita/capacitor-secure-storage` (1), `@capawesome/capacitor-file-picker` (1) | Re-check both when they are actually pulled in, per Library decisions |

**Healthy.** Re-run this check when the first shell task starts, as the Library decisions
process requires.

---

## Rejection table

| Option | Why not |
|---|---|
| **Tauri 2 mobile** | Same WebViews as Capacitor, so no rendering or storage gain. But a Rust toolchain plus the NDK becomes a requirement for a JS project, file and share coverage on mobile is unverified, and there is no official share plugin. Mobile issues stay open far longer (34-44% open on the `platform: iOS/Android` labels, against Capacitor's 2.1% overall), and v3 is in alpha, so starting on v2 now means a major migration soon. Its real advantage, Rust for a native listener, serves route B, which is rejected. |
| **nodejs-mobile** | Not a shell, and its one promise ("`mcp/server.js` runs as-is") is false. The last release is **Node 18.20.4 (2024-10-07)**, while `mcp/package.json` requires **Node ≥ 22**. The Node 22 upgrade PR (#134) and a 16 KB page-size release request (#161) are open. Issues are 61% open, with 6 contributors. Even running, it is a stdio server that a laptop cannot reach. It has no `capture_view` or selection tools. It makes a second replica writing the file (Q5 case 5). |
| **Android TWA (Bubblewrap)** | Android only, and functionally the installed PWA in Chrome: no native file save, no share-sheet file, no Keychain, no listener. Storage is Chrome's profile, cleared with Chrome's site data. The relay from an `https` page to a LAN `ws://` meets the same mixed-content and Local Network Access blocks as the hosted PWA (`ai-partner.md` spike, desktop; Android **unverified**). Kept as a cheap **Play Store listing** option if wanted later, not as the shell. |
| **Cordova** | Same WKWebView / Android WebView, and Capacitor runs most Cordova plugins. Releases come months apart (ios `rel/8.1.1` 2026-07, android `rel/15.1.0` 2026-07) against Capacitor's weeks, and the server plugins found are from 2022. Nothing it offers that Capacitor does not. |
| **PWABuilder packages** | The iOS output is a one-off generated Swift project with no plugin system, so every native capability becomes hand-written Swift we own. Whether it bundles assets or loads the live URL is unverified; loading the URL meets App Store guideline 4.2 ("beyond a repackaged website") and 2.5.2. The Android output is a TWA (above). |
| **Plain PWA install only (status quo)** | No store presence, no Keychain, no native file or share, and on iOS the LAN relay is **blocked** (WebKit treats `ws://` and `http://` loopback/LAN from an `https` page as mixed content, measured in `ai-partner.md`'s spike). It stays the baseline and keeps working; it just cannot satisfy "expose the tools from a phone". |
| **Route B, foreground local listener** | Deaf whenever iOS suspends the app (TN2277), so it only works with the app on screen. It exposes a plain-HTTP MCP endpoint with project contents to the whole Wi-Fi. The only Capacitor plugin found has 0 stars, and iOS would rest on GCDWebServer (its maintenance status is **unverified**). Android needs a foreground service and a permanent notification. |
| **Route C, WebMCP in the shell** | Not implemented in WebKit; Android WebView unverified; no in-app agent to call it. Decision 13 stays a desktop-Chromium feature. |
| **Hosted `wss://` relay** | Needs a backend and an account system, neither of which exists (`hosting.md`). Revisit when one is wanted for cellular or remote use. |

---

## Recommendation

1. **Shell: Capacitor 8**, bundling the Vite build. Do not use `server.url`: App Store 2.5.2
   requires a self-contained app. The hypothesis is confirmed on maintenance, plugin coverage and
   cost (6.7 KB gzip of JS runtime).
2. **Tools run in the page**, unchanged. The BYOK chat needs no MCP hop and keeps its one atomic
   `ai` merge.
3. **Files**: a third `shell` mode in `src/storage/fileSystem.js`. Save means write to the container
   and then **Share…**. Open keeps `<input type=file>`. In-place re-read covers files in the app's
   own container only. Never ship the Blob-download path inside the shell (#5478).
4. **Storage**: IndexedDB stays the working store. The autosave and user library are mirrored to
   native files, and the two credentials move to Keychain/Keystore behind the existing credential
   interface.
5. **Rendering**: before any store build, add a `webglcontextrestored` rebuild (or an in-app
   Reload view) to `Viewport.vue`. In a shell, "Reload the page" is a dead end.
6. **Outside reachability: route A.** The reserved standalone `--live` host on the laptop
   (Decision 11) on the LAN, with a pairing-code authorization policy. The app dials out and
   reconnects on resume. State in the UI that this works **only while the app is open on
   screen**. The dev-host bridge, BYOK and WebMCP routes are unchanged.
7. **Help GIFs**: decide whether the 89 MB of `dist/help/img` ships in the binary or is fetched on
   demand. Both fit under store limits; it is a size-versus-offline call for the user.
8. **Two decisions only the user can make before any store submission:**
   - **AGPL-3.0 on the Apple App Store.** In 2011 VLC was removed over the conflict between the GPL
     and App Store terms. WarpCad takes DCO sign-offs, not a CLA, so the owner cannot grant an
     App-Store exception for other contributors' code without their consent. This record does not
     resolve it; it is a licensing decision for the owner, and possibly legal advice. Google Play and
     sideloading do not raise the same question (**unverified** for Play's current terms).
   - **Apple Developer Program enrolment and signing in CI.**

## Suggested follow-up roadmap rows (suggestions only, not added)

1. `build-0xx` **Capacitor spike, throwaway branch.** iOS and Android builds of `dist/`. Record:
   native binary size; three.js frame time on a reference phone and tablet; context loss after
   backgrounding on iOS 26; IndexedDB after a forced low-storage condition; whether
   `capacitor://` blocks `ws://` to a LAN address; the CSP `<meta>` under the custom scheme;
   `src/pwa.js` being inert; `<input type=file>` on both platforms; #5478 confirmed.
2. `ui-0xx` / render: **WebGL context restore** (`webglcontextrestored` rebuilds the renderer, or
   an in-app Reload view). This extends the viewport subsystem, so re-drive the acceptance
   scenarios that touch the viewport.
3. `io-0xx` **`shell` file mode**: Filesystem + Share + Open, labels from `getFileCapabilities`,
   inbound "Open in WarpCad", and `readCurrent` for container files.
4. `io-0xx` **Durable storage**: native mirror of the autosave and user library. Separately, call
   `navigator.storage.persist()` on the hosted PWA.
5. `ai-0xx` **Credentials in Keychain/Keystore** behind `createCredentialStore` (health-check the
   secure-storage plugin first).
6. `ai-0xx` **Standalone `--live` host on the LAN**: pairing-code authorization (Decision 11's open
   item), app dial-out, reconnect on resume, and the "only while open" copy. `ws` 8.x health check
   per Decision 11.
7. `ai-0xx` (optional, a change to Decision 11) **Fork per remote turn**: one `mergeFrom` on
   end-of-turn or idle, so a sleeping phone lands nothing instead of half a turn (Q5 cases 1-4).
8. `build-0xx` **Store release pipeline**: signing, Play and App Store listings, how a release
   relates to `release.md`, and the AGPL / App Store decision above.

## Revisit when

- A hosted backend appears. Then the internet `wss://` relay becomes the better route A
  (it works on cellular, needs no LAN and shows no prompts).
- WebKit or Android WebView ship WebMCP, or a mobile in-browser agent appears.
- Tauri 3 reaches stable with documented mobile plugin coverage.
- nodejs-mobile publishes a Node ≥ 22 release (it would still not fix reachability).
- Apple changes guideline 4.2, 4.7 or 2.5.2, or the AGPL / App Store question is settled.

## Sources

Fetched or checked 2026-10-20.

- **GitHub API** (`gh api`): `ionic-team/capacitor`, `ionic-team/capacitor-plugins`,
  `tauri-apps/tauri` (and the `platform: iOS` / `platform: Android` label searches),
  `nodejs-mobile/nodejs-mobile` (tags, branches, commits, issues #134 and #161),
  `JaneaSystems/nodejs-mobile`, `GoogleChromeLabs/bubblewrap`, `pwa-builder/PWABuilder`,
  `apache/cordova-ios`, `apache/cordova-android`, `hampoelz/Capacitor-NodeJS`,
  `aparajita/capacitor-secure-storage`, `capawesome-team/capacitor-plugins`,
  `cantoo-scribe/capacitor-http-server` (README). Capacitor source:
  `ios/Capacitor/Capacitor/WebViewDelegationHandler.swift` and
  `android/capacitor/src/main/java/com/getcapacitor/BridgeWebChromeClient.java`. Capacitor issue #5478.
- **npm registry**: `@capacitor/core`/`cli`/`ios`/`android`/`filesystem`/`share`/`app`/
  `preferences`/`background-runner`, `@tauri-apps/cli`/`api`, `nodejs-mobile-react-native`,
  `@bubblewrap/cli`, `@capawesome/capacitor-file-picker`, `@capgo/capacitor-file-picker`,
  `@aparajita/capacitor-secure-storage`, `@cantoo/capacitor-http-server`,
  `cordova-plugin-webserver`.
- **Apple**: TN3179 "Understanding local network privacy"
  (`developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy`);
  TN2277 "Networking and Multitasking"; App Store Review Guidelines 2.5.2, 4.2 and 4.7; Apple
  Developer Forums threads 737042, 681892, 716118, 781744 and 726686 (forum posts, not official
  statements).
- **WebKit**: "Updates to Storage Policy" (webkit.org/blog/14403), "Full Third-Party Cookie
  Blocking and More" (webkit.org/blog/10218), "App-Bound Domains" (webkit.org/blog/10882);
  bugs 277615 and 206741.
- **Capacitor docs**: "Storage" guide (`capacitorjs.com/docs/guides/storage`) and "Config"
  (`capacitorjs.com/docs/config`). Capacitor 8 toolchain figures are from the Capawesome and
  Capgo upgrade guides and Ionic's "Announcing Capacitor 8" (2025-12-08), not from Capacitor's own
  upgrade page.
- **Tauri docs**: `v2.tauri.app/start/`, `/plugin/`, `/plugin/localhost/`.
- **Chrome**: "Trusted Web Activity overview" (`developer.chrome.com/docs/android/trusted-web-activity/overview`).
- **WebMCP**: Playwright's WebMCP class docs (WebKit not implemented); secondary 2026 blog
  reports on Chrome's flag and origin trial. Also `ai-partner.md` Decision 13.
- **Forums and reports (anecdotal)**: three.js forum (iOS 17 context loss; mobile WebView
  stutter), PlayCanvas forum (WKWebView context loss to iOS 17.2), Textastic feedback 4001,
  Babylon.js forum (Tauri WebKit jitter), Ionic blog 2020 and Thinktecture on the ITP counter in
  WKWebView, and press coverage of VLC's 2011 App Store removal.
- **This repository**: `src/ai/tools/index.js`, `src/ai/tools/batch.js`, `src/ai/agent.js`,
  `src/ai/bridge/tabEndpoint.js`, `src/ai/bridge/protocol.js`, `mcp/server.js`,
  `mcp/projectFile.js`, `mcp/lock.js`, `mcp/bridge.js`, `mcp/liveBridge.js`, `mcp/package.json`,
  `src/storage/fileSystem.js`, `src/storage/indexeddb.js`, `src/storage/tokenStorage.js`,
  `src/storage/aiKey.js`, `src/storage/localMirror.js`, `src/pwa.js`, `src/core/replica.js`,
  `src/components/viewport/Viewport.vue`; `docs/decisions/ai-partner.md` (Decisions 5, 6, 11, 13),
  `docs/decisions/document-sync.md`, `docs/decisions/persistence-export.md` (sub-decision 2),
  `docs/decisions/hosting.md`.

<!-- SPDX-License-Identifier: CC-BY-SA-4.0 -->
