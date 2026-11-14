// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseButton from './BaseButton.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'controls/BaseButton',
  component: BaseButton,
  args: { default: 'Button' },
  render: (args) => ({ components: { BaseButton }, setup: () => ({ args }), template: '<BaseButton v-bind="args">{{ args.default }}</BaseButton>' }),
}

export const Default = {}
export const Primary = { args: { variant: 'primary' } }
export const Danger = { args: { variant: 'danger' } }
export const Quiet = { args: { variant: 'quiet' } }
export const Compact = { args: { size: 'compact' } }
export const Pressed = { args: { pressed: true } }
export const Disabled = { args: { disabled: true } }
