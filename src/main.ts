import './app.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { swState } from './lib/status.svelte';
import { trimBrowseCache } from './lib/offline.svelte';

registerSW({
  immediate: true,
  onOfflineReady() {
    swState.offlineReady = true;
  },
  onRegisteredSW(_url, reg) {
    if (reg) {
      swState.registered = true;
      if (reg.active) swState.offlineReady = true;
      // Regelmäßig nach Updates schauen (z. B. wenn die App lange offen ist)
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }
  },
});

mount(App, { target: document.getElementById('app')! });

// Startbildschirm sanft ausblenden, sobald die App steht
const splash = document.getElementById('splash');
if (splash) {
  splash.style.transition = 'opacity .3s';
  requestAnimationFrame(() => { splash.style.opacity = '0'; setTimeout(() => splash.remove(), 350); });
}

// Beim Surfen gesammelte Kartenkacheln begrenzen (die bewusst heruntergeladenen bleiben)
setTimeout(() => trimBrowseCache(), 10_000);
