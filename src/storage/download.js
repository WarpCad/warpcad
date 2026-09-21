/**
 * Hand a file to the browser as a download — the **one** implementation of it
 * (`TODO/ui-034`, decision (b)).
 *
 * `<a download>` pointing at a `Blob` object URL is the only download every supported engine
 * (Chromium, Firefox, WebKit — desktop, iPhone and iPad) honours without a picker. Two
 * callers need it: File ▾ → **Download copy** (`fileSystem.js`, the project's NDJSON text) and
 * File ▾ → **Export…** (`stores/exportDialog.js`, an STL/OBJ/glb's bytes). They must not each
 * grow their own, because the parts of this that go wrong are the same parts for both and
 * only show up on a real phone: the URL must **outlive the click** (revoking at once can
 * cancel the download in Safari) and must still be **revoked** afterwards (a Blob URL holds
 * the whole file in memory until it is, and an export can be megabytes).
 *
 * A download cannot be confirmed to have landed — only started — so a caller's wording must
 * say "started" or, for export, describe what was *handed over*, never "saved to disk".
 *
 * Framework-free and DOM-free by injection: `env` is the browser globals (default
 * `globalThis`), so a unit test needs no real anchor, Blob or object URL.
 *
 * @module storage/download
 */

/** How long the object URL outlives the click — revoking at once can cancel the download. */
export const REVOKE_AFTER_MS = 30_000

/**
 * @param {unknown} error
 * @returns {string}
 */
function reasonOf(error) {
  if (error instanceof Error) return error.message === '' ? error.name : error.message
  return String(error)
}

/**
 * Start a download of `data` under `name`.
 *
 * Must be called synchronously from a user gesture where the browser requires one (iOS
 * Safari drops a programmatic `click()` on an anchor whose gesture has lapsed) — the export
 * path calls it straight after its `await`, which is still within the activation window
 * Playwright and real browsers allow for a completed user-initiated task.
 *
 * @param {Uint8Array | string} data The file's contents.
 * @param {string} name The suggested filename, e.g. `union-1.stl`.
 * @param {string} mimeType The Blob's type, e.g. `model/stl`.
 * @param {any} [env] Browser globals; default `globalThis`. Tests pass a fake.
 * @returns {{ ok: true, name: string } | { ok: false, name: string, error: string }}
 */
export function downloadBytes(data, name, mimeType, env = globalThis) {
  try {
    const blob = new env.Blob([data], { type: mimeType })
    const url = env.URL.createObjectURL(blob)
    const anchor = env.document.createElement('a')
    anchor.href = url
    anchor.download = name
    anchor.style.display = 'none'
    env.document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    // Called detached: `window.setTimeout` throws "Illegal invocation" when `this` is some
    // other object, which is exactly what a caller-supplied `env` would be.
    const { setTimeout: later } = env
    later(() => env.URL.revokeObjectURL(url), REVOKE_AFTER_MS)
    return { ok: true, name }
  } catch (error) {
    return { ok: false, name, error: reasonOf(error) }
  }
}
