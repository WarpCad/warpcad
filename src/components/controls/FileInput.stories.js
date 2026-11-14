// SPDX-License-Identifier: AGPL-3.0-or-later
import FileInput from './FileInput.vue'

/** @type {import('@storybook/vue3-vite').Meta} */
export default { title: 'controls/FileInput', component: FileInput }

export const Default = {
  render: () => ({
    components: { FileInput },
    template: '<div><FileInput ref="f" accept=".stl,.3mf" /><button @click="$refs.f.open()">Choose a file</button></div>',
  }),
}
