// SPDX-License-Identifier: AGPL-3.0-or-later
// The app's tokens and reset, so a story is drawn with the same custom properties as the app.
import '../src/styles/index.css'
// The styles (Help → Style in the app), with the fonts the app bundles for them.
import '../src/styles/skins/index.css'
import './preview.css'

/**
 * The toolbar's theme choices. `system` clears `<html data-theme>`, so the page follows
 * `prefers-color-scheme` the way the app does before `useTheme` runs. Every other value is written
 * to the attribute, which is what each theme file keys on.
 */
const THEMES = [
  { value: 'system', title: 'System' },
  { value: 'dark', title: 'Dark' },
  { value: 'light', title: 'Light' },
  { value: 'kids', title: 'Kids' },
  { value: 'glass', title: 'Glass' },
  { value: 'deco', title: 'Art Deco' },
  { value: 'minimal', title: 'Minimal' },
  { value: 'blueprint', title: 'Blueprint' },
  { value: 'pixel', title: 'Pixel' },
]

/**
 * Write the chosen theme to the preview document's root element.
 * @param {unknown} theme a `THEMES` value; anything else is treated as `system`
 * @returns {void}
 */
function applyTheme(theme) {
  const root = document.documentElement
  if (typeof theme === 'string' && theme !== 'system' && THEMES.some((t) => t.value === theme)) root.dataset.theme = theme
  else delete root.dataset.theme
}

/** @type {import('@storybook/vue3-vite').Preview} */
const preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: 'The theme the story is drawn in',
      toolbar: { title: 'Theme', icon: 'paintbrush', items: THEMES, dynamicTitle: true },
    },
  },
  initialGlobals: { theme: 'system' },
  decorators: [
    (story, context) => {
      applyTheme(context.globals.theme)
      return story()
    },
  ],
}

export default preview
