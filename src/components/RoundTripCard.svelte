<script lang="ts">
  // Rundtour nach Zeit: vom Startpunkt drei Runden (Dreiecke in verschiedene Richtungen),
  // jeweils mit BRouter über Wanderwege berechnet. Die passendste kann man übernehmen.
  import { routeSegment } from '../lib/routing';
  import { cumulative, climb, walkingTimeHours, formatDistance, formatDuration, type Pt } from '../lib/geo';
  import { planner } from '../lib/planner.svelte';
  import { mapState } from '../lib/map.svelte';
  import { favs } from '../lib/favorites.svelte';
  import { fitRoute, confirmDiscard } from '../lib/tours';

  let hours = $state(3);
  let startMode = $state<'map' | 'gps' | string>('map');
  let busy = $state(false);
  let msg = $state('');
  type Loop = { dir: string; pts: [number, number][]; segs: Pt[][]; route: Pt[]; meters: number; up: number; h: number };
  let loops = $state<Loop[]>([]);

  const dest = (p: [number, number], d: number, bearing: number): [number, number] => {
    const b = (bearing * Math.PI) / 180;
    return [p[0] + (d * Math.sin(b)) / (111320 * Math.cos((p[1] * Math.PI) / 180)), p[1] + (d * Math.cos(b)) / 111320];
  };

  async function startPoint(): Promise<[number, number] | null> {
    if (startMode === 'gps') {
      return new Promise((res) => navigator.geolocation.getCurrentPosition(
        (p) => res([p.coords.longitude, p.coords.latitude]), () => res(null), { enableHighAccuracy: true, timeout: 20000 }));
    }
    const f = favs.list.find((x) => x.id === startMode);
    if (f) return [f.lng, f.lat];
    const c = mapState.map?.getCenter();
    return c ? [c.lng, c.lat] : null;
  }

  async function suggest() {
    busy = true; loops = []; msg = 'Suche Startpunkt …';
    try {
      const s = await startPoint();
      if (!s) { msg = 'Startpunkt nicht gefunden (Ortung erlaubt?).'; return; }
      // Zielstrecke: ca. 3,5 km pro Stunde (Höhenmeter brauchen Zeit), Umweg-Faktor der Wege ~1,3
      const total = hours * 3500;
      const side = total / 3 / 1.3;
      const dirs = [{ b: 0, n: 'Norden' }, { b: 120, n: 'Südosten' }, { b: 240, n: 'Südwesten' }];
      for (const d of dirs) {
        msg = `Berechne Runde Richtung ${d.n} …`;
        const a = dest(s, side, d.b - 30), b = dest(s, side, d.b + 30);
        const pts: [number, number][] = [s, a, b, s];
        try {
          const segs: Pt[][] = [];
          for (let i = 0; i < 3; i++) segs.push(await routeSegment(pts[i], pts[i + 1]));
          const route = segs.reduce<Pt[]>((acc, sg) => acc.concat(acc.length ? sg.slice(1) : sg), []);
          const cum = cumulative(route);
          const { up, down } = climb(route);
          loops = [...loops, { dir: d.n, pts, segs, route, meters: cum[cum.length - 1], up, h: walkingTimeHours(cum[cum.length - 1], up, down) }]
            .sort((x, y) => Math.abs(x.h - hours) - Math.abs(y.h - hours));
        } catch { /* diese Richtung geht nicht */ }
      }
      msg = loops.length ? '' : 'Keine Runde gefunden – anderen Startpunkt probieren.';
    } finally { busy = false; }
  }

  function adopt(l: Loop) {
    if (!confirmDiscard()) return;
    planner.newPlanFrom(`Runde Richtung ${l.dir} (${formatDuration(l.h)})`, l.pts.slice(0, 4),
      l.segs.map((pts, i) => ({ a: l.pts[i], b: l.pts[i + 1], pts })));
    fitRoute(l.route);
  }
</script>

<div class="rt">
  <label>Dauer: <b>{hours} h</b>
    <input type="range" min="1" max="8" step="0.5" bind:value={hours} />
  </label>
  <label>Start:
    <select bind:value={startMode}>
      <option value="map">Kartenmitte</option>
      <option value="gps">Mein Standort</option>
      {#each favs.list as f}<option value={f.id}>⭐ {f.name}</option>{/each}
    </select>
  </label>
  <button class="btn" onclick={suggest} disabled={busy}>{busy ? 'Berechne …' : 'Runden vorschlagen'}</button>
  {#if msg}<p class="msg">{msg}</p>{/if}
  {#each loops as l}
    <button class="loop" onclick={() => adopt(l)}>
      <b>Richtung {l.dir}</b>
      <span>{formatDistance(l.meters)} · ↗ {Math.round(l.up)} m · ⏱ {formatDuration(l.h)}</span>
      <span class="go">Übernehmen ›</span>
    </button>
  {/each}
</div>

<style>
  .rt { background: var(--surface); border-radius: 14px; padding: 12px; margin-top: 8px; display: flex; flex-direction: column; gap: 10px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: .9rem; color: var(--text2); }
  input[type='range'] { accent-color: #30d158; }
  select { min-height: 42px; border-radius: 10px; border: 1px solid var(--line); padding: 0 10px; font: inherit; font-size: 16px; }
  .msg { font-size: .85rem; color: var(--muted); margin: 0; }
  .loop { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; text-align: left; border: 0; border-radius: 12px; background: var(--surface2); color: var(--text); padding: 10px 12px; }
  .loop span { font-size: .85rem; color: var(--text2); }
  .loop .go { color: #0a84ff; font-weight: 600; }
</style>
