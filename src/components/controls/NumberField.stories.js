// SPDX-License-Identifier: AGPL-3.0-or-later
import NumberField from './NumberField.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/NumberField', component: NumberField }

export const Millimetres = { args: { modelValue: 12.5, unit: 'mm', step: 0.5 } }
export const Degrees = { args: { modelValue: 45, unit: 'deg' } }
export const AutoWhenBlank = { args: { modelValue: null, nullable: true, placeholder: 'Auto' } }
export const WholeNumber = { args: { modelValue: 8, integer: true, min: 3, max: 64 } }
