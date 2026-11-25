<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db, type Tour } from '../lib/db';
  import { formatDistance, formatDuration } from '../lib/geo';
  import { openTour, exportTour, deleteTour, renameTour, importGpxFiles, confirmDiscard } from '../lib/tours';
  import { planner } from '../lib/planner.svelte';
  import { ui } from '../lib/ui.svelte';

  let tours = $state<Tour[] | null>(null);
  let filter = $state('');
  let fileInput: HTMLInputElement;

  $effect(() => {
    const sub = liveQuery(() => db.tours.orderBy('updatedAt').reverse().toArray()).subscribe({
      next: (v) => (tours = v),
      error: (e) => console.error(e),
    });
    return () => sub.unsubscribe();
  });

  const shown = $derived(
    (tours ?? []).filter((t) => !filter.trim() || t.name.toLowerCase().includes(filter.trim().toLowerCase())),
  );

  function newPlan() {
    if (!confirmDiscard()) return;
    planner.newTour();
    ui.view = 'planen';
  }

  const fmtDate = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
</script>

<div class="head">
  <h2>Meine Touren</h2>
  <div class="actions">
    <button class="btn" onclick={newPlan}>＋ Neue Tour</button>
    <button class="btn secondary" onclick={() => fileInput.click()}>GPX importieren</button>
    <button class="btn secondary" onclick={() => (ui.scanner = true)}>📷 QR scannen</button>
    <button class="btn secondary" onclick={() => (ui.pasteLink = true)}>🔗 Link einfügen</button>
    <input
      bind:this={fileInput}
      type="file"
      multiple
      hidden
      onchange={(e) => { const f = e.currentTarget.files; if (f?.length) importGpxFiles(f); e.currentTarget.value = ''; }}
    />
  </div>
</div>

{#if tours === null}
  <p class="muted">Lade …</p>
{:else if tours.length === 0}
  <div class="card">
    <p><b>Noch keine Touren gespeichert.</b></p>
    <p class="muted">Plane eine Tour unter „Planen“ und tippe auf „Speichern“ – oder importiere eine GPX-Datei
      (z. B. von Outdooractive, Komoot oder einer Tourenbeschreibung).</p>
  </div>
{:else}
  {#if tours.length > 5}
    <input class="filter" type="search" placeholder="Touren durchsuchen …" bind:value={filter} aria-label="Touren durchsuchen" />
  {/if}
  <ul class="list">
    {#each shown as t (t.id)}
      <li class="tour" class:current={planner.tourId === t.id}>
        <button class="main" onclick={() => openTour(t)}>
          <span class="name">{t.name}</span>
          <span class="facts">
            {#if t.stats}
              <span>{formatDistance(t.stats.meters)}</span>
              <span>↗ {Math.round(t.stats.up)} m</span>
              <span>↘ {Math.round(t.stats.down)} m</span>
              <span>⏱ {formatDuration(t.stats.hours)}</span>
              <span class="diff {t.stats.difficulty}">{t.stats.difficulty}</span>
            {/if}
          </span>
          <span class="date">
            {t.kind === 'track' ? 'Aufgezeichnet' : t.source === 'gpx' ? 'GPX-Import' : t.source === 'link' ? 'Empfangen' : 'Geplant'} · zuletzt geändert {fmtDate(t.updatedAt)}
            {#if planner.tourId === t.id}<b> · gerade geöffnet</b>{/if}
          </span>
        </button>
        <div class="row">
          <button onclick={() => openTour(t)}>Öffnen</button>
          <button onclick={() => (ui.share = t)}>Teilen</button>
          <button onclick={() => exportTour(t)}>GPX</button>
          <button onclick={() => renameTour(t)}>Umbenennen</button>
          <button class="danger" onclick={() => deleteTour(t)}>Löschen</button>
        </div>
      </li>
    {:else}
      <li class="muted">Keine Tour passt zur Suche.</li>
    {/each}
  </ul>
{/if}

<style>
  .head { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; }
  .head h2 { margin: 0; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .filter {
    width: 100%; height: 44px; padding: 0 12px; margin-bottom: 10px;
    border: 1px solid var(--line); border-radius: 10px; font: inherit; font-size: 16px;
  }
  .list { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 10px; }
  .tour { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); overflow: hidden; }
  .tour.current { border-color: var(--green); box-shadow: 0 0 0 2px var(--green-soft); }
  .main {
    width: 100%; text-align: left; border: 0; background: none; padding: 12px 14px 8px;
    display: flex; flex-direction: column; gap: 4px;
  }
  .name { font-weight: 750; font-size: 1.05rem; }
  .facts { display: flex; flex-wrap: wrap; gap: 4px 12px; font-variant-numeric: tabular-nums; font-size: .92rem; }
  .date { font-size: .8rem; color: var(--muted); }
  .diff { font-weight: 700; text-transform: capitalize; padding: 0 8px; border-radius: 999px; color: #fff; font-size: .8rem; }
  .diff.leicht { background: #1d7a3e; }
  .diff.mittel { background: #c77700; }
  .diff.schwer { background: #b3261e; }
  .row { display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--line); }
  .row button {
    min-height: 48px; border: 0; background: none; font-size: .8rem; font-weight: 650; color: var(--green);
    padding: 0 2px; overflow: hidden; text-overflow: ellipsis;
  }
  .row button + button { border-left: 1px solid var(--line); }
  .row button:hover { background: var(--green-soft); }
  .row .danger { color: var(--bad); }
  @media (pointer: fine) { .row button { min-height: 38px; } }
</style>
