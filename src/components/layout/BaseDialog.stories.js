// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseDialog from './BaseDialog.vue'

const body = '<p style="margin:0">Replace the open project with this one?</p><div style="display:flex;gap:8px;justify-content:flex-end"><button type="button">Cancel</button><button type="button">Replace</button></div>'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'layout/BaseDialog',
  component: BaseDialog,
  args: { open: true, testid: 'story-dialog', title: 'Replace project' },
  parameters: { layout: 'fullscreen' },
  render: (args) => ({ components: { BaseDialog }, setup: () => ({ args }), template: `<BaseDialog v-bind="args">${body}</BaseDialog>` }),
}

export const Default = {}
export const Centered = { args: { placement: 'center', width: '480px' } }
export const Danger = { args: { tone: 'danger', title: 'Delete this part?' } }
export const PhoneSheet = { args: { sheet: true } }
