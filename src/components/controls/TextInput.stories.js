// SPDX-License-Identifier: AGPL-3.0-or-later
import TextInput from './TextInput.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/TextInput', component: TextInput }

export const Default = { args: { modelValue: 'Bracket' } }
export const Password = { args: { modelValue: 'secret', type: 'password' } }
