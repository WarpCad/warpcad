// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * The one place that decides the theme (`TODO/ui-113`). The user's preference (kept in the settings
 * store) is a mode (`System`, `Dark`, `Light`) or a style (`Kids`, `Art Deco`, …, `src/styles/skins/`).
 * It resolves to a theme name, which is written to `<html data-theme>` so the CSS keys on it, and
 * handed to non-Vue consumers through `onChange`. System resolves to `'dark'` or `'light'` from the
 * device; a style resolves to itself. This is the ONLY reader of
 * `matchMedia('(prefers-color-scheme: light)')`.
 *
 * `scheme` is the resolved theme's brightness, `'dark'` or `'light'`, for consumers that pick between
 * two of something (the Help pictures' dark twins, the renderer's fallback palette) rather than
 * reading tokens. Each style is fixed to one (`THEME_SCHEMES`).
 *
 * First paint: the CSP forbids an inline script, so the stored preference is read only once this
 * module runs. Until then `themes/light.css`'s `:root:not([data-theme])` media-query fallback
 * paints the system scheme, so a user who forces Light on a dark system sees one dark frame at start
 * (and a user with a style sees one frame of Dark or Light).
 *
 * @module composables/useTheme
 */

import { computed, ref, watch } from 'vue'

import { isNativeShell, nativeThemeMode, probeShell, setNativeTheme } from '../native/shell.js'
import { THEME_MODES, THEME_PREFERENCES, THEME_STYLES, useSettingsStore } from '../stores/settings.js'

/** @typedef {import('../stores/settings.js').ThemePreference} ThemePreference */
/** @typedef {import('../stores/settings.js').ThemeStyle} ThemeStyle */
/** @typedef {'dark' | 'light'} ThemeScheme */
/** @typedef {ThemeScheme | ThemeStyle} ResolvedTheme */

/**
 * Each style's brightness. It sets the CSS `color-scheme` in the style's own file; this copy is for
 * script, and the two are kept in step by hand.
 * @type {Readonly<Record<ThemeStyle, ThemeScheme>>}
 */
export const THEME_SCHEMES = Object.freeze({
  kids: 'light',
  glass: 'light',
  deco: 'dark',
  minimal: 'light',
  blueprint: 'dark',
  pixel: 'dark',
})

const LIGHT_QUERY = '(prefers-color-scheme: light)'

/** @type {import('vue').Ref<ResolvedTheme>} */
const resolved = ref('dark')
/** @type {import('vue').ComputedRef<ThemeScheme>} */
const scheme = computed(() => schemeOf(resolved.value))
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
/** The last literal sent to the native shell, so a repeat is not sent again. @type {string | null} */
let sentToShell = null

/**
 * The brightness of a resolved theme.
 * @param {ResolvedTheme} theme
 * @returns {ThemeScheme}
 */
export function schemeOf(theme) {
  if (theme === 'light' || theme === 'dark') return theme
  return THEME_SCHEMES[theme] ?? 'dark'
}

/**
 * What the system asks for right now; dark when the browser cannot say.
 * @returns {ThemeScheme}
 */
function systemTheme() {
  return query?.matches ? 'light' : 'dark'
}

/**
 * The theme a preference paints: a forced mode or a style is itself, System is the device's scheme.
 * @param {ThemePreference | undefined} preference
 * @returns {ResolvedTheme}
 */
function resolve(preference) {
  if (preference === 'dark' || preference === 'light') return preference
  if (preference && /** @type {readonly string[]} */ (THEME_STYLES).includes(preference)) return /** @type {ThemeStyle} */ (preference)
  return systemTheme()
}

/**
 * Inside a native shell, tell it the theme (`TODO/ui-121`) so the iOS status bar follows the app:
 * `system`, or the painted theme's scheme. Sent only when it changes; a failure is ignored (an older
 * shell has no such command).
 */
function syncShell() {
  if (!isNativeShell(probeShell())) return
  const mode = nativeThemeMode(preferenceRef?.value ?? 'system', scheme.value)
  if (mode === sentToShell) return
  sentToShell = mode
  setNativeTheme(mode).catch(() => {})
}

/** Recompute `resolved`, write it to the root element and tell the listeners if it moved. */
function apply() {
  const next = resolve(preferenceRef?.value)
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = next
  if (next === resolved.value) {
    syncShell()
    return
  }
  resolved.value = next
  syncShell()
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
  sentToShell = null
  listeners.clear()
  resolved.value = 'dark'
}

/**
 * The theme singleton.
 *
 * @returns {{
 *   preference: import('vue').ComputedRef<ThemePreference>,
 *   resolved: import('vue').Ref<ResolvedTheme>,
 *   scheme: import('vue').ComputedRef<ThemeScheme>,
 *   setPreference: (value: string) => void,
 *   onChange: (listener: (theme: ResolvedTheme) => void) => () => void,
 * }} `preference` is what the user chose; `resolved` is the theme painted (`'dark'`, `'light'` or a
 *   style's name); `scheme` is its brightness; `onChange` calls `listener` with the new resolved theme
 *   whenever it changes (a switch between two dark themes included) and returns an unsubscribe function.
 */
export function useTheme() {
  start()
  const settings = useSettingsStore()
  return {
    preference: computed(() => settings.theme),
    resolved,
    scheme,
    setPreference: (value) => setter?.(value),
    onChange(listener) {
      listeners.add(listener)
      return () => void listeners.delete(listener)
    },
  }
}

export { THEME_MODES, THEME_PREFERENCES, THEME_STYLES }
