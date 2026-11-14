// SPDX-License-Identifier: AGPL-3.0-or-later
import ListRow from './ListRow.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default {
  title: 'display/ListRow',
  component: ListRow,
  args: { default: 'Cube 1' },
  render: (/** @type {any} */ args) => ({
    components: { ListRow },
    setup: () => ({ args }),
    template: '<ListRow v-bind="args"><template #leading><span style="width:44px;display:grid;place-items:center">☐</span></template>{{ args.default }}<template #trailing><span style="width:44px;display:grid;place-items:center">👁</span></template></ListRow>',
  }),
}

export const Default = {}
export const Selected = { args: { selected: true } }
export const Hovered = { args: { hovered: true } }
export const Truncated = { args: { truncate: true, default: 'A very long object name that cannot fit in the row and is cut with an ellipsis' } }
