// SPDX-License-Identifier: AGPL-3.0-or-later
import { createPinia } from 'pinia'
import BasePopover from './BasePopover.vue'

const body = '<p style="margin:0">Scope, format and resolution.</p>'
const anchor = { left: 40, top: 40, right: 120, bottom: 76 }

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'layout/BasePopover',
  component: BasePopover,
  args: { open: true, testid: 'story-popover', title: 'Export', anchor },
  parameters: { layout: 'fullscreen' },
  render: (args) => ({ components: { BasePopover }, setup: () => ({ args }), template: `<BasePopover v-bind="args">${body}</BasePopover>` }),
  decorators: [(story) => ({ components: { story }, template: '<story />', beforeCreate() { this.$.appContext.app.use(createPinia()) } })],
}

export const Default = {}
export const BottomEnd = { args: { placement: 'bottom-end', anchor: { left: 200, top: 40, right: 280, bottom: 76 } } }
export const Modal = { args: { modal: true } }
export const Draggable = { args: { draggable: true } }
