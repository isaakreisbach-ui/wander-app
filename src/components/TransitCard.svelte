<script lang="ts">
  // Anreise: nächste Haltestellen am Startpunkt (OpenStreetMap) und Absprung in die Karten-App mit Bus & Bahn.
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';
  import { overpass } from '../lib/overpass';
  import { distance, formatDistance } from '../lib/geo';
  import { directionsUrl } from '../lib/peaks.svelte';

  type Stop = { name: string; kind: 'Bahn' | 'Bus' | 'Seilbahn'; lng: number; lat: number; d: number };
  const start = $derived(planner.route[0]);
  const key = $derived(start ? `${start[0].toFixed(3)},${start[1].toFixed(3)}` : '');
  let stops = $state<Stop[] | null>(null);
  let status = $state<'idle' | 'loading' | 'error'>('idle');
  let loadedKey = '';

  async function load() {
    if (!start || loadedKey === key || !navigator.onLine) return;
    loadedKey = key;
    status = 'loading';
    const [lng, lat] = start;
    const a = `(around:1500,${lat.toFixed(5)},${lng.toFixed(5)})`;
    try {
      const els = await overpass(`[out:json][timeout:20];(node["highway"="bus_stop"]${a};node["railway"~"^(station|halt)$"]${a};node["aerialway"="station"]${a};);out body;`);
      const seen = new Set<string>();
      stops = els
        .map((e) => {
          const t = e.tags ?? {};
          const kind: Stop['kind'] = t.railway ? 'Bahn' : t.aerialway ? 'Seilbahn' : 'Bus';
          return { name: t.name ?? 'Haltestelle', kind, lng: e.lon!, lat: e.lat!, d: distance([lng, lat], [e.lon!, e.lat!]) };
        })
        .sort((x, y) => x.d - y.d)
        .filter((s) => { const k = s.name + s.kind; if (seen.has(k)) return false; seen.add(k); return true; })
        .slice(0, 4);
      status = 'idle';
    } catch {
      status = 'error';
      loadedKey = '';
    }
  }
  $effect(() => { key; load(); });

  const summary = $derived(
    !stops ? (status === 'loading' ? 'Suche Haltestellen …' : 'Mit Bus & Bahn oder Auto')
      : stops.length ? `${stops[0].kind} „${stops[0].name}“ · ${formatDistance(stops[0].d)} vom Start` : 'Keine Haltestelle im Umkreis von 1,5 km',
  );
</script>

{#if start}
  <Disclosure id="transit" icon="train" tint="#0a84ff" title="Anreise" {summary}>
    {#if stops?.length}
      <ul class="list">
        {#each stops as s}
          <li>
            <span class="k">{s.kind}</span>
            <span class="n">{s.name}</span>
            <span class="d">{formatDistance(s.d)}</span>
            <a href={directionsUrl(s.lng, s.lat, 'transit')} target="_blank" rel="noopener">Verbindung</a>
          </li>
        {/each}
      </ul>
    {:else if status === 'error'}
      <p class="txt">Haltestellen konnten nicht geladen werden (Server ausgelastet).</p>
    {/if}
    <div class="btns">
      <a class="btn" href={directionsUrl(start[0], start[1], 'transit')} target="_blank" rel="noopener">Mit Bus & Bahn zum Start</a>
      <a class="btn secondary" href={directionsUrl(start[0], start[1], 'car')} target="_blank" rel="noopener">Mit dem Auto</a>
    </div>
    <p class="note">Öffnet die Karten-App deines Geräts mit deinem Standort als Start. Fahrpläne kommen von dort – bitte besonders am Wochenende und abends die letzte Rückfahrt prüfen.</p>
  </Disclosure>
{/if}

<style>
  .list { list-style: none; padding: 0; margin: 0 0 10px; background: var(--surface2); border-radius: 12px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 8px; padding: 9px 12px; font-size: .88rem; }
  li + li { border-top: 0.5px solid var(--line); }
  .k { flex: none; font-size: .7rem; font-weight: 700; color: #0a84ff; background: rgba(10, 132, 255, .15); border-radius: 6px; padding: 1px 6px; }
  .n { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .d { flex: none; color: var(--muted); font-size: .8rem; }
  li a { flex: none; color: #0a84ff; font-size: .8rem; font-weight: 600; text-decoration: none; }
  .btns { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .btns a { text-align: center; text-decoration: none; display: grid; place-items: center; }
  .txt { font-size: .86rem; color: var(--text2); }
  .note { font-size: .72rem; color: var(--muted); }
</style>
