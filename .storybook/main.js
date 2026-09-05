/** @type {import('@storybook/vue3-vite').StorybookConfig} */
const config = {
  stories: ['../src/**/*.stories.@(js|ts)'],
  framework: {
    name: '@storybook/vue3-vite',
    // vue-docgen-api (the framework default) is deprecated as of Storybook 10;
    // vue-component-meta is its documented replacement ahead of Storybook 11.
    options: { docgen: 'vue-component-meta' },
  },
}

export default config
