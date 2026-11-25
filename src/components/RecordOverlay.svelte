<script lang="ts">
  // Zeigt die laufende Aufzeichnung (Spur) und die eigene Position; die Karte folgt dabei.
  import type { GeoJSONSource } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, onStyleReady } from '../lib/map.svelte';
  import { recorder } from '../lib/recorder.svelte';
  import { recUi } from '../lib/recui.svelte';

  const TRACK = 'rec-track';
  const POS = 'rec-pos';

  function trackData(): GeoJSON.FeatureCollection {
    // Je Abschnitt (zwischen Pausen) eine Linie
    const segs = new Map<number, number[][]>();
    for (const p of recorder.points) {
      if (!segs.has(p.seg)) segs.set(p.seg, []);
      segs.get(p.seg)!.push([p.lng, p.lat]);
    }
    return {
      type: 'FeatureCollection',
      features: [...segs.values()].filter((c) => c.length > 1).map((coordinates) => ({
        type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates },
      })),
    };
  }

  function posData(): GeoJSON.FeatureCollection {
    const p = recorder.position;
    return {
      type: 'FeatureCollection',
      features: p ? [{ type: 'Feature', properties: { acc: recorder.accuracy ?? 0 }, geometry: { type: 'Point', coordinates: p } }] : [],
    };
  }

  onStyleReady((map) => {
    if (!map.getSource(TRACK)) map.addSource(TRACK, { type: 'geojson', data: trackData() });
    if (!map.getSource(POS)) map.addSource(POS, { type: 'geojson', data: posData() });
    if (!map.getLayer('rec-track-casing')) {
      map.addLayer({
        id: 'rec-track-casing', type: 'line', source: TRACK,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 8 },
      });
      map.addLayer({
        id: 'rec-track', type: 'line', source: TRACK,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#1565c0', 'line-width': 4.5 },
      });
      // Genauigkeitskreis (Radius in Metern → Pixel je nach Zoom)
      map.addLayer({
        id: 'rec-pos-acc', type: 'circle', source: POS,
        paint: {
          'circle-radius': ['interpolate', ['exponential', 2], ['zoom'],
            10, ['/', ['get', 'acc'], 76], 20, ['/', ['get', 'acc'], 0.075]],
          'circle-color': '#1e88e5', 'circle-opacity': 0.15,
        },
      });
      map.addLayer({
        id: 'rec-pos-dot', type: 'circle', source: POS,
        paint: { 'circle-radius': 9, 'circle-color': '#1e88e5', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 3 },
      });
    }
  });

  $effect(() => {
    const d = trackData();
    (mapState.map?.getSource(TRACK) as GeoJSONSource | undefined)?.setData(d);
  });

  $effect(() => {
    const d = posData();
    const map = mapState.map;
    (map?.getSource(POS) as GeoJSONSource | undefined)?.setData(d);
    // Karte folgt der Position, solange „Folgen“ an ist
    const p = recorder.position;
    if (map && p && recUi.follow && recorder.status === 'recording') {
      map.easeTo({ center: p, zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
  });

  // Wer die Karte selbst verschiebt, schaltet das Folgen aus
  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    const off = (e: { originalEvent?: Event }) => { if (e.originalEvent) recUi.follow = false; };
    map.on('dragstart', off);
    return () => { map.off('dragstart', off); };
  });
</script>
