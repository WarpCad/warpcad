// SPDX-License-Identifier: AGPL-3.0-or-later
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import AppView from './views/AppView.vue'
import { startPwa } from './pwa.js'
import { initErrorReporting } from './core/errorReporting.js'
import { initAnalytics } from './analytics/analytics.js'

// AppView is the app's actual root view — no router, one screen (CLAUDE.md's
// Architecture rule). `build-001`'s App.vue placeholder is gone: render-001 is
// the task that was supposed to replace it, and leaving a second "root" around
// is how the previous attempt ended up with components mounted into a view
// nobody rendered.
const pinia = createPinia()
const app = createApp(AppView)
// `TODO/build-004`: inert without VITE_SENTRY_DSN; must run before mount so Vue errors are caught.
initErrorReporting({ app })
app.use(pinia).mount('#app')

// `TODO/build-005`: register the service worker (production build only) and look for new builds.
startPwa(pinia)

// `TODO/build-007`: page views only; inert without a build-time GA4 id, and on localhost/dev/tests.
initAnalytics()

// `TODO/build-015`: the e2e build only (`VITE_E2E_HOOKS=1`); pruned from the shipped bundle.
if (import.meta.env.VITE_E2E_HOOKS === '1') {
  /** @type {any} */ (window).__e2eImport = (/** @type {string} */ path) => import('./e2eHooks.js').then((hooks) => hooks.loadE2eModule(path))
}
