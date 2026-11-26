<script lang="ts">
  // Alle gespeicherten Touren auf der Karte (Tourenbuch): gelaufen orange, geplant grau gestrichelt.
  import type { GeoJSONSource } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { liveQuery } from 'dexie';
  import { db, type Tour } from '../lib/db';
  import { mapState, onStyleReady } from '../lib/map.svelte';
  import { journal } from '../lib/journal.svelte';
  import { openTour } from '../lib/tours';

  const SRC = 'all-tours';
  let tours = $state.raw<Tour[]>([]);

  $effect(() => {
    if (!journal.showAll) return;
    const sub = liveQuery(() => db.tours.toArray()).subscribe({ next: (v) => (tours = v) });
    return () => sub.unsubscribe();
  });

  function data(): GeoJSON.FeatureCollection {
    const list = journal.showAll ? tours.filter((t) => t.route.length > 1) : [];
    return {
      type: 'FeatureCollection',
      features: [
        ...list.map((t): GeoJSON.Feature => ({
          type: 'Feature', properties: { id: t.id, walked: t.kind === 'track', name: t.name },
          // für die Übersicht ausdünnen
          geometry: { type: 'LineString', coordinates: t.route.filter((_, i) => i % 3 === 0 || i === t.route.length - 1).map((p) => [p[0], p[1]]) },
        })),
        // Startpunkte – damit man die Touren auch weit herausgezoomt sieht
        ...list.map((t): GeoJSON.Feature => ({
          type: 'Feature', properties: { id: t.id, walked: t.kind === 'track', name: t.name },
          geometry: { type: 'Point', coordinates: [t.route[0][0], t.route[0][1]] },
        })),
      ],
    };
  }

  onStyleReady((map) => {
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    if (!map.getLayer('all-tours-plan')) {
      map.addLayer({ id: 'all-tours-start', type: 'circle', source: SRC, maxzoom: 11, filter: ['==', ['geometry-type'], 'Point'],
        paint: { 'circle-radius': 6, 'circle-color': ['case', ['get', 'walked'], '#ff9f0a', '#aeaeb2'], 'circle-stroke-color': '#1c1c1e', 'circle-stroke-width': 2 } });
      map.addLayer({ id: 'all-tours-plan', type: 'line', source: SRC, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['!', ['get', 'walked']]],
        layout: { 'line-join': 'round' },
        paint: { 'line-color': '#aeaeb2', 'line-width': 2.5, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } });
      map.addLayer({ id: 'all-tours-walked', type: 'line', source: SRC, filter: ['all', ['==', ['geometry-type'], 'LineString'], ['get', 'walked']],
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': '#ff9f0a', 'line-width': 3.5, 'line-opacity': 0.9 } });
      for (const id of ['all-tours-start', 'all-tours-plan', 'all-tours-walked']) {
        map.on('click', id, (e) => {
          const tid = e.features?.[0]?.properties?.id;
          const t = tours.find((x) => x.id === tid);
          if (t) { journal.showAll = false; openTour(t); }
        });
        map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''));
      }
    }
  });

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });
</script>
