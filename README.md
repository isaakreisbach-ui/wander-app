# Wanderapp

Persönliche Wander-App als PWA: Touren planen (PC), aufzeichnen (iPhone), offline nutzen.

- Live: https://isaakreisbach-ui.github.io/wander-app/
- Technik: Vite + Svelte 5 + TypeScript, vite-plugin-pwa
- Veröffentlichung: automatisch per GitHub Actions bei jedem Push auf `main`
- Daten: nur lokal auf dem Gerät (IndexedDB), kein Server

## Entwickeln

```
npm install
npm run dev      # lokaler Testserver
npm run build    # Produktions-Build nach dist/
```
