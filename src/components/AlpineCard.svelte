<script lang="ts">
  // Warnt, wenn die Route über Klettersteige, Gletscher oder alpine Steige (T4–T6) führt,
  // und markiert diese Abschnitte auf der Karte.
  import type { GeoJSONSource } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';
  import { alpineState, checkAlpine, ALPINE_STYLE } from '../lib/alpine.svelte';
  import { mapState, onStyleReady } from '../lib/map.svelte';

  $effect(() => {
    const r = planner.route;
    if (r.length > 1 && !planner.routing) checkAlpine(r);
  });

  const sections = $derived(alpineState.status === 'done' ? alpineState.sections : []);
  const km = (v: number) => v.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

  // ---------- Kartenmarkierung ----------
  const SRC = 'alpine-sections';
  function data(): GeoJSON.FeatureCollection {
    const r = planner.route;
    return {
      type: 'FeatureCollection',
      features: sections.filter((s) => s.toIdx > s.fromIdx && r[s.toIdx]).map((s) => ({
        type: 'Feature', properties: { color: ALPINE_STYLE[s.kind].color, kind: s.kind },
        geometry: { type: 'LineString', coordinates: r.slice(s.fromIdx, s.toIdx + 1).map((p) => [p[0], p[1]]) },
      })),
    };
  }
  onStyleReady((map) => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('alpine-sec')) {
      map.addLayer({
        id: 'alpine-sec', type: 'line', source: SRC,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': 11, 'line-opacity': 0.55, 'line-dasharray': [1, 0.6] },
      });
    }
  });
  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });
  $effect(() => () => {
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
  });

  const summary = $derived(
    sections.length
      ? [...new Set(sections.map((s) => ALPINE_STYLE[s.kind].label))].join(', ') + ' auf der Route'
      : '',
  );
  const has = (k: string) => sections.some((s) => s.kind === k);
</script>

{#if sections.length}
  <Disclosure id="alpine" icon="⚠️" tint="#ff3b30" title="Alpine Abschnitte" {summary} badge="Achtung" defaultOpen>
    <ul class="list">
      {#each sections as s, i (i)}
        <li>
          <span class="icon" style:background={ALPINE_STYLE[s.kind].color}>{ALPINE_STYLE[s.kind].icon}</span>
          <span class="txt">
            <span class="name">{ALPINE_STYLE[s.kind].label}{s.grade ? ` · ${s.grade}` : ''}</span>
            <span class="sub">km {km(s.fromKm)}–{km(s.toKm)}{s.name && s.name !== ALPINE_STYLE[s.kind].label ? ` · ${s.name}` : ''}</span>
          </span>
        </li>
      {/each}
    </ul>
    <div class="advice">
      {#if has('via_ferrata')}<p>🧗 <b>Klettersteig:</b> Nur mit Klettersteigset, Gurt und Helm. Schwierigkeit A (leicht) bis E/F (extrem). Bei Gewitter niemals einsteigen – Stahlseile ziehen Blitze an.</p>{/if}
      {#if has('glacier')}<p>🧊 <b>Gletscher:</b> Spaltengefahr! Nur mit Seilschaft, Steigeisen, Pickel und Kenntnis der Spaltenbergung – oder mit Bergführer. Im Sommer am Nachmittag weicher Schnee über Spalten.</p>{/if}
      {#if has('alpine')}<p>⛰️ <b>Alpiner Steig (T4–T6):</b> Trittsicherheit und Schwindelfreiheit nötig, teils Kletterstellen mit Händen. Bei Nässe deutlich schwieriger.</p>{/if}
    </div>
    <p class="note">Auf der Karte rot (Klettersteig), hellblau (Gletscher) und lila (alpin) hinterlegt. Daten aus OpenStreetMap – vor Ort Verhältnisse prüfen.</p>
  </Disclosure>
{:else if alpineState.status === 'loading'}
  <p class="checking">Prüfe Route auf Klettersteige und Gletscher …</p>
{/if}

<style>
  .list { list-style: none; margin: 0; padding: 0; background: var(--surface2); border-radius: 12px; overflow: hidden; }
  li { display: flex; align-items: center; gap: 10px; padding: 10px 12px; }
  li + li { border-top: 0.5px solid var(--line); }
  .icon { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-size: 1rem; }
  .txt { display: flex; flex-direction: column; }
  .name { font-weight: 600; font-size: .95rem; }
  .sub { font-size: .8rem; color: #8e8e93; }
  .advice p { font-size: .85rem; margin: 10px 2px 0; color: var(--text2); }
  .note { font-size: .74rem; color: #8e8e93; margin: 8px 2px 0; }
  .checking { font-size: .78rem; color: #8e8e93; margin: -4px 4px 10px; }
</style>
