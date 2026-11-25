<script lang="ts">
  // „Karte für diese Tour offline speichern“ – Streifen entlang der Route.
  import { liveQuery } from 'dexie';
  import { db, type OfflineArea } from '../lib/db';
  import type { Pt } from '../lib/geo';
  import { offline, downloadArea, tilesForRoute, routeBbox, estimateMB, formatMB, MAX_TILES, deleteArea } from '../lib/offline.svelte';
  import { toast } from '../lib/ui.svelte';

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

<div class="card off">
  <h3>📥 Offline-Karte</h3>
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
</div>

<style>
  .off { padding: 12px; }
  h3 { margin: 0 0 6px; font-size: 1.05rem; }
  .ok { color: var(--ok); font-weight: 650; font-size: .92rem; }
  .row { display: flex; gap: 8px; margin-bottom: 6px; }
  .row .btn { flex: 1; }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); width: 100%; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
  .seg button { min-height: 40px; border: 0; background: var(--surface); font-size: .85rem; font-weight: 600; }
  .seg button + button { border-left: 1px solid var(--line); }
  .seg button.sel { background: var(--green); color: #fff; }
  .small { font-size: .8rem; margin: 4px 0 8px; }
  .bad { color: var(--bad); }
</style>
