// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Service-worker registration (`TODO/build-005`, `docs/decisions/hosting.md` "Update path").
 *
 * The worker is `registerType: 'autoUpdate'`: a new build installs, activates and takes control
 * as soon as the browser finds it. The plugin's own response to that is `location.reload()`;
 * `onNeedReload` replaces it, so the page is never reloaded out from under the user — the toast
 * (`UpdateToast.vue`) offers **Reload** instead. Registration happens in the production build
 * only: `vite dev` has no worker.
 *
 * @module pwa
 */

import { registerSW } from 'virtual:pwa-register'

import { createUpdateScheduler } from './core/appUpdate.js'
import { useAppUpdateStore } from './stores/appUpdate.js'

const OFFLINE_READY_KEY = 'warpcad.offlineReadyShown'

/**
 * @returns {string | null} the build for which the offline notice was already shown
 */
function shownFor() {
  try {
    return localStorage.getItem(OFFLINE_READY_KEY)
  } catch {
    return null
  }
}

/** @param {string} build */
function rememberShown(build) {
  try {
    localStorage.setItem(OFFLINE_READY_KEY, build)
  } catch {
    // Storage unavailable: the notice may show again next visit, which is harmless.
  }
}

/**
 * Register the worker and start looking for new builds. Call once.
 *
 * @param {import('pinia').Pinia} pinia the app's Pinia (the store is used outside a component)
 */
export function startPwa(pinia) {
  const store = useAppUpdateStore(pinia)
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return

  /** @type {ServiceWorkerRegistration | undefined} */
  let registration
  const scheduler = createUpdateScheduler({ getRegistration: () => registration })
  store.attach(scheduler)

  registerSW({
    immediate: true,
    onNeedReload: () => store.noteNeedRefresh(),
    onOfflineReady: () => {
      const build = `${store.version}+${store.commit}`
      if (shownFor() === build) return
      rememberShown(build)
      store.noteOfflineReady()
    },
    onRegisteredSW: (_url, reg) => {
      registration = reg
    },
    onRegisterError: () => {
      // No worker: the app still runs, it just cannot work offline or check for updates.
    },
  })
  scheduler.start()
}
