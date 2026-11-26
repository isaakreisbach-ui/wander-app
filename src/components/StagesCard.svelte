<script lang="ts">
  // Mehrtagestour: Route in Tagesetappen aufteilen – Etappenende möglichst an einer Hütte.
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';
  import { poiState, poisAlongRoute } from '../lib/pois.svelte';
  import { walkingTimeHours, formatDistance, formatDuration } from '../lib/geo';
  import { mapState } from '../lib/map.svelte';

  const KEY = 'wander.stages.';
  const tourKey = $derived(planner.tourId ?? 'entwurf');
  const totalH = $derived(planner.stats?.hours ?? 0);
  const suggested = $derived(Math.max(1, Math.ceil(totalH / 6)));
  let chosen = $state<number | null>(null);
  $effect(() => {
    const v = Number(localStorage.getItem(KEY + tourKey));
    chosen = v >= 1 ? v : null;
  });
  const days = $derived(chosen ?? suggested);
  function setDays(n: number) {
    chosen = Math.min(7, Math.max(1, n));
    localStorage.setItem(KEY + tourKey, String(chosen));
  }

  // Gehzeit, Auf- und Abstieg bis zu jedem Punkt
  const acc = $derived.by(() => {
    const r = planner.route, cum = planner.cum;
    const up: number[] = [0], down: number[] = [0], t: number[] = [0];
    for (let i = 1; i < r.length; i++) {
      const d = (r[i][2] ?? 0) - (r[i - 1][2] ?? 0);
      up[i] = up[i - 1] + (d > 0 ? d : 0);
      down[i] = down[i - 1] + (d < 0 ? -d : 0);
      t[i] = walkingTimeHours(cum[i], up[i] * 0.85, down[i] * 0.85); // kleine Höhenschwankungen glätten
    }
    // auf die angezeigte Gesamt-Gehzeit abgleichen
    const f = t[t.length - 1] > 0 ? totalH / t[t.length - 1] : 1;
    return { up, down, t: t.map((x) => x * f) };
  });

  const huts = $derived(poisAlongRoute(planner.route, planner.cum, poiState.pois, 500).filter((p) => p.kind === 'hut' || (p.kind === 'shelter')));

  const idxAtKm = (km: number) => {
    const m = km * 1000, c = planner.cum;
    let lo = 0, hi = c.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (c[mid] < m) lo = mid + 1; else hi = mid; }
    return lo;
  };

  type Stage = { from: number; to: number; km: number; up: number; down: number; h: number; hut?: { name: string; off: number; type: string } };
  const stages = $derived.by((): Stage[] => {
    const n = planner.route.length;
    if (n < 2 || days < 2) return [];
    const { t, up, down } = acc;
    const T = t[n - 1];
    const cuts: { i: number; hut?: Stage['hut'] }[] = [];
    let prev = 0;
    for (let k = 1; k < days; k++) {
      const target = (T * k) / days, win = (T / days) * 0.3;
      let best: { i: number; hut?: Stage['hut']; d: number } | null = null;
      for (const h of huts) {
        const i = idxAtKm(h.km);
        if (i <= prev) continue;
        const d = Math.abs(t[i] - target);
        if (d <= win && (!best || d + (h.kind === 'shelter' ? win / 2 : 0) < best.d))
          best = { i, d, hut: { name: h.name || (h.kind === 'hut' ? 'Hütte' : 'Unterstand'), off: Math.round(h.off), type: h.kind === 'hut' ? 'Hütte' : 'nur Unterstand' } };
      }
      if (!best) { let i = prev + 1; while (i < n - 1 && t[i] < target) i++; best = { i, d: 0 }; }
      cuts.push(best);
      prev = best.i;
    }
    const bounds = [0, ...cuts.map((c) => c.i), n - 1];
    return bounds.slice(1).map((to, k) => {
      const from = bounds[k];
      return {
        from, to, km: (planner.cum[to] - planner.cum[from]),
        up: up[to] - up[from], down: down[to] - down[from], h: t[to] - t[from],
        hut: cuts[k]?.hut,
      };
    });
  });

  function show(i: number) {
    const p = planner.route[i];
    mapState.map?.flyTo({ center: [p[0], p[1]], zoom: 14 });
  }

  const summary = $derived(days < 2 ? 'Als Mehrtagestour aufteilen' : `${days} Etappen · Ø ${formatDuration(totalH / days)} pro Tag`);
</script>

{#if planner.stats && planner.route.length > 1}
  <Disclosure id="stages" icon="bed" tint="#af52de" title="Etappen" {summary}>
    <div class="days">
      <span>Tage</span>
      <button onclick={() => setDays(days - 1)} disabled={days <= 1} aria-label="Weniger Tage">−</button>
      <b>{days}</b>
      <button onclick={() => setDays(days + 1)} disabled={days >= 7} aria-label="Mehr Tage">+</button>
    </div>
    {#if days < 2}
      <p class="txt">Die ganze Tour dauert {formatDuration(totalH)}. Mit „+“ teilst du sie in Tagesetappen – das Etappenende wird möglichst an eine Hütte gelegt.</p>
    {:else}
      <ol class="list">
        {#each stages as s, k}
          <li>
            <button class="row" onclick={() => show(s.to)}>
              <span class="n">{k + 1}</span>
              <span class="t">
                <b>Tag {k + 1}: {formatDistance(s.km)} · {formatDuration(s.h)}</b>
                <small>↑ {Math.round(s.up)} m · ↓ {Math.round(s.down)} m</small>
                {#if k < stages.length - 1}
                  {#if s.hut}<small class="hut">Übernachtung: {s.hut.name} ({s.hut.type}{s.hut.off > 60 ? `, ${s.hut.off} m abseits` : ''})</small>
                  {:else}<small class="warn">Keine Hütte in der Nähe – Unterkunft selbst suchen</small>{/if}
                {:else}<small>Ziel</small>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ol>
      <p class="note">Antippen zeigt das Etappenende auf der Karte. Hütten stammen aus OpenStreetMap – ob sie bewirtschaftet sind und Betten frei haben, bitte vorher bei der Hütte erfragen und reservieren. Pensionen und Hotels im Tal sind nicht enthalten.</p>
    {/if}
  </Disclosure>
{/if}

<style>
  .days { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; font-size: .92rem; }
  .days span { flex: 1; color: var(--text2); }
  .days button { width: 34px; height: 34px; border-radius: 10px; border: none; background: var(--surface2); color: var(--text); font-size: 1.2rem; font-weight: 700; }
  .days button:disabled { opacity: .35; }
  .days b { min-width: 18px; text-align: center; font-size: 1.05rem; }
  .txt { font-size: .86rem; color: var(--text2); }
  .list { list-style: none; padding: 0; margin: 8px 0; background: var(--surface2); border-radius: 12px; overflow: hidden; }
  li + li { border-top: 0.5px solid var(--line); }
  .row { all: unset; box-sizing: border-box; width: 100%; display: flex; gap: 10px; align-items: center; padding: 9px 12px; cursor: pointer; }
  .row:hover, .row:active { background: var(--surface3); }
  .n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: #af52de; color: #fff; display: grid; place-items: center; font-weight: 800; font-size: .85rem; }
  .t { display: flex; flex-direction: column; font-size: .88rem; }
  .t small { color: var(--muted); font-size: .76rem; }
  .t small.hut { color: var(--ok); }
  .t small.warn { color: var(--warn); }
  .note { font-size: .72rem; color: var(--muted); }
</style>
