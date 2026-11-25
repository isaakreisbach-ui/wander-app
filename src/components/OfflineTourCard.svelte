<script lang="ts">
  // „Karte für diese Tour offline speichern“ – Streifen entlang der Route.
  import { liveQuery } from 'dexie';
  import { db, type OfflineArea } from '../lib/db';
  import type { Pt } from '../lib/geo';
  import { offline, downloadArea, tilesForRoute, routeBbox, estimateMB, formatMB, MAX_TILES, deleteArea } from '../lib/offline.svelte';
  import { toast } from '../lib/ui.svelte';
  import Disclosure from './Disclosure.svelte';

  let { route, tourId, name }: { route: Pt[]; tourId: string | null; name: string } = $props();

  const BUFFERS = [
    { m: 500, label: '± 500 m' },
    { m: 1000, label: '± 1 km' },
    { m: 2000, label: '± 2 km' },
  ];
  let buffer = $state(1000);
  let area = $state<OfflineArea | null>(null);

  $effect(() => {
    const id = tourId;
    if (!id) { area = null; return; }
    const sub = liveQuery(() => db.offlineAreas.where('tourId').equals(id).first()).subscribe({
      next: (a) => (area = a ?? null),
    });
    return () => sub.unsubscribe();
  });

  const tiles = $derived(tilesForRoute(route, buffer));
  const running = $derived(offline.job?.status === 'running');

  async function download() {
    try {
      const a = await downloadArea({
        name: name || 'Tour', kind: 'tour', tourId: tourId ?? undefined,
        bbox: routeBbox(route), tiles,
      });
      if (a) toast(`Karte für „${a.name}“ offline gespeichert (${formatMB(a.bytes)})`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function remove() {
    if (area && confirm('Offline-Karte für diese Tour löschen?')) await deleteArea(area.id);
  }
</script>

<Disclosure
  id="offline" icon="📥" tint="#5856d6" title="Offline-Karte"
  summary={area ? `✓ Gespeichert · ${formatMB(area.bytes)}` : 'Für diese Tour noch nicht gespeichert'}
>
  {#if area}
    <p class="ok">✓ Für diese Tour gespeichert · {formatMB(area.bytes)} · {new Date(area.createdAt).toLocaleDateString('de-DE')}</p>
  {:else}
    <p class="muted">Speichert die Standard-Karte entlang der Route, damit du sie unterwegs ohne Netz siehst.</p>
  {/if}

  <div class="row">
    <div class="seg" role="radiogroup" aria-label="Breite des Streifens">
      {#each BUFFERS as b}
        <button role="radio" aria-checked={buffer === b.m} class:sel={buffer === b.m} onclick={() => (buffer = b.m)}>{b.label}</button>
      {/each}
    </div>
  </div>
  <p class="muted small">
    {tiles.size} Kacheln, ca. {estimateMB(tiles.size).toLocaleString('de-DE')} MB
    {#if tiles.size > MAX_TILES}<b class="bad"> – zu groß, bitte schmaleren Streifen wählen</b>{/if}
  </p>
  <div class="row">
    <button class="btn" onclick={download} disabled={running || tiles.size > MAX_TILES || route.length < 2}>
      {area ? 'Neu herunterladen' : 'Offline speichern'}
    </button>
    {#if area}<button class="btn secondary" onclick={remove} disabled={running}>Löschen</button>{/if}
  </div>
  {#if !tourId}<p class="muted small">Tipp: Tour zuerst speichern – dann bleibt die Offline-Karte mit ihr verknüpft.</p>{/if}
</Disclosure>

<style>
  .ok { color: var(--ok); font-weight: 650; font-size: .92rem; }
  .row { display: flex; gap: 8px; margin-bottom: 6px; }
  .row .btn { flex: 1; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .seg button { min-height: 40px; border: 0; background: var(--surface); font-size: .85rem; font-weight: 600; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg { border: 0; background: #e9e9eb; padding: 2px; border-radius: 9px; gap: 2px; }
  .seg button { border-radius: 7px; background: none; }
  .seg button + button { border-left: 0; }
  .seg button.sel { background: #fff; color: #1c1c1e; box-shadow: 0 1px 3px rgba(0, 0, 0, .15); }
  .small { font-size: .8rem; margin: 4px 0 8px; }
  .bad { color: var(--bad); }
</style>
