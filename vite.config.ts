import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Repo-Name auf GitHub = Unterpfad auf GitHub Pages
const BASE = '/wander-app/';

export default defineConfig({
  base: BASE,
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    svelte(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon-180x180.png', 'icon.svg'],
      manifest: {
        id: BASE,
        name: 'Wanderapp',
        short_name: 'Wandern',
        description: 'Touren planen, aufzeichnen und offline nutzen',
        lang: 'de',
        start_url: BASE,
        scope: BASE,
        display: 'standalone',
        orientation: 'any',
        background_color: '#f4f6f3',
        theme_color: '#1f5f3f',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: BASE + 'index.html',
      },
    }),
  ],
});
