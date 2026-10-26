# Native mobile shell: Capacitor, tools in the page, an outbound relay for outside agents

**Status:** proposed 2026-10-20 (`TODO/build-003`); revised 2026-10-21 with a head-to-head of
Capacitor and Tauri 2 (Question 7), at the owner's request. **Decided 2026-10-24: Tauri 2** (owner
decision, below), overriding the Capacitor recommendation at the end of this record.

## Owner decision, 2026-10-24: Tauri 2, not Capacitor

**Accepted 2026-10-24 by the owner, overriding Recommendation 1.** The iOS app is built with
**Tauri 2** (the stable 2.x line, not the 3.0 alpha), in its own repository beside this one at
`~/src/@WarpCad/warpcad-native`. The owner's stated reasons are Tauri's size (the 0.9 KB gzip page
shim against Capacitor's 6.7 KB, Question 1) and its security structure (default-deny capabilities,
two published audits, Question 7c). The comparison below is kept unchanged as the record of what
was weighed.

**Addendum, 2026-10-26: targets widened.** The owner also wants **iPadOS, macOS, Android and Windows**. Tauri 2 covers all five from one codebase (iOS and iPadOS are one `ios` target; Android uses `cargo tauri android`; macOS and Windows are the desktop targets). The Capacitor-vs-Tauri comparison below was iOS-weighted; Tauri's Android and Windows maturity, WebView2 and Android WebView WebGL behaviour, and per-OS signing are **unverified** and belong to the `build-017` health check (Question 8) and per-platform probes filed in `warpcad-native`. Once `build-017` scaffolds that repository, the native TODOs move there.

What this changes, and the roadmap rows that carry it (milestone M19 in `TODO/ROADMAP.md`):

| Recommendation | Under Tauri | Row |
|---|---|---|
| 1. Shell: Capacitor 8 + compensating controls | Tauri 2 bundling the Vite build (no remote URL, App Store 2.5.2). Compensating controls become Tauri's own: one capability file granting the main window only the commands the app uses, fs scopes limited to the app's own folders, the production CSP kept strict, no remote navigation. Health check re-run at pull-in | `build-017` |
| — | On-device probe of what Question 7 left unmeasured: binary size, cold start, memory, context loss, `ws://` from `tauri://localhost`, `<input type=file>`, Blob download, and which agents can reach an MCP server in the app | `build-018` |
| 3. Files: a `shell` mode, Save = Share… | A `native-app` mode. Projects save **in place** to the app's Documents folder, which the Files app shows under *On My iPhone › WarpCad* (`UIFileSharingEnabled`, `LSSupportsOpeningDocumentsInPlace`), so Save needs no share plugin. Open uses `tauri-plugin-dialog`. Exports go through the same native write, never a Blob download | `io-014` |
| 4. Storage: native mirror | Unchanged in intent; the mirror is written with `tauri-plugin-fs` | `io-015` |
| 4. Credentials to Keychain | No official Tauri Keychain plugin: the `keyring` crate or a small Swift plugin of our own, chosen at the task's health check | `ai-025` |
| 5. WebGL context restore before any store build | Unchanged | `render-006` |
| 6. Outside reachability: route A only | **The owner also wants an MCP server inside the app** (route B, rejected above). It is built knowingly with route B's limits stated in the UI: it answers only while the app is on screen (TN2277), it listens on loopback by default, and LAN access is an explicit, timed, token-gated opt-in. Tauri's official Rust MCP SDK (`rmcp`) serves it; the tools stay the page's registry, relayed over Tauri IPC to `TabEndpoint`, so the host adds no tool. Route A (`ai-019`) stays reserved | `ai-026` |
| 7, 8. Help GIFs, AGPL / App Store, enrolment, signing | Unchanged as owner decisions; scheduled with the store work | `build-019`, `build-020` |

Two costs from Question 7 are accepted with this decision and are budgeted in the rows above: the
open Tauri iOS packaging and CI-signing issues (#13578, #15066, #15663, #15740), which is why the
TestFlight upload (`build-019`) runs early instead of last, and the crate licence audit, which needs
a `cargo-deny` gate in the new repository (`build-017`, `build-020`).

**Revisit when** (in addition to the list at the end): a Tauri iOS packaging bug blocks the App
Store upload with no workaround, or the `build-018` probe shows a WebGL or storage behaviour in
Tauri's WebView setup that Capacitor's (Question 1, "WebContent process killed") handles and Tauri
does not.

---

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
- **Not done**: no app was built or run. No Xcode or Android Studio spike was run, so
  **on-device WebGL behaviour, memory and start-up time are unmeasured** and are labelled that way
  below. The TODO allows a throwaway spike. It is the first follow-up row instead, because a real
  one needs signing, a device and an Apple account. (The 2026-10-21 revision did measure the
  **native code each shell links into an iOS app**: Capacitor's prebuilt framework, and a minimal
  Tauri 2 library compiled for an iOS device. See Question 7.)

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
| Native binary size | **~0.97 MB** iOS arm64 (`Capacitor` 860 KB + `Cordova` 110 KB, measured 2026-10-21, Q7); Android unmeasured | **4.5-7.8 MB** iOS arm64 for a minimal app with `fs`, `dialog`, `websocket` (compiled 2026-10-21, Q7); Tauri's "less than 600KB" is a desktop figure; Android unmeasured | Embedding Node adds tens of MB (**unverified**, not measured) | Small Android wrapper (**unmeasured**) | Unmeasured | Unmeasured | 0 |
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

## Question 7: Capacitor or Tauri 2, head to head (revisited 2026-10-21)

The owner asked for this question to be reopened with only the two real contenders, because Rust
is now well supported by coding agents, and to answer four things directly: which one serves the
MCP tool surface and local file storage better, which has the smaller footprint when loading and
running, which has the better security culture, and whether either has a record of App Store
trouble. The target that matters most is **iOS**: the owner has an iPhone and no Android hardware
(`TODO/build-016`, Part 1).

How these figures were gathered, **2026-10-21**:

- **Native size**: Capacitor's prebuilt `Capacitor.xcframework` and `Cordova.xcframework` from the
  `capacitor-swift-pm` 8.5.3 release (2026-10-07), arm64 device slice, file size of the Mach-O
  binary. Tauri: a scratch crate with `tauri` 2.12.5, `tauri-plugin-fs` 2.7.1,
  `tauri-plugin-dialog` 2.8.3, `tauri-plugin-websocket` 2.5.0 and a nine-line `lib.rs`
  (`Builder` + three plugins + `generate_context!`), compiled with `cargo build --release --lib
  --target aarch64-apple-ios` (rustc 1.99.1, Xcode 27.1 iPhoneOS 27.1 SDK, Apple M4 Pro), size of
  the stripped `cdylib`. Two profiles: size-optimised (`opt-level = "s"`, `lto = true`,
  `codegen-units = 1`, `panic = "abort"`, `strip = true`) and a default-like one (`opt-level = 3`,
  no LTO, 16 codegen units, stripped symbols). A `cdylib` is a proxy for what links into the app
  executable, not the app itself.
- **Crate tree and licences**: `cargo metadata --filter-platform aarch64-apple-ios` on the same
  crate, walking normal (non-dev, non-build) dependencies from the root.
- **Security**: GitHub repository security advisories (`repos/<r>/security-advisories`) and the
  global advisory database (`/advisories?affects=<pkg>`), each project's `SECURITY.md`, and the
  Radically Open Security report for Tauri 2.0 (`audits/Radically_Open_Security-v2-report.pdf` in
  the Tauri repository, dated 2024-08-07, text extracted with PDFKit).
- **Issues**: GitHub search counts (`type:issue`), labels `platform: iOS` / `platform: Android`
  (Tauri) and `platform: ios` (Capacitor).
- **App Store**: GitHub issue search for upload and review failures in both repositories, Apple's
  "Third-party SDK requirements" page, Tauri's App Store distribution docs, and practitioner posts
  (labelled as such).
- **Not done**: no app on a device or simulator (this machine has no iOS simulator runtime and no
  Android SDK). Runtime memory and cold start are therefore **unmeasured** for both.

### 7a. MCP services and local file storage

**The MCP tool surface is the same in both, because it is JavaScript in the page.** The registry
(`src/ai/tools/`), the BYOK agent and `TabEndpoint` run in the WebView under either shell. Neither
shell makes a tool faster, adds one, or changes the single-writer rules in Question 5. iOS suspends
the **whole process** when the app is backgrounded (TN2277), Rust included, so a native Rust MCP
server is as deaf in the background as a native Swift one: route B stays rejected under Tauri for
the same reasons it is rejected under Capacitor.

Where the shells *do* differ is the transport for route A and the file plumbing:

| Need | Capacitor 8 | Tauri 2 |
|---|---|---|
| Relay socket from page JS (route A, first choice) | `WebSocket` in WKWebView: no Local Network prompt (TN3179). Open risk: mixed content from `capacitor://` / `https://localhost` (Q4) | Same `WebSocket` in the same WKWebView. Origin is `tauri://localhost` on iOS and `http://tauri.localhost` on Android by default; whether `ws://` to a LAN address is blocked from either is **unverified** (spike item, as for Capacitor) |
| Relay socket from native code (route A, fallback if mixed content blocks it) | **No official plugin.** Our own Swift and Kotlin, or a community plugin to health-check | **Official `tauri-plugin-websocket`** 2.5.0 (Rust client, README marks iOS and Android supported). One implementation for both platforms. Still a native socket to a LAN address, so it **does** show the iOS Local Network prompt (TN3179) |
| A native MCP SDK, if the relay client ever moved native | Swift SDK `modelcontextprotocol/swift-sdk` 0.12.1 (2026-05-07, 1,512 stars) and Kotlin SDK 0.15.0 (2026-07-28, 1,474 stars): two languages | `rmcp` 3.6.0 (2026-10-20, 4,037 stars): official Rust SDK, one language. Not needed by this record's design |
| Write a project file into the app container | Official `@capacitor/filesystem` 8.1.5 | Official `tauri-plugin-fs` 2.7.1. Docs: on iOS and Android "Access is restricted to Application folder by default"; iOS needs a `PrivacyInfo.xcprivacy` declaring reason C617.1 |
| Hand the file to the user (Save to Files) | Official `@capacitor/share` 8.0.3 | **No official share plugin** (the plugin list has none); community only |
| Open a file the user picks | `<input type=file>` (works, Q3) or a community picker | `<input type=file>` (**unverified** in Tauri's WebView setup), or official `tauri-plugin-dialog` 2.8.3. Docs: iOS returns `file://` URIs, Android returns **content URIs**, and neither supports a folder picker |
| Credentials in Keychain / Keystore | Community `@aparajita/capacitor-secure-storage` (1 maintainer) | **No official Keychain plugin.** `stronghold` is an encrypted file, not the Keychain; `biometric` is official but is not a secret store |
| Blob `<a download>` | Broken (#5478), designed around in Q3 | **Unverified** |

**Answer for 7a:** Tauri has one real advantage, an official native WebSocket that would remove
route A's mixed-content risk with a single implementation if the spike shows the page cannot reach
`ws://`. Capacitor has the more complete file story on iOS (official share, so **Save** reaches
Files without community code). Neither changes how the tools themselves run.

### 7b. Footprint when loading and running

| | Capacitor 8 | Tauri 2 |
|---|---|---|
| Native code linked into the iOS app (arm64) | **~0.97 MB** (`Capacitor` 859,552 B + `Cordova` 110,136 B, prebuilt 8.5.3) | **4.46 MB** size-optimised, **7.78 MB** default-like (minimal app + `fs`, `dialog`, `websocket`, measured above) |
| Native code on Android | Unmeasured | Unmeasured. One Rust `.so` per ABI; Play's App Bundle delivers one ABI per device. A third-party Tauri project reports ~40 MB per-ABI APKs, but that app carries its own large Rust libraries, so it is not a Tauri baseline |
| JS runtime added to the page | 6,669 B gzip (measured 2026-10-20, Q1) | 884 B gzip (measured 2026-10-20, Q1) |
| What dominates the download | The web payload in both: 3.5 MB of `dist/assets` plus 89 MB of Help GIFs unless excluded (Q1, Recommendation 7). With the GIFs bundled, the 3.5-6.8 MB native difference is under 8% of the app. **Without them it is not small**: it is about as large as the app's own 3.5 MB of assets | |
| Asset loading at start-up | Bundled files served from disk through a `WKURLSchemeHandler` (Swift) | Bundled files served from disk through Tauri's custom-protocol handler (Rust) |
| Running memory | **Unmeasured.** Both run the same system WebView, and WarpCad's memory is three.js, the meshes and the worker kernel inside the WebContent process, which is the same in both. The native side of either is a small fraction of that | Same |
| Cold start | **Unmeasured.** Desktop Tauri-vs-Electron start-up claims found online do not apply: neither shell here ships a browser engine | Same |
| Build-time cost | `npx cap sync` + Xcode; no new language | Rust toolchain + iOS targets + Xcode (+ NDK for Android). The minimal crate took **32.5 s** wall clock for a clean release build on an M4 Pro and **1.3 GB** of `target/` |

**Answer for 7b:** neither has a meaningful running-footprint advantage. Both run the same WebView,
which is where all of WarpCad's memory and frame time is. On disk, **Capacitor's native layer is
about 4.5-8× smaller** on iOS (3.5-6.8 MB less), and Tauri's JS shim is about 5.8 KB smaller gzip.
The native difference only disappears into the noise if the Help GIFs ship in the binary; if they
are fetched on demand (Recommendation 7), Capacitor's app is noticeably smaller. Only the spike (follow-up row 1) can settle cold start and memory,
and it should time both shells if Tauri is still in contention by then.

### 7c. Security culture

| Signal | Capacitor | Tauri |
|---|---|---|
| Independent audit | **None found** (web search 2026-10-21, no published audit of Capacitor or Ionic's framework) | **Two, both published in the repo.** Radically Open Security audited v1 (2022) and **v2 (2023-11-10 to 2024-08-03, 80 days, scope included "mobile platform support (iOS, Android)")**: 11 High, 2 Elevated, 3 Moderate, 5 Low, 2 Info; "All findings in this report have been resolved in the release candidate of Tauri v2." Funded by NLnet |
| Published advisories | **1** repository advisory ever: GHSA-rvm3-566m-v7fv, **critical**, 2026-08-31: remote content could load at the app's own origin through the internal `/_capacitor_http_interceptor_` path, even with `CapacitorHttp` disabled. Fixed on the same day in 6.2.2, 7.6.9, 8.3.5, 8.4.3 and 8.5.1 (three majors back-patched) | **9** repository advisories since 2022 (plus 1 in `tauri-plugin-shell`, critical, 2025-04-02), with external researchers credited. The two newest are 2026-05-06 (medium, Android/Windows origin confusion lets `http://app.attacker.com` call local-only commands, fixed in 2.11.1) and 2026-09-26 (high, cross-WebView channel data theft through guessable sequential IDs, fixed in 2.11.6) |
| Disclosure policy | Org-wide `SECURITY.md`: "report security vulnerabilities via email to security@outsystems.com". No timeline stated | `SECURITY.md`: GitHub private vulnerability reporting, coordinated disclosure, "within 90-Days", credit offered, no bounty |
| Built-in limits on what page script can do | **None documented.** Capacitor's security guide covers CSP and SSL; it describes no permission system for which origins or frames may call which plugin. Any script running in the page can call every installed plugin | **Default-deny capabilities.** Each plugin command needs a permission granted to a named window, and file commands also need a path scope ("Permissions alone do not grant a scope"; deny overrides allow; `..` blocked). An optional isolation pattern screens every command |
| Recurring bug classes | Too few advisories to tell | Two classes recur. **Origin checks** (2023-05 open redirect, 2024-05 iframes, 2026-05 Android origin confusion) and **guessable global IDs** (audit finding TAU2-044 in 2024, then the 2026-09 channel advisory) |

Reading the table honestly:

- **Tauri's culture is visibly stronger**: two funded third-party audits including mobile, published
  in full, a documented disclosure process, credited reporters, and a permission model designed to
  contain a compromised page. Its higher advisory count is mostly the result of that scrutiny; it is
  not on its own evidence of worse code. The recurrences show the hard part (origin checks on
  Android's `http://<scheme>.localhost` mapping) is still producing bugs, and 2026-05's was
  Android-specific.
- **Capacitor's record is thin rather than clean.** One advisory in the repository's life, no
  audit, and an email-only policy. That could mean few bugs or little scrutiny, and the evidence
  cannot tell which. The one advisory was critical and was back-patched across three majors on the
  day it was published, which is a good sign about response.
- **What it means for WarpCad.** The trust model in `ai-partner.md` assumes text in a loaded project
  is hostile data. If that ever turned into script execution in the page, Capacitor would give the
  attacker every installed plugin (file write, share sheet, the Keychain plugin holding the API key),
  while Tauri would give only what the main window's capability grants. **The plugins proposed for
  Capacitor are exactly the ones worth stealing**, so Capacitor needs compensating controls: the
  existing production CSP kept strict inside the shell, `CapacitorHttp` left disabled, no
  user-controlled links rendered as navigable anchors in the app, `server.allowNavigation` left
  empty, and a floor of `@capacitor/ios` / `@capacitor/android` 8.5.1.

### 7d. App Store record

- **Rejection on review (guideline 4.2, "minimum functionality")** is a risk for any WebView app and
  applies to both equally. The practitioner reports found for Tauri and for Capacitor agree that
  bundled assets and real device integration (files, share sheet, Keychain) are what reviewers look
  for, and these sources are mostly vendors or blog posts, not Apple. WarpCad is a full CAD app with
  bundled assets, not a wrapped website, which is the strongest position under 4.2 either way.
  **No rejection specific to either framework was found.**
- **Apple names Capacitor and Cordova on its "commonly used third-party SDKs" list**, so a new app
  that includes them must carry their privacy manifest, and their binaries must be signed. Capacitor
  ships signed prebuilt frameworks to meet that. Tauri is not on the list; its Rust compiles into
  the app, and the `fs` plugin needs the app's own privacy manifest entry (above).
- **Capacitor's open App Store issues**: #8537 (opened 2026-07-23, open): a report that App Review
  rejects apps with ITMS-90111 because the prebuilt frameworks were built with Xcode 26.0, and that
  rebuilding them breaks Apple's SDK-signature check (ITMS-91065). The latest comment (2026-09-03)
  suggests the cause is submitting from a macOS beta. **Unresolved.** A 9.0.0-alpha packaging bug
  that failed upload validation (nested `Capacitor.framework`) was closed 2026-08-08.
- **Tauri's open App Store issues** are in the build and upload pipeline, not review:
  - #13578 (open since 2025-06-05): Transporter rejects the IPA because the bundle contains
    `libapp.a` ("standalone executables or libraries … not permitted"); the reported workaround is
    deleting `gen/apple`.
  - #15066 (open since 2026-03-11): `ld: library not found for -lswiftCompatibility56` with Xcode
    26. The issue notes Apple has required the iOS 26 SDK for submissions since 2026-04-28. A
    maintainer could not reproduce it on fresh apps; one commenter traced it to the Metal toolchain.
  - #15663 (open since 2026-07-06): app extensions such as a share extension lose their
    entitlements when building with App Store Connect API-key auth, which is what CI signing uses.
  - #15740 (open since 2026-07-18): signing identity not found by `xcodebuild` on clean CI runners
    with Xcode 26.
- **Mobile maturity by issue tracker**: Tauri `platform: iOS` 46 open / 88 closed, with **16 opened
  and 4 closed** since 2026-04-21 (30 open are labelled bugs); `platform: Android` 91 / 116.
  Capacitor `platform: ios` **10 open / 596 closed**, 2 opened since 2026-04-21. Only one named
  Tauri iOS app on the App Store turned up (a Medium post about flow-like.com, not verified against
  the store listing).

**Answer for 7d:** no framework-specific review rejections were found for either. Tauri's iOS
problems are packaging and CI-signing bugs, several still open, in exactly the step this project
would automate (`build-0xx` store pipeline). Capacitor carries one open, unconfirmed report and has
an obligation (privacy manifest plus signed SDK) that it already meets.

### 7e. Rust and coding agents

Agents do write Rust well, and the Rust compiler catches a class of mistakes that JavaScript does
not. For this app, though, **the Rust in a Tauri shell is about nine lines** (the measured probe's
whole `lib.rs`), because the geometry kernel (`@jscad/modeling`), the tools, the document model and
the UI all stay JavaScript under the committed stack. Choosing Tauri would not move meaningful code
into Rust. It would add a second language, a second toolchain and a second dependency ecosystem to
the build and to the licence audit:

- The minimal Tauri app links **270 crates** on iOS (normal dependencies, some of them compile-time
  proc-macros), against Capacitor's two prebuilt frameworks plus its npm plugins.
- Those crates carry licences that are **not on `npm run licenses`' allow-list**: `Unicode-3.0`
  (19 crates, the `icu_*` / `zerovec` family), `CDLA-Permissive-2.0` (`webpki-roots`), `Zlib`
  (in dual/triple-licence choices), and `MPL-2.0` (`cssparser`, `selectors`, `dtoa-short`,
  `option-ext`). All are permissive or file-level, but each new allow-list entry is the owner's
  decision (`CLAUDE.md`), and `license-checker` cannot see crates, so a `cargo-deny` gate would be
  new tooling. This matters for `TODO/build-016` Part 2, which has to audit everything in the iOS
  bundle.

Rust would earn its place if WarpCad ever moved real work native (a Rust geometry kernel, or a
native relay with its own logic). Nothing on the roadmap does.

### 7f. Verdict

| Concern | Better | Margin |
|---|---|---|
| MCP tool surface | Tie | Tools are page JS in both |
| Relay transport if page `ws://` is blocked | **Tauri** | Official native WebSocket vs our own Swift + Kotlin |
| File storage on iOS (save, share, open) | **Capacitor** | Official share plugin; Tauri has none |
| Credentials in Keychain | **Capacitor**, narrowly | A community plugin exists; Tauri has no Keychain plugin |
| Native size | **Capacitor** | ~1 MB vs 4.5-7.8 MB; as large as the app's own assets unless the Help GIFs ship |
| JS size | Tauri | 0.9 KB vs 6.7 KB gzip |
| Running memory, cold start | Tie (**unmeasured**) | Same WebView |
| Security architecture and culture | **Tauri** | Audits, disclosure, default-deny capabilities |
| iOS maturity and App Store pipeline | **Capacitor** | 10 vs 46 open iOS issues; Tauri's open issues sit in IPA upload and CI signing |
| Toolchain and licence audit | **Capacitor** | No second language; 270 crates for Tauri |

**Capacitor remains the recommendation for WarpCad's iOS app**, now with explicit security
compensations (7c) that the 2026-10-20 version did not list. Tauri wins on security culture and on
one transport detail, and loses on what this project needs first on iOS: the file and share path,
the store pipeline, and a smaller audit surface for `build-016`. The two places Tauri would win are
named in **Revisit when**, so the question reopens on evidence rather than preference.

---

## Rejection table

| Option | Why not |
|---|---|
| **Tauri 2 mobile** | Revisited head to head in Question 7 (2026-10-21). It is **better on security culture** (two published third-party audits including mobile, a 90-day disclosure policy, default-deny capabilities that would contain a compromised page) and has an official native WebSocket for route A. It loses on what the iOS app needs first: no official share plugin or Keychain plugin, so **Save** to Files needs community code; open iOS IPA-upload and CI-signing bugs (#13578, #15066, #15663, #15740) in the step this project would automate; 46 open iOS issues against Capacitor's 10; 4.5-7.8 MB of native code on iOS against ~1 MB; and 270 crates to licence-audit for `build-016`, with four licence families not on the allow-list. Same WebViews, so no rendering, storage or running-memory gain. The Rust surface would be about nine lines, so agent-friendliness with Rust does not move meaningful code. v3 is in alpha (milestone 25% complete on 2026-09-21), so starting on v2 means a major migration soon. |
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
   cost (6.7 KB gzip of JS runtime, ~1 MB of native code on iOS). Re-checked against Tauri 2 on
   2026-10-21 (Question 7): Capacitor still wins on iOS file and share coverage, App Store pipeline
   maturity and audit surface. Tauri is stronger on security culture, so Capacitor is taken
   **with compensating controls**: pin `@capacitor/ios` / `@capacitor/android` ≥ 8.5.1
   (GHSA-rvm3-566m-v7fv); keep `CapacitorHttp` disabled; keep the production CSP strict inside the
   shell; leave `server.allowNavigation` empty; install only the plugins the app uses, since any
   page script can call any installed plugin; and never render project-supplied text as a
   navigable link in the shell.
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
   `src/pwa.js` being inert; `<input type=file>` on both platforms; #5478 confirmed. The
   `ws://` result also settles Question 7's one Tauri-favouring transport row; if it is blocked,
   build the same probe in Tauri and time cold start and memory in both before committing.
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
- Tauri 3 reaches stable with documented mobile plugin coverage, **and** its open iOS IPA-upload
  and CI-signing issues (#13578, #15066, #15663, #15740) are closed, **and** an official share or
  Keychain plugin exists. Then re-run Question 7 with the spike timing both shells.
- The spike (follow-up row 1) finds page JS cannot open `ws://` to the LAN. Route A then needs a
  native socket, where Tauri's official `tauri-plugin-websocket` beats writing Swift and Kotlin
  for Capacitor; weigh that against Question 7's other rows.
- A Capacitor advisory or audit shows a page-to-plugin escalation that the compensating controls in
  Recommendation 1 cannot contain, or WarpCad starts showing remote content in the shell. Tauri's
  capability model is the reason to switch in either case.
- WarpCad moves real work native (a Rust kernel, or a relay with its own logic). Then Rust's place
  in the build is earned and Tauri's toolchain cost is already paid.
- nodejs-mobile publishes a Node ≥ 22 release (it would still not fix reachability).
- Apple changes guideline 4.2, 4.7 or 2.5.2, or the AGPL / App Store question is settled.

## Sources

Fetched or checked 2026-10-20, except Question 7's, which were fetched or measured 2026-10-21:

- **Question 7, measured**: `ionic-team/capacitor-swift-pm` release 8.5.3 assets
  (`Capacitor.xcframework.zip`, `Cordova.xcframework.zip`); a scratch Tauri crate compiled for
  `aarch64-apple-ios` and read with `cargo metadata` (method in Question 7). Neither is kept.
- **Question 7, GitHub**: repository advisories for `tauri-apps/tauri` and `ionic-team/capacitor`
  (GHSA-rvm3-566m-v7fv, GHSA-w28w-mhc8-qvjv, GHSA-7gmj-67g7-phm9, GHSA-57fm-592m-34r7 read in full);
  the global advisory database for `@capacitor/*` and the `tauri`, `tauri-plugin-*`, `wry` crates;
  `SECURITY.md` in `tauri-apps/tauri` and `ionic-team/.github`; Tauri issues #13578, #15066, #15663,
  #15740; Capacitor issue #8537; `tauri-apps/plugins-workspace` plugin list and READMEs;
  `modelcontextprotocol/rust-sdk`, `swift-sdk` and `kotlin-sdk` releases.
- **Question 7, audit**: Radically Open Security, "Penetration Test Report, Tauri 2.0", v1.0,
  2024-08-07 (`audits/Radically_Open_Security-v2-report.pdf` in `tauri-apps/tauri`).
- **Question 7, docs**: Tauri "File System" and "Dialog" plugin pages (`v2.tauri.app/plugin/`),
  Tauri "App Store" distribution page; Capacitor "Security" guide
  (`capacitorjs.com/docs/guides/security`); Apple "Third-party SDK requirements"
  (`developer.apple.com/support/third-party-SDK-requirements/`).
- **Question 7, anecdotal**: practitioner posts on guideline 4.2 for Tauri (takazudomodular.com) and
  Capacitor (capgo.app, dev.to), mostly from vendors; a Medium post on shipping a Tauri iOS app
  (flow-like.com); GeoLibre's Android build notes (APK sizes for its own app).

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
