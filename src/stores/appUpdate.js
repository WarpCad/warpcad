// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The app-update notice's state (`TODO/build-005`) — **UI state only**: whether a newer build is
 * waiting, whether a check is running, what it said. No document state. The service worker is
 * wired to it by `src/pwa.js`; the toast (`UpdateToast.vue`) and Help's version row read it.
 *
 * Reloading never happens by itself. {@link reload} takes whether it is safe right now (the
 * caller computes it with `canReloadNow`); when it is not, the toast asks first.
 *
 * @module stores/appUpdate
 */

import { defineStore } from 'pinia'
import { ref } from 'vue'

/** The package version and short commit this build was made from (`vite.config.js` `define`). */
const VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '0.0.0'
const COMMIT = typeof __APP_COMMIT__ === 'string' ? __APP_COMMIT__ : 'dev'

export const useAppUpdateStore = defineStore('appUpdate', () => {
  const version = VERSION
  const commit = COMMIT
  /**
   * What the UI shows for this build (`TODO/ai-024`): the commit alone. The package version is a
   * placeholder (`0.0.0`) that only made the string look unreleased; `<meta name="version">` keeps
   * the full `version+commit` for tooling.
   */
  const buildLabel = `build ${COMMIT}`
  /** A newer build has been installed and a reload would run it. */
  const needRefresh = ref(false)
  /** The first install finished: the app now works offline. */
  const offlineReady = ref(false)
  const checking = ref(false)
  /** Epoch ms of the last manual check that finished, 0 before any. */
  const lastChecked = ref(0)
  /** What the last manual check said, `''` before any. */
  const message = ref('')
  /** Reload was pressed while work is unsaved: the toast is asking "reload anyway?". */
  const confirming = ref(false)

  /** @type {{ checkNow: () => Promise<import('../core/appUpdate.js').CheckResult> } | null} */
  let checker = null
  let reloadPage = () => window.location.reload()

  /** @param {{ checkNow: () => Promise<import('../core/appUpdate.js').CheckResult> } | null} next */
  function attach(next) {
    checker = next
  }

  /** @param {() => void} fn replace the real page reload — for tests */
  function setReloadPage(fn) {
    reloadPage = fn
  }

  function noteNeedRefresh() {
    needRefresh.value = true
  }

  function noteOfflineReady() {
    offlineReady.value = true
  }

  function dismissOfflineReady() {
    offlineReady.value = false
  }

  /** **Later**: hide the toast until the next detection. */
  function later() {
    needRefresh.value = false
    confirming.value = false
  }

  /** Manual **Check for updates**. Never rejects. */
  async function check() {
    if (checking.value) return
    checking.value = true
    try {
      if (checker === null) {
        message.value = 'Updates are not available in this browser or build'
        return
      }
      const result = await checker.checkNow().catch(() => /** @type {const} */ ('failed'))
      if (result === 'found') message.value = 'Update found, reload to apply'
      else if (result === 'latest') message.value = needRefresh.value ? 'Update found, reload to apply' : 'You are on the latest version'
      else if (result === 'unavailable') message.value = 'Updates are not available in this browser or build'
      else message.value = 'Could not check for updates right now'
      if (result === 'latest' || result === 'found') lastChecked.value = Date.now()
    } finally {
      checking.value = false
    }
  }

  /**
   * **Reload**.
   *
   * @param {boolean} safe whether nothing would be lost (`canReloadNow`)
   */
  function reload(safe) {
    if (!safe) {
      confirming.value = true
      return
    }
    reloadPage()
  }

  function confirmReload() {
    confirming.value = false
    reloadPage()
  }

  function cancelConfirm() {
    confirming.value = false
  }

  return {
    version,
    commit,
    buildLabel,
    needRefresh,
    offlineReady,
    checking,
    lastChecked,
    message,
    confirming,
    attach,
    setReloadPage,
    noteNeedRefresh,
    noteOfflineReady,
    dismissOfflineReady,
    later,
    check,
    reload,
    confirmReload,
    cancelConfirm,
  }
})
