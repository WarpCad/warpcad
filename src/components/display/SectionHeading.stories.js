// SPDX-License-Identifier: AGPL-3.0-or-later
import SectionHeading from './SectionHeading.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/SectionHeading',
  component: SectionHeading,
  args: { default: 'Parameters' },
  render: (/** @type {any} */ args) => ({ components: { SectionHeading }, setup: () => ({ args }), template: '<SectionHeading v-bind="args">{{ args.default }}</SectionHeading>' }),
}

export const Default = {}
export const PanelHeading = { args: { level: 2, default: 'Inspector' } }
