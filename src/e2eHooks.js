// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * `TODO/build-015`: e2e specs read and seed the app's own stores from inside the page. On the dev
 * server they did that with `import('/src/stores/document.js')`, which only works because Vite
 * serves each source file at its own URL, so the spec and the app share one module instance. A
 * production build has no such URLs, and serving the source next to it would load a *second* copy of
 * every store. This hook resolves the same `/src/…` paths to the build's own modules instead.
 *
 * It is compiled in only when `VITE_E2E_HOOKS=1` (set by `playwright.config.js` for the e2e build and
 * the e2e dev server); the shipped build leaves that unset, so `main.js` prunes the import and this
 * file, and every module it globs, never reaches the user's bundle by this route.
 */

/** Lazy loaders keyed by absolute `/src/…` path; specs and `*.docs.js` helpers are left out. */
const loaders = import.meta.glob(['/src/{stores,core,storage}/**/*.js', '!/src/**/*.spec.js', '!/src/**/__fixtures__/**'])

/**
 * Resolve a `/src/…` path to the build's own module, the production-safe stand-in for
 * `import('/src/…')`. `main.js` publishes it as `window.__e2eImport` synchronously, so a spec never
 * races the chunk load.
 * @param {string} path
 * @returns {Promise<any>}
 */
export function loadE2eModule(path) {
  const load = loaders[path]
  if (!load) return Promise.reject(new Error(`__e2eImport: no module at ${path}; add its folder to src/e2eHooks.js`))
  return load()
}
