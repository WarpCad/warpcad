// SPDX-License-Identifier: AGPL-3.0-or-later
import BaseButton from '../controls/BaseButton.vue'
import BaseBanner from './BaseBanner.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/BaseBanner',
  component: BaseBanner,
  args: { default: 'Merged 4 steps from bracket-copy.warpcad' },
  render: (/** @type {any} */ args) => ({
    components: { BaseBanner, BaseButton },
    setup: () => ({ args }),
    template: '<BaseBanner v-bind="args">{{ args.default }}<template #actions><BaseButton narrow>Undo merge</BaseButton><BaseButton narrow variant="quiet" aria-label="Dismiss">✕</BaseButton></template></BaseBanner>',
  }),
}

export const Strip = {}
export const Warn = { args: { tone: 'warn', default: 'Merged 4 steps from bracket-copy.warpcad, 2 steps conflicted' } }
export const Danger = { args: { tone: 'danger', default: 'That file is from a different project' } }
export const Dock = { args: { layout: 'dock', default: 'A new version of WarpCad is available.' } }
export const Box = { args: { layout: 'box', tone: 'warn', default: '1 item refers to parts this Pi 5 does not have.' } }
export const Note = { args: { layout: 'note', default: 'Hidden in the view ·' } }
