<script lang="ts">
  // Pfade und Forstwege schon bei Zoom 12–13 zeigen (die Standard-Karte enthält sie erst ab 14).
  // Daten aus OpenStreetMap (Overpass), je Kachel 0,05° einmal geladen und im Speicher gehalten.
  import type { GeoJSONSource } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, mapSettings, onStyleReady } from '../lib/map.svelte';
  import { overpass } from '../lib/overpass';
  import { cellsForBbox } from '../lib/pois.svelte';

  const SRC = 'low-zoom-paths';
  const CELL = 0.05;
  const loaded = new Set<string>();
  const loading = new Set<string>();
  const feats: GeoJSON.Feature[] = [];
  let version = $state(0);

  function data(): GeoJSON.FeatureCollection {
    version;
    return { type: 'FeatureCollection', features: feats };
  }

  async function loadCell(key: string) {
    if (loaded.has(key) || loading.has(key)) return;
    loading.add(key);
    const [cx, cy] = key.split('_').map(Number);
    const bb = `(${(cy * CELL).toFixed(4)},${(cx * CELL).toFixed(4)},${((cy + 1) * CELL).toFixed(4)},${((cx + 1) * CELL).toFixed(4)})`;
    try {
      const els = (await overpass(`[out:json][timeout:25];way["highway"~"^(path|footway|bridleway|steps|track)$"]${bb};out geom tags;`)) as
        { tags?: Record<string, string>; geometry?: { lat: number; lon: number }[] }[];
      for (const w of els) {
        if (!w.geometry?.length) continue;
        feats.push({
          type: 'Feature', properties: { track: w.tags?.highway === 'track' },
          geometry: { type: 'LineString', coordinates: w.geometry.map((g) => [g.lon, g.lat]) },
        });
      }
      loaded.add(key);
      version++;
    } catch { /* später erneut */ } finally { loading.delete(key); }
  }

  onStyleReady((map) => {
    if (!map.getSource('openmaptiles')) return; // Standard- und Satelliten-Karte
    const sat = !!map.getSource('satellit');
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('lz-paths')) {
      // nur zwischen Zoom 12 und 14 – darüber übernimmt die Karte selbst
      map.addLayer({ id: 'lz-paths', type: 'line', source: SRC, minzoom: 12, maxzoom: 14,
        paint: {
          'line-color': ['case', ['get', 'track'], sat ? '#ffffff' : '#8a6a3b', sat ? '#ffd166' : '#b5442b'],
          'line-width': ['interpolate', ['linear'], ['zoom'], 12, 0.9, 14, 1.6],
          'line-dasharray': [2, 1.2],
        } }, map.getLayer('road_path_pedestrian') ? 'road_path_pedestrian' : map.getLayer('sat-casing') ? 'sat-casing' : undefined);
    }
  });

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });

  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    let t: ReturnType<typeof setTimeout>;
    const load = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        const z = map.getZoom();
        if (mapSettings.base === 'topo' || z < 12 || z >= 14 || !navigator.onLine) return;
        const b = map.getBounds();
        const cells = cellsForBbox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        if (cells.length <= 9) cells.forEach((c) => loadCell(c));
      }, 700);
    };
    map.on('moveend', load);
    load();
    return () => { map.off('moveend', load); clearTimeout(t); };
  });
</script>
