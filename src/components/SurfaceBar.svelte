<script lang="ts">
  // Wegbeschaffenheit der geplanten Route als farbiger Balken: Asphalt / Forstweg / Pfad.
  import { planner } from '../lib/planner.svelte';
  import { surfaceCache, surfaceKey, routeSegment, type Surface } from '../lib/routing';

  let tick = $state(0);
  // Fehlende Abschnitte (z. B. bei gespeicherten Touren) einmal nachfragen, höchstens 12
  const asked = new Set<string>();
  $effect(() => {
    planner.route;
    const w = planner.waypoints;
    if (!navigator.onLine || planner.kind === 'track' || w.length > 13) return;
    const straight = planner.straight;
    (async () => {
      for (let i = 0; i < w.length - 1; i++) {
        if (straight[i]) continue;
        const a: [number, number] = [w[i].lng, w[i].lat], b: [number, number] = [w[i + 1].lng, w[i + 1].lat];
        const k = surfaceKey(a, b);
        if (surfaceCache.has(k) || asked.has(k)) continue;
        asked.add(k);
        try { await routeSegment(a, b); tick++; } catch { /* egal */ }
      }
    })();
  });

  const sum = $derived.by(() => {
    planner.route; tick; // neu berechnen, wenn sich die Route ändert
    const w = planner.waypoints;
    const s: Surface = { asphalt: 0, gravel: 0, path: 0, other: 0 };
    let known = 0;
    for (let i = 0; i < w.length - 1; i++) {
      const c = surfaceCache.get(surfaceKey([w[i].lng, w[i].lat], [w[i + 1].lng, w[i + 1].lat]));
      if (!c) continue;
      known++;
      s.asphalt += c.asphalt; s.gravel += c.gravel; s.path += c.path; s.other += c.other;
    }
    const total = s.asphalt + s.gravel + s.path + s.other;
    return known && total > 0 ? { s, total, partial: known < w.length - 1 } : null;
  });
  const km = (m: number) => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
  const PARTS = [
    { k: 'path', label: 'Pfad', color: '#b5442b' },
    { k: 'gravel', label: 'Forst-/Schotterweg', color: '#a8865a' },
    { k: 'asphalt', label: 'Asphalt', color: '#8e8e93' },
    { k: 'other', label: 'Sonstiges', color: '#48484a' },
  ] as const;
</script>

{#if sum}
  <div class="surf">
    <div class="bar">
      {#each PARTS as p}
        {#if sum.s[p.k] > 0}<div style:width="{(sum.s[p.k] / sum.total) * 100}%" style:background={p.color} title="{p.label}: {km(sum.s[p.k])} km"></div>{/if}
      {/each}
    </div>
    <div class="legend">
      {#each PARTS as p}
        {#if sum.s[p.k] > 50}<span><i style:background={p.color}></i>{p.label} {km(sum.s[p.k])} km</span>{/if}
      {/each}
    </div>
    {#if sum.partial}<p class="note">Teilweise unbekannt (gespeicherte oder importierte Abschnitte).</p>{/if}
  </div>
{/if}

<style>
  .surf { margin: 0 0 10px; }
  .bar { display: flex; height: 10px; border-radius: 5px; overflow: hidden; background: var(--surface2); }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .78rem; color: var(--text2); margin-top: 6px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .note { font-size: .72rem; color: var(--muted); margin: 4px 0 0; }
</style>
