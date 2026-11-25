<script lang="ts">
  import Planen from './views/Planen.svelte';
  import Touren from './views/Touren.svelte';
  import Aufzeichnen from './views/Aufzeichnen.svelte';
  import Info from './views/Info.svelte';
  import { requestPersistentStorage } from './lib/status.svelte';

  type View = 'planen' | 'touren' | 'aufzeichnen' | 'info';
  const tabs: { id: View; label: string; icon: string }[] = [
    { id: 'planen', label: 'Planen', icon: '🗺️' },
    { id: 'touren', label: 'Touren', icon: '📋' },
    { id: 'aufzeichnen', label: 'Aufzeichnen', icon: '⏺️' },
    { id: 'info', label: 'Info', icon: 'ℹ️' },
  ];

  let view = $state<View>('info');
  let online = $state(navigator.onLine);

  $effect(() => {
    const on = () => (online = true);
    const off = () => (online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  });

  // Dauerhaften Speicher gleich beim Start anfragen
  requestPersistentStorage();
</script>

<div class="shell">
  <header class="topbar">
    <div class="brand">⛰️ Wanderapp</div>
    {#if !online}<div class="offline">Offline</div>{/if}
  </header>

  <aside class="sidebar">
    <nav class="tabs" aria-label="Bereiche">
      {#each tabs as t}
        <button class:active={view === t.id} aria-current={view === t.id ? 'page' : undefined} onclick={() => (view = t.id)}>
          <span class="icon" aria-hidden="true">{t.icon}</span>
          <span class="label">{t.label}</span>
        </button>
      {/each}
    </nav>
    <div class="panel">
      {#if view === 'planen'}<Planen />
      {:else if view === 'touren'}<Touren />
      {:else if view === 'aufzeichnen'}<Aufzeichnen />
      {:else}<Info />{/if}
    </div>
  </aside>

  <main class="map" aria-label="Karte">
    <div class="map-placeholder">
      <div>🗺️</div>
      <p>Hier kommt in Schritt 2 die Karte.</p>
    </div>
  </main>
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-areas: 'top' 'content' 'tabs';
  }
  .topbar {
    grid-area: top;
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(10px + var(--safe-top)) 16px 10px;
    background: var(--green); color: #fff;
  }
  .brand { font-weight: 750; font-size: 1.15rem; }
  .offline {
    background: var(--amber); color: #000; font-weight: 700;
    padding: 2px 10px; border-radius: 999px; font-size: .85rem;
  }

  /* Handy: Inhalt als ganzer Bildschirm, Tabs unten */
  .sidebar { display: contents; }
  .panel { grid-area: content; overflow-y: auto; padding: 16px; -webkit-overflow-scrolling: touch; }
  .map { display: none; }
  .tabs {
    grid-area: tabs;
    display: grid; grid-template-columns: repeat(4, 1fr);
    background: var(--surface); border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
  }
  .tabs button {
    min-height: var(--tabbar);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    border: 0; background: none; color: var(--muted); font-size: .8rem; font-weight: 600;
  }
  .tabs .icon { font-size: 1.6rem; line-height: 1; }
  .tabs button.active { color: var(--green); background: var(--green-soft); }

  /* PC: Seitenleiste links, große Karte rechts */
  @media (min-width: 900px) {
    .shell {
      grid-template-columns: var(--sidebar) 1fr;
      grid-template-rows: auto 1fr;
      grid-template-areas: 'top top' 'side map';
    }
    .sidebar {
      grid-area: side; display: flex; flex-direction: column; min-height: 0;
      border-right: 1px solid var(--line); background: var(--bg);
    }
    .tabs { order: -1; border-top: 0; border-bottom: 1px solid var(--line); padding: 0; }
    .tabs button { min-height: 56px; flex-direction: row; gap: 6px; font-size: .9rem; }
    .tabs .icon { font-size: 1.1rem; }
    .panel { flex: 1; }
    .map { grid-area: map; display: block; background: #dfe7df; }
  }
  .map-placeholder {
    height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;
    color: var(--muted); font-size: 1.1rem;
  }
  .map-placeholder div { font-size: 4rem; }
</style>
