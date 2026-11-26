import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { VitePWA } from 'vite-plugin-pwa';

// Repo-Name auf GitHub = Unterpfad auf GitHub Pages
const BASE = '/wander-app/';

export default defineConfig({
  base: BASE,
  // MapLibre ist groß (~1 MB) – das ist erwartet und wird offline zwischengespeichert
  build: { chunkSizeWarningLimit: 1600 },
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
        background_color: '#1c1c1e',
        theme_color: '#141416',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: BASE + 'index.html',
        runtimeCaching: [
          {
            // OpenFreeMap (Standard-Karte): Kacheln, Stil, Schriften, Symbole – offline nutzbar.
            // Diese Funktion wird 1:1 in den Service Worker kopiert und muss daher in sich geschlossen sein.
            urlPattern: ({ url }) => url.origin === 'https://tiles.openfreemap.org',
            handler: async ({ request }) => {
              const url = new URL(request.url);
              const tile = url.pathname.match(/\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
              if (tile) {
                // Kachel-Adressen enthalten eine Versionsnummer, die sich wöchentlich ändert →
                // unter einer versionsfreien Adresse speichern und suchen.
                const key = `https://tiles.openfreemap.org/__tile/${tile[1]}/${tile[2]}/${tile[3]}.pbf`;
                const hit = await caches.match(key);
                if (hit) return hit;
                try {
                  const res = await fetch(request);
                  if (res.ok) {
                    const c = await caches.open('ofm-browse');
                    await c.put(key, res.clone());
                  }
                  return res;
                } catch {
                  return new Response(null, { status: 204 }); // leere Kachel statt Fehler
                }
              }
              // Stil, TileJSON, Schriften, Symbole, Übersichtskacheln: aus dem Speicher, im Hintergrund auffrischen
              const cached = await caches.match(request.url);
              const network = fetch(request)
                .then(async (res) => {
                  if (res.ok) {
                    const c = await caches.open('ofm-static');
                    await c.put(request.url, res.clone());
                  }
                  return res;
                })
                .catch(() => null);
              if (cached) return cached;
              const res = await network;
              return res ?? new Response(null, { status: 504 });
            },
          },
        ],
      },
    }),
  ],
});
