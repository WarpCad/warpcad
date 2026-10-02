// SPDX-License-Identifier: AGPL-3.0-or-later
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
}

export default preview
