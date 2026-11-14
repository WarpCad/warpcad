// SPDX-License-Identifier: AGPL-3.0-or-later
import IconButton from './IconButton.vue'

const icon = '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2" fill="none"/></svg>'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'controls/IconButton',
  component: IconButton,
  args: { label: 'Add' },
  render: (args) => ({ components: { IconButton }, setup: () => ({ args }), template: `<IconButton v-bind="args">${icon}</IconButton>` }),
}

export const Default = {}
export const Primary = { args: { variant: 'primary' } }
export const Danger = { args: { variant: 'danger' } }
export const Quiet = { args: { variant: 'quiet' } }
export const Compact = { args: { size: 'compact' } }
export const Pressed = { args: { pressed: true } }
export const Disabled = { args: { disabled: true } }
export const Bordered = { args: { bordered: true } }
export const BorderedPressed = { args: { bordered: true, pressed: true } }
