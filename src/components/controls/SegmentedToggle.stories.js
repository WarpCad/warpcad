// SPDX-License-Identifier: AGPL-3.0-or-later
import SegmentedToggle from './SegmentedToggle.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/SegmentedToggle', component: SegmentedToggle }

export const Default = {
  args: {
    modelValue: 'x',
    label: 'Axis',
    options: [
      { value: 'x', label: 'X' },
      { value: 'y', label: 'Y' },
      { value: 'z', label: 'Z' },
    ],
  },
}
