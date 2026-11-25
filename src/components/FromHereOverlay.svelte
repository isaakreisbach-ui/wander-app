<script lang="ts">
  // Zeigt die „Von hier aus“-Vorschläge auf der Karte: Wege zu Gipfeln (farbig) und Wanderungen (grün).
  import { Marker, type GeoJSONSource } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, onStyleReady } from '../lib/map.svelte';
  import { fromHere, FH_COLORS } from '../lib/fromhere.svelte';

  const SRC = 'from-here';

  function data(): GeoJSON.FeatureCollection {
    if (!fromHere.point) return { type: 'FeatureCollection', features: [] };
    const sel = fromHere.selected;
    const line = (coords: number[][], props: Record<string, unknown>): GeoJSON.Feature => ({
      type: 'Feature', properties: props, geometry: { type: 'LineString', coordinates: coords },
    });
    return {
      type: 'FeatureCollection',
      features: [
        ...fromHere.hikes.map((h) => line(h.route.map((p) => [p[0], p[1]]), {
          color: '#1d7a3e', sel: sel?.type === 'hike' && sel.id === h.id, hike: true,
        })),
        ...fromHere.peaks.map((p, i) => line(p.route.map((q) => [q[0], q[1]]), {
          color: FH_COLORS[i % FH_COLORS.length], sel: sel?.type === 'peak' && sel.id === p.id, hike: false,
        })),
      ],
    };
  }

  onStyleReady((map) => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('fh-casing')) {
      map.addLayer({ id: 'fh-casing', type: 'line', source: SRC, layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#fff', 'line-width': ['case', ['get', 'sel'], 9, 5], 'line-opacity': ['case', ['get', 'sel'], 1, 0.7] } });
      // Wanderungen gestrichelt, Wege zu Gipfeln durchgezogen
      map.addLayer({ id: 'fh-hike', type: 'line', source: SRC, filter: ['==', ['get', 'hike'], true],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 6, 3], 'line-opacity': ['case', ['get', 'sel'], 1, 0.5], 'line-dasharray': [2, 1] } });
      map.addLayer({ id: 'fh-line', type: 'line', source: SRC, filter: ['!=', ['get', 'hike'], true],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'sel'], 6, 3], 'line-opacity': ['case', ['get', 'sel'], 1, 0.7] } });
    }
  });

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });

  // Markierung am angetippten Punkt
  let marker: Marker | null = null;
  $effect(() => {
    const map = mapState.map, p = fromHere.point;
    marker?.remove();
    marker = null;
    if (map && p) {
      const el = document.createElement('div');
      el.className = 'fh-pin';
      el.textContent = '📍';
      marker = new Marker({ element: el, anchor: 'bottom' }).setLngLat([p.lng, p.lat]).addTo(map);
    }
  });
</script>

<style>
  :global(.fh-pin) { font-size: 30px; line-height: 1; filter: drop-shadow(0 2px 3px rgba(0, 0, 0, .35)); pointer-events: none; }
</style>
