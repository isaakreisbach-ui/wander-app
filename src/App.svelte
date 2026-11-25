<script lang="ts">
  import MapView from './components/MapView.svelte';
  import Planen from './views/Planen.svelte';
  import Touren from './views/Touren.svelte';
  import Aufzeichnen from './views/Aufzeichnen.svelte';
  import Info from './views/Info.svelte';
  import { requestPersistentStorage } from './lib/status.svelte';

  type View = 'karte' | 'planen' | 'touren' | 'aufzeichnen' | 'info';
  const tabs: { id: View; label: string; icon: string; mobileOnly?: boolean }[] = [
    { id: 'karte', label: 'Karte', icon: '🧭', mobileOnly: true },
    { id: 'planen', label: 'Planen', icon: '🗺️' },
    { id: 'touren', label: 'Touren', icon: '📋' },
    { id: 'aufzeichnen', label: 'Aufzeichnen', icon: '⏺️' },
    { id: 'info', label: 'Info', icon: 'ℹ️' },
  ];

  const desktopQuery = window.matchMedia('(min-width: 900px)');
  let desktop = $state(desktopQuery.matches);
  let view = $state<View>(desktopQuery.matches ? 'planen' : 'karte');
  let online = $state(navigator.onLine);

  // Am PC gibt es keinen eigenen „Karte“-Bereich – die Karte ist immer sichtbar.
  const panelView = $derived<View>(view === 'karte' && desktop ? 'planen' : view);

  $effect(() => {
    const on = () => (online = true);
    const off = () => (online = false);
    const mq = () => (desktop = desktopQuery.matches);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    desktopQuery.addEventListener('change', mq);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      desktopQuery.removeEventListener('change', mq);
    };
  });

  // Dauerhaften Speicher gleich beim Start anfragen
  requestPersistentStorage();
</script>

<div class="shell" class:sheet-open={panelView !== 'karte'}>
  <header class="topbar">
    <div class="brand">⛰️ Wanderapp</div>
    {#if !online}<div class="offline">Offline</div>{/if}
  </header>

  <main class="map" aria-label="Karte">
    <MapView />
  </main>

  <nav class="tabs" aria-label="Bereiche">
    {#each tabs as t}
      <button
        class:active={panelView === t.id}
        class:mobile-only={t.mobileOnly}
        aria-current={panelView === t.id ? 'page' : undefined}
        onclick={() => (view = t.id)}
      >
        <span class="icon" aria-hidden="true">{t.icon}</span>
        <span class="label">{t.label}</span>
      </button>
    {/each}
  </nav>

  {#if panelView !== 'karte'}
    <section class="panel">
      <button class="sheet-close" onclick={() => (view = 'karte')} aria-label="Zur Karte">
        <span class="grip" aria-hidden="true"></span>
        <span>Karte zeigen ▾</span>
      </button>
      {#if panelView === 'planen'}<Planen />
      {:else if panelView === 'touren'}<Touren />
      {:else if panelView === 'aufzeichnen'}<Aufzeichnen />
      {:else}<Info />{/if}
    </section>
  {/if}
</div>

<style>
  .shell {
    height: 100%;
    display: grid;
    grid-template-rows: auto 1fr auto;
    grid-template-columns: 100%;
    grid-template-areas: 'top' 'content' 'tabs';
  }
  .topbar {
    grid-area: top; z-index: 5;
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(10px + var(--safe-top)) 16px 10px;
    background: var(--green); color: #fff;
  }
  .brand { font-weight: 750; font-size: 1.15rem; }
  .offline {
    background: var(--amber); color: #000; font-weight: 700;
    padding: 2px 10px; border-radius: 999px; font-size: .85rem;
  }

  /* ---------- Handy: Karte im Vollbild, Bereiche als Blatt von unten ---------- */
  .map { grid-area: content; position: relative; min-height: 0; }
  .panel {
    grid-area: content; z-index: 4;
    align-self: end; max-height: 62%;
    overflow-y: auto; -webkit-overflow-scrolling: touch;
    background: var(--bg);
    border-radius: 18px 18px 0 0;
    box-shadow: 0 -4px 18px rgba(0, 0, 0, .18);
    padding: 0 14px 14px;
  }
  .sheet-close {
    position: sticky; top: 0; z-index: 1;
    width: calc(100% + 28px); margin: 0 -14px 10px;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 8px 0 6px; border: 0; background: var(--bg);
    color: var(--muted); font-size: .85rem; font-weight: 600;
  }
  .grip { width: 44px; height: 5px; border-radius: 3px; background: var(--line); }

  .tabs {
    grid-area: tabs; z-index: 5;
    display: grid; grid-template-columns: repeat(5, 1fr);
    background: var(--surface); border-top: 1px solid var(--line);
    padding-bottom: var(--safe-bottom);
  }
  .tabs button {
    min-height: var(--tabbar);
    display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
    border: 0; background: none; color: var(--muted); font-size: .75rem; font-weight: 600;
    padding: 0 2px;
  }
  .tabs .icon { font-size: 1.55rem; line-height: 1; }
  .tabs button.active { color: var(--green); background: var(--green-soft); }

  /* ---------- PC: Seitenleiste links, große Karte rechts ---------- */
  @media (min-width: 900px) {
    .shell {
      grid-template-columns: var(--sidebar) 1fr;
      grid-template-rows: auto auto 1fr;
      grid-template-areas: 'top top' 'tabs map' 'panel map';
    }
    .map { grid-area: map; }
    .tabs {
      grid-area: tabs; grid-template-columns: repeat(4, 1fr);
      border-top: 0; border-bottom: 1px solid var(--line); border-right: 1px solid var(--line);
      padding: 0;
    }
    .tabs .mobile-only { display: none; }
    .tabs button { min-height: 52px; flex-direction: row; gap: 6px; font-size: .9rem; }
    .tabs .icon { font-size: 1.1rem; }
    .panel {
      grid-area: panel; align-self: stretch; max-height: none; min-height: 0;
      border-radius: 0; box-shadow: none; border-right: 1px solid var(--line);
      padding: 16px;
    }
    .sheet-close { display: none; }
  }
</style>
