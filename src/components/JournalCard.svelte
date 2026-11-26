<script lang="ts">
  // Tourenbuch: Statistik der gelaufenen (aufgezeichneten) Touren pro Jahr und Monat + alle Touren auf der Karte.
  import Disclosure from './Disclosure.svelte';
  import type { Tour } from '../lib/db';
  import { formatDuration, formatDistance } from '../lib/geo';
  import { journal } from '../lib/journal.svelte';
  import { ui } from '../lib/ui.svelte';
  import { mapState } from '../lib/map.svelte';

  let { tours }: { tours: Tour[] } = $props();

  const walked = $derived(tours.filter((t) => t.kind === 'track' && t.stats));
  const dateOf = (t: Tour) => new Date(t.track?.startedAt ?? t.times?.[0] ?? t.createdAt);
  const years = $derived([...new Set(walked.map((t) => dateOf(t).getFullYear()))].sort((a, b) => b - a));
  let year = $state(new Date().getFullYear());
  $effect(() => { if (years.length && !years.includes(year)) year = years[0]; });

  const inYear = $derived(walked.filter((t) => dateOf(t).getFullYear() === year));
  const sum = $derived({
    n: inYear.length,
    km: inYear.reduce((s, t) => s + t.stats!.meters, 0) / 1000,
    up: inYear.reduce((s, t) => s + t.stats!.up, 0),
    h: inYear.reduce((s, t) => s + (t.track ? t.track.movingMs / 3600e3 : t.stats!.hours), 0),
    top: inYear.reduce<Tour | null>((m, t) => (!m || (t.stats!.maxEle ?? 0) > (m.stats!.maxEle ?? 0) ? t : m), null),
    longest: inYear.reduce<Tour | null>((m, t) => (!m || t.stats!.meters > m.stats!.meters ? t : m), null),
  });
  const months = $derived.by(() => {
    const km = Array(12).fill(0);
    for (const t of inYear) km[dateOf(t).getMonth()] += t.stats!.meters / 1000;
    return km;
  });
  const maxKm = $derived(Math.max(1, ...months));
  const M = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
  const n0 = (x: number) => Math.round(x).toLocaleString('de-DE');

  function showAll() {
    journal.showAll = !journal.showAll;
    if (journal.showAll) {
      ui.view = 'karte';
      const pts = tours.flatMap((t) => (t.start ? [t.start] : []));
      if (pts.length) {
        const w = Math.min(...pts.map((p) => p[0])), e = Math.max(...pts.map((p) => p[0]));
        const s = Math.min(...pts.map((p) => p[1])), n = Math.max(...pts.map((p) => p[1]));
        mapState.map?.fitBounds([[w - 0.05, s - 0.05], [e + 0.05, n + 0.05]], { padding: 40, maxZoom: 12 });
      }
    }
  }

  const summary = $derived(walked.length ? `${year}: ${sum.n} ${sum.n === 1 ? 'Tour' : 'Touren'} · ${n0(sum.km)} km · ${n0(sum.up)} Hm` : 'Noch keine gelaufenen Touren');
</script>

<Disclosure id="journal" icon="book" tint="#ff9f0a" title="Tourenbuch" {summary}>
  {#if walked.length}
    {#if years.length > 1}
      <div class="years">
        {#each years as y}<button class:on={y === year} onclick={() => (year = y)}>{y}</button>{/each}
      </div>
    {/if}
    <div class="grid">
      <div><b>{sum.n}</b><span>{sum.n === 1 ? 'Tour' : 'Touren'}</span></div>
      <div><b>{n0(sum.km)}</b><span>Kilometer</span></div>
      <div><b>{n0(sum.up)}</b><span>Höhenmeter</span></div>
      <div><b>{formatDuration(sum.h)}</b><span>unterwegs</span></div>
    </div>
    <div class="chart" aria-label="Kilometer pro Monat">
      {#each months as km, i}
        <div class="col" title="{n0(km)} km">
          <div class="bar" style:height="{(km / maxKm) * 100}%"></div>
          <span>{M[i]}</span>
        </div>
      {/each}
    </div>
    {#if sum.top?.stats?.maxEle}<p class="fact">Höchster Punkt: <b>{n0(sum.top.stats.maxEle)} m</b> – {sum.top.name}</p>{/if}
    {#if sum.longest}<p class="fact">Längste Tour: <b>{formatDistance(sum.longest.stats!.meters)}</b> – {sum.longest.name}</p>{/if}
  {:else}
    <p class="fact">Hier erscheinen deine gelaufenen Touren – aufgezeichnet in der App oder als GPX mit Zeitangaben importiert (z. B. aus „Open GPX Tracker“).</p>
  {/if}
  <button class="btn secondary wide" onclick={showAll}>{journal.showAll ? 'Alle Touren auf der Karte ausblenden' : 'Alle Touren auf der Karte zeigen'}</button>
  <p class="note">Gelaufen = orange, geplant = grau gestrichelt.</p>
</Disclosure>

<style>
  .years { display: flex; gap: 6px; margin-bottom: 8px; flex-wrap: wrap; }
  .years button { border: 0; background: var(--surface2); color: var(--text2); border-radius: 999px; padding: 4px 12px; font-weight: 600; font-size: .82rem; }
  .years button.on { background: #ff9f0a; color: #000; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
  .grid div { background: var(--surface2); border-radius: 12px; padding: 8px 4px; display: flex; flex-direction: column; align-items: center; }
  .grid b { font-size: 1.05rem; font-variant-numeric: tabular-nums; }
  .grid span { font-size: .7rem; color: var(--muted); }
  .chart { display: flex; gap: 4px; height: 90px; margin: 12px 0 6px; align-items: flex-end; }
  .col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 3px; }
  .bar { width: 100%; min-height: 2px; background: #ff9f0a; border-radius: 4px 4px 1px 1px; }
  .col span { font-size: .65rem; color: var(--muted); }
  .fact { font-size: .84rem; color: var(--text2); margin: 4px 0; }
  .note { font-size: .72rem; color: var(--muted); margin: 6px 0 0; }
  .wide { width: 100%; margin-top: 8px; }
</style>
