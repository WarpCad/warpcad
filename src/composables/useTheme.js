// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place that decides the theme (`TODO/ui-113`). The user's preference (`System`, `Dark` or
 * `Light`, kept in the settings store) and the system scheme resolve to `'dark'` or `'light'`, which
 * is written to `<html data-theme>` so the CSS themes key on it, and handed to non-Vue consumers
 * through `onChange`. This is the ONLY reader of `matchMedia('(prefers-color-scheme: light)')`.
 *
 * First paint: the CSP forbids an inline script, so the stored preference is read only once this
 * module runs. Until then `themes/light.css`'s `:root:not([data-theme])` media-query fallback
 * paints the system scheme, so a user who forces Light on a dark system sees one dark frame at start.
 *
 * @module composables/useTheme
 */

import { computed, ref, watch } from 'vue'

import { THEME_PREFERENCES, useSettingsStore } from '../stores/settings.js'

/** @typedef {import('../stores/settings.js').ThemePreference} ThemePreference */
/** @typedef {'dark' | 'light'} ResolvedTheme */

const LIGHT_QUERY = '(prefers-color-scheme: light)'

/** @type {import('vue').Ref<ResolvedTheme>} */
const resolved = ref('dark')
/** @type {Set<(theme: ResolvedTheme) => void>} */
const listeners = new Set()

/** @type {import('vue').ComputedRef<ThemePreference> | null} */
let preferenceRef = null
/** @type {{ matches: boolean, removeEventListener: Function } | null} */
let query = null
/** @type {(() => void) | null} */
let onQueryChange = null
/** @type {(() => void) | null} */
let stopWatch = null
/** @type {((value: string) => void) | null} */
let setter = null

/**
 * What the system asks for right now; dark when the browser cannot say.
 * @returns {ResolvedTheme}
 */
function systemTheme() {
  return query?.matches ? 'light' : 'dark'
}

/** Recompute `resolved`, write it to the root element and tell the listeners if it moved. */
function apply() {
  const next = preferenceRef?.value === 'dark' || preferenceRef?.value === 'light' ? preferenceRef.value : systemTheme()
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = next
  if (next === resolved.value) return
  resolved.value = next
  for (const listener of [...listeners]) listener(next)
}

/** Start once: bind the settings preference and the system query. */
function start() {
  if (stopWatch) return
  const settings = useSettingsStore()
  preferenceRef = computed(() => settings.theme)
  setter = (value) => settings.setTheme(value)
  const mq = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(LIGHT_QUERY) : null
  query = mq
  if (mq) {
    onQueryChange = apply
    // `matches` is read live on every apply; the listener only has to trigger one.
    mq.addEventListener('change', onQueryChange)
  }
  // Flush sync: the repaint lands in the same frame as the click.
  stopWatch = watch(() => settings.theme, apply, { flush: 'sync', immediate: false })
  resolved.value = systemTheme()
  apply()
}

/**
 * Tear the singleton down (tests, and HMR). The next `useTheme()` starts it again.
 * @returns {void}
 */
export function stopTheme() {
  stopWatch?.()
  if (query && onQueryChange) /** @type {any} */ (query).removeEventListener('change', onQueryChange)
  stopWatch = null
  query = null
  onQueryChange = null
  preferenceRef = null
  setter = null
  listeners.clear()
  resolved.value = 'dark'
}

/**
 * The theme singleton.
 *
 * @returns {{
 *   preference: import('vue').ComputedRef<ThemePreference>,
 *   resolved: import('vue').Ref<ResolvedTheme>,
 *   setPreference: (value: string) => void,
 *   onChange: (listener: (theme: ResolvedTheme) => void) => () => void,
 * }} `preference` is what the user chose; `resolved` is `'dark'` or `'light'`; `onChange` calls
 *   `listener` with the new resolved theme whenever it changes and returns an unsubscribe function.
 */
export function useTheme() {
  start()
  const settings = useSettingsStore()
  return {
    preference: computed(() => settings.theme),
    resolved,
    setPreference: (value) => setter?.(value),
    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

export { THEME_PREFERENCES }
