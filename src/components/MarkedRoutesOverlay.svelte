<script lang="ts">
  // Markierte Wanderrouten (OpenStreetMap, route=hiking) selbst zeichnen – gestrichelt statt bunt.
  // Geladen ab Zoom 12 in Kacheln à 0,05°, im Speicher gehalten.
  import type { GeoJSONSource, Map as MlMap } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, mapSettings, onStyleReady } from '../lib/map.svelte';
  import { cellElements } from '../lib/cellcache';
  import { cellsForBbox } from '../lib/pois.svelte';

  const SRC = 'marked-routes';
  const loaded = new Set<string>();
  const loading = new Set<string>();
  const features = new Map<string, GeoJSON.Feature>(); // je Weg-Stück (Relation+Way) nur einmal
  let version = $state(0);

  function data(): GeoJSON.FeatureCollection {
    version; // neu zeichnen, wenn Daten dazukommen
    return { type: 'FeatureCollection', features: [...features.values()] };
  }

  async function loadCell(key: string) {
    if (loaded.has(key) || loading.has(key)) return;
    loading.add(key);
    try {
      const els = await cellElements('routes', key);
      if (!els) return;
      for (const r of els) {
        const ref = r.tags?.ref || r.tags?.['osmc:name'] || (r.tags?.name ?? '').slice(0, 14);
        for (const m of r.members ?? []) {
          if (m.type !== 'way' || !m.geometry?.length) continue;
          const k = `${r.id}:${m.ref}`;
          if (features.has(k)) continue;
          features.set(k, {
            type: 'Feature', properties: { ref },
            geometry: { type: 'LineString', coordinates: m.geometry.map((g) => [g.lon, g.lat]) },
          });
        }
      }
      loaded.add(key);
      version++;
    } catch { /* später erneut versuchen */ } finally {
      loading.delete(key);
    }
  }

  function setVisible(map: MlMap, v: boolean) {
    for (const id of ['marked-casing', 'marked-line', 'marked-ref']) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
  }

  onStyleReady((map) => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('marked-line')) {
      map.addLayer({ id: 'marked-casing', type: 'line', source: SRC, minzoom: 11,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ffffff', 'line-opacity': 0.75, 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 3, 16, 7] } });
      map.addLayer({ id: 'marked-line', type: 'line', source: SRC, minzoom: 11,
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#c0262d', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.6, 16, 3.6], 'line-dasharray': [2.5, 1.4] } });
      map.addLayer({ id: 'marked-ref', type: 'symbol', source: SRC, minzoom: 13,
        layout: {
          'symbol-placement': 'line', 'symbol-spacing': 260, 'text-field': ['get', 'ref'],
          'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-keep-upright': true,
        },
        paint: { 'text-color': '#c0262d', 'text-halo-color': '#ffffff', 'text-halo-width': 2 } });
    }
    setVisible(map, mapSettings.trails);
  });

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });
  $effect(() => {
    const v = mapSettings.trails;
    if (mapState.map) setVisible(mapState.map, v);
  });

  // Nachladen für den sichtbaren Ausschnitt
  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    let t: ReturnType<typeof setTimeout>;
    const load = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!mapSettings.trails || map.getZoom() < 12) return;
        const b = map.getBounds();
        const cells = cellsForBbox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        if (cells.length <= 12) cells.forEach((c) => loadCell(c));
      }, 600);
    };
    map.on('moveend', load);
    load();
    return () => { map.off('moveend', load); clearTimeout(t); };
  });
  // Beim Einschalten nachladen – außerhalb des Effekts auslösen, sonst schaukelt es sich auf
  $effect(() => {
    if (!mapSettings.trails) return;
    const map = mapState.map;
    setTimeout(() => map?.fire('moveend'), 0);
  });
</script>
