import './app.css';
import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import { swState } from './lib/status.svelte';

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
