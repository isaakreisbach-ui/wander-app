<script lang="ts">
  // Übersicht aller Offline-Gebiete + „sichtbaren Ausschnitt speichern“.
  import { liveQuery } from 'dexie';
  import { db, type OfflineArea } from '../lib/db';
  import { mapState } from '../lib/map.svelte';
  import { offline, downloadArea, tilesForBounds, estimateMB, formatMB, MAX_TILES, deleteArea } from '../lib/offline.svelte';
  import { storageEstimate, formatBytes } from '../lib/status.svelte';
  import { toast } from '../lib/ui.svelte';

  let areas = $state<OfflineArea[]>([]);
  let usage = $state('');
  let viewTiles = $state(0);

  $effect(() => {
    const sub = liveQuery(() => db.offlineAreas.orderBy('createdAt').reverse().toArray()).subscribe({
      next: (a) => { areas = a; refreshUsage(); },
    });
    return () => sub.unsubscribe();
  });

  async function refreshUsage() {
    const e = await storageEstimate();
    usage = e ? `${formatBytes(e.usage)} von ca. ${formatBytes(e.quota)} belegt` : '';
  }

  function bounds(): [number, number, number, number] | null {
    const b = mapState.map?.getBounds();
    return b ? [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()] : null;
  }

  // Größe des sichtbaren Ausschnitts live mitrechnen
  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    const upd = () => { const b = bounds(); viewTiles = b ? tilesForBounds(b).size : 0; };
    upd();
    map.on('moveend', upd);
    return () => { map.off('moveend', upd); };
  });

  async function saveView() {
    const b = bounds();
    if (!b) return;
    const name = prompt('Name für dieses Gebiet:', 'Kartenausschnitt')?.trim();
    if (!name) return;
    try {
      const a = await downloadArea({ name, kind: 'view', bbox: b, tiles: tilesForBounds(b) });
      if (a) toast(`„${a.name}“ offline gespeichert (${formatMB(a.bytes)})`);
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function show(a: OfflineArea) {
    mapState.map?.fitBounds([[a.bbox[0], a.bbox[1]], [a.bbox[2], a.bbox[3]]], { padding: 40, duration: 700 });
  }

  async function remove(a: OfflineArea) {
    if (confirm(`Offline-Karte „${a.name}“ löschen?`)) await deleteArea(a.id);
  }
</script>

<div class="card">
  <h3>📥 Offline-Karten</h3>
  {#if areas.length}
    <ul>
      {#each areas as a (a.id)}
        <li>
          <button class="name" onclick={() => show(a)}>
            <b>{a.name}</b>
            <span>{a.kind === 'tour' ? 'Tour' : 'Ausschnitt'} · {formatMB(a.bytes)} · {new Date(a.createdAt).toLocaleDateString('de-DE')}</span>
          </button>
          <button class="del" onclick={() => remove(a)} aria-label="Löschen">🗑</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="muted small">Noch keine Gebiete gespeichert. Am einfachsten: Tour öffnen → „Offline speichern“.</p>
  {/if}

  <button class="btn secondary wide" onclick={saveView} disabled={offline.job?.status === 'running' || viewTiles > MAX_TILES || !viewTiles}>
    Sichtbaren Kartenausschnitt speichern
  </button>
  <p class="muted small">
    {#if viewTiles > MAX_TILES}Ausschnitt zu groß ({viewTiles} Kacheln) – bitte weiter hineinzoomen.
    {:else}Aktueller Ausschnitt: {viewTiles} Kacheln, ca. {estimateMB(viewTiles).toLocaleString('de-DE')} MB.{/if}
    {#if usage}<br />Speicher: {usage}.{/if}
  </p>
  <details>
    <summary>Was ist offline verfügbar?</summary>
    <ul class="info">
      <li><b>Standard-Karte</b> in den gespeicherten Gebieten, bis Zoomstufe 14 (beim weiteren Hineinzoomen bleibt sie scharf).</li>
      <li><b>Nicht offline:</b> Topo, Satellit und die Wanderwege-Ebene – deren Anbieter verbieten das Herunterladen. Wege und Pfade sind aber in der Standard-Karte enthalten.</li>
      <li>Grenze: höchstens {MAX_TILES} Kacheln pro Download (≈ ein Gebiet von 100 × 100 km), damit der kostenlose Kartendienst fair genutzt wird.</li>
      <li>Touren, Aufzeichnen, GPS und das zuletzt geladene Wetter funktionieren ohne Netz. Neue Routen berechnen und die Suche brauchen Internet.</li>
    </ul>
  </details>
</div>

<style>
  h3 { margin: 0 0 8px; font-size: 1.05rem; }
  ul { list-style: none; padding: 0; margin: 0 0 10px; }
  li { display: flex; align-items: center; gap: 6px; border-bottom: 1px solid var(--line); }
  li:last-child { border-bottom: 0; }
  .name { flex: 1; text-align: left; border: 0; background: none; padding: 8px 0; display: flex; flex-direction: column; }
  .name span { font-size: .8rem; color: var(--muted); }
  .del { width: 44px; height: 44px; border: 0; background: none; border-radius: 8px; }
  .del:hover { background: #fde2e1; }
  .wide { width: 100%; }
  .small { font-size: .8rem; margin: 6px 0; }
  details { font-size: .85rem; margin-top: 6px; }
  summary { cursor: pointer; color: var(--green); font-weight: 650; }
  .info li { display: list-item; border: 0; list-style: disc; margin-left: 1.1em; padding: 3px 0; }
</style>
