<script lang="ts">
  // Zeichnet die Gipfel-Vorschläge auf die Karte und öffnet Vorschläge beim Antippen eines Gipfels.
  import type { GeoJSONSource, MapMouseEvent } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, onStyleReady } from '../lib/map.svelte';
  import { peakState, openPeak, SUGGEST_COLORS, PEAK_LAYERS } from '../lib/peaks.svelte';
  import { ui } from '../lib/ui.svelte';

  const SRC = 'peak-suggestions';

  function data(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: peakState.peak ? peakState.suggestions.map((s, i) => ({
        type: 'Feature',
        properties: { color: SUGGEST_COLORS[i % SUGGEST_COLORS.length], sel: peakState.selected === i },
        geometry: { type: 'LineString', coordinates: s.route.map((p) => [p[0], p[1]]) },
      })) : [],
    };
  }

  onStyleReady((map) => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('peak-sugg-casing')) {
      map.addLayer({ id: 'peak-sugg-casing', type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fff', 'line-width': ['case', ['get', 'sel'], 9, 6] } });
      map.addLayer({ id: 'peak-sugg', type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 6, 3.5], 'line-opacity': ['case', ['get', 'sel'], 1, 0.75] } });
    }
  });

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });

  // Karte auf alle Vorschläge ausrichten, sobald sie da sind
  let fitted = '';
  $effect(() => {
    const map = mapState.map, p = peakState.peak, s = peakState.suggestions;
    if (!map || !p || peakState.status !== 'done' || !s.length) return;
    const key = `${p.lng},${p.lat},${s.length}`;
    if (key === fitted) return;
    fitted = key;
    let w = p.lng, e = p.lng, so = p.lat, n = p.lat;
    for (const sg of s) for (const q of sg.route) { w = Math.min(w, q[0]); e = Math.max(e, q[0]); so = Math.min(so, q[1]); n = Math.max(n, q[1]); }
    const desktop = window.matchMedia('(min-width: 900px)').matches;
    map.fitBounds([[w, so], [e, n]], { padding: desktop ? 60 : { top: 70, left: 30, right: 70, bottom: Math.round(window.innerHeight * 0.5) }, duration: 800 });
  });

  // Gipfel auf der Standard-Karte antippen
  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    const click = (e: MapMouseEvent & { features?: { properties: Record<string, unknown>; geometry: { coordinates: number[] } }[] }) => {
      const f = e.features?.[0];
      if (!f) return;
      const name = String(f.properties['name:de'] ?? f.properties.name ?? 'Gipfel');
      const ele = f.properties.ele ? Number(f.properties.ele) : undefined;
      const [lng, lat] = f.geometry.coordinates;
      ui.view = 'planen';
      openPeak({ name, lng, lat, ele });
    };
    const enter = () => (map.getCanvas().style.cursor = 'pointer');
    const leave = () => (map.getCanvas().style.cursor = '');
    for (const l of PEAK_LAYERS) { map.on('click', l, click as never); map.on('mouseenter', l, enter); map.on('mouseleave', l, leave); }
    return () => { for (const l of PEAK_LAYERS) { map.off('click', l, click as never); map.off('mouseenter', l, enter); map.off('mouseleave', l, leave); } };
  });
</script>
