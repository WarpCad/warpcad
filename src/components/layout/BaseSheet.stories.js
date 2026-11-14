// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseSheet from './BaseSheet.vue'

const body = '<label>Name <input type="text" value="Bracket" /></label><div style="display:flex;gap:8px"><button type="button">Cancel</button><button type="button">Save</button></div>'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'layout/BaseSheet',
  component: BaseSheet,
  args: { open: true, testid: 'story-sheet', title: 'Save to library' },
  parameters: { layout: 'fullscreen' },
  render: (args) => ({ components: { BaseSheet }, setup: () => ({ args }), template: `<BaseSheet v-bind="args">${body}</BaseSheet>` }),
}

export const NonModalBottom = {}
export const ModalBottom = { args: { modal: true } }
export const Card = { args: { card: true } }
export const Right = { args: { side: 'right' } }
