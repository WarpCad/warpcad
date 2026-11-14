// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseChip from './BaseChip.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/BaseChip',
  component: BaseChip,
  args: { default: 'suppressed' },
  render: (/** @type {any} */ args) => ({ components: { BaseChip }, setup: () => ({ args }), template: '<BaseChip v-bind="args">{{ args.default }}</BaseChip>' }),
}

export const Plain = { args: { size: 'sm' } }
export const Quiet = { args: { tone: 'quiet', size: 'sm' } }
export const Danger = { args: { tone: 'danger', size: 'sm', default: 'broken' } }
export const Dashed = { args: { dashed: true, size: 'sm', default: 'Pi 4' } }
export const Working = { args: { tone: 'accent', size: 'lg', dot: true, dotTone: 'accent', pulse: true, default: 'Assistant working' } }
export const Published = { args: { tone: 'secondary', dot: true, dotTone: 'secondary', default: 'Published · 14:05' } }
export const BridgeButton = { args: { as: 'button', tone: 'neutral', size: 'tap', dot: true, default: 'MCP agent · connected' } }
