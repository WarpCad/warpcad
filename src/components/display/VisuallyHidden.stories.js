// SPDX-License-Identifier: AGPL-3.0-or-later
import VisuallyHidden from './VisuallyHidden.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/VisuallyHidden',
  component: VisuallyHidden,
  args: { default: 'Read by a screen reader, not drawn' },
  render: (/** @type {any} */ args) => ({
    components: { VisuallyHidden },
    setup: () => ({ args }),
    template: '<p>The next words are in the accessibility tree only: <VisuallyHidden v-bind="args">{{ args.default }}</VisuallyHidden></p>',
  }),
}

export const Default = {}
