import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  // Dedicated, strict port: with auto-increment-on-conflict (Vite's default),
  // a stray dev server from another project squatting on the default port
  // would make Playwright's `reuseExistingServer` silently attach to the
  // wrong app instead of failing loudly. Fail loudly instead.
  server: { port: 5183, strictPort: true },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'WarpCad',
        short_name: 'WarpCad',
        display: 'standalone',
        background_color: '#111111',
        theme_color: '#111111',
      },
    }),
  ],
})
