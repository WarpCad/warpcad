// SPDX-License-Identifier: AGPL-3.0-or-later
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './styles/tokens.css'
import AppView from './views/AppView.vue'
import { startPwa } from './pwa.js'

// AppView is the app's actual root view — no router, one screen (CLAUDE.md's
// Architecture rule). `build-001`'s App.vue placeholder is gone: render-001 is
// the task that was supposed to replace it, and leaving a second "root" around
// is how the previous attempt ended up with components mounted into a view
// nobody rendered.
const pinia = createPinia()
createApp(AppView).use(pinia).mount('#app')

// `TODO/build-005`: register the service worker (production build only) and look for new builds.
startPwa(pinia)
