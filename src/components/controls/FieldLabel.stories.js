// SPDX-License-Identifier: AGPL-3.0-or-later
import FieldLabel from './FieldLabel.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/FieldLabel', component: FieldLabel }

export const Default = {
  render: () => ({ components: { FieldLabel }, template: '<FieldLabel>Name<input /></FieldLabel>' }),
}

export const Small = {
  render: () => ({ components: { FieldLabel }, template: '<FieldLabel small>Offset (mm)<input /></FieldLabel>' }),
}
