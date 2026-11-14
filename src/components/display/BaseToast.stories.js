// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseButton from '../controls/BaseButton.vue'
import BaseToast from './BaseToast.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/BaseToast',
  component: BaseToast,
  args: { default: 'Link copied, 2.3 KB' },
  render: (/** @type {any} */ args) => ({ components: { BaseToast }, setup: () => ({ args }), template: '<BaseToast v-bind="args">{{ args.default }}</BaseToast>' }),
}

export const Default = {}
export const Danger = { args: { tone: 'danger', default: 'Could not delete: the part is in use' } }
export const WithAction = {
  args: { default: 'Saved to gist: Bracket' },
  render: (/** @type {any} */ args) => ({
    components: { BaseToast, BaseButton },
    setup: () => ({ args }),
    template: '<BaseToast v-bind="args">{{ args.default }}<template #action><BaseButton>Copy link</BaseButton></template></BaseToast>',
  }),
}
