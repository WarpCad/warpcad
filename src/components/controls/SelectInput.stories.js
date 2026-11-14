// SPDX-License-Identifier: AGPL-3.0-or-later
import SelectInput from './SelectInput.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/SelectInput', component: SelectInput }

export const Default = {
  render: () => ({
    components: { SelectInput },
    template: '<SelectInput model-value="y"><option value="x">X</option><option value="y">Y</option></SelectInput>',
  }),
}
