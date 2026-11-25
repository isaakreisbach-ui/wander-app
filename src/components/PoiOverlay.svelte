<script lang="ts">
  // Wasserstellen und Hütten auf der Karte. Antippen öffnet ein Info-Fenster mit Öffnungszeiten.
  import type { GeoJSONSource, Map as MlMap, MapMouseEvent } from 'maplibre-gl';
  import { POI_LAYERS, showPoiPopup } from '../lib/poiPopup';
  import type * as GeoJSON from 'geojson';
  import { mapState, mapSettings, onStyleReady } from '../lib/map.svelte';
  import { planner } from '../lib/planner.svelte';
  import {
    poiState, loadCells, cellsForBbox, routeCells, poisAlongRoute, POI_STYLE, type PoiKind,
  } from '../lib/pois.svelte';

  const SRC = 'pois';

  // Symbole: Emoji auf farbigem Kreis, als Bild in die Karte gelegt
  function addIcons(map: MlMap) {
    for (const [kind, st] of Object.entries(POI_STYLE) as [PoiKind, (typeof POI_STYLE)[PoiKind]][]) {
      const id = `poi-${kind}`;
      if (map.hasImage(id)) continue;
      const size = 64;
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(32, 32, 28, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(32, 32, 24, 0, Math.PI * 2);
      ctx.fillStyle = st.color;
      ctx.fill();
      ctx.font = '28px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(st.emoji, 32, 34);
      map.addImage(id, ctx.getImageData(0, 0, size, size), { pixelRatio: 2 });
    }
  }

  const onRouteIds = $derived(new Set(poisAlongRoute(planner.route, planner.cum, poiState.pois).map((p) => p.id)));

  function data(): GeoJSON.FeatureCollection {
    return {
      type: 'FeatureCollection',
      features: poiState.pois.map((p) => ({
        type: 'Feature',
        properties: { id: p.id, kind: p.kind, name: p.name, onRoute: onRouteIds.has(p.id) },
        geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      })),
    };
  }

  onStyleReady((map) => {
    addIcons(map);
    if (!map.getSource(SRC)) map.addSource(SRC, { type: 'geojson', data: data() });
    const layout = (minLabelZoom: number) => ({
      'icon-image': ['concat', 'poi-', ['get', 'kind']],
      'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.75, 15, 1],
      'icon-allow-overlap': true,
      'text-field': ['step', ['zoom'], '', minLabelZoom, ['get', 'name']],
      'text-font': ['Noto Sans Regular'],
      'text-size': 11,
      'text-offset': [0, 1.3],
      'text-anchor': 'top',
      'text-optional': true,
      'text-max-width': 8,
    }) as any;
    const paint = { 'text-color': '#1c1c1e', 'text-halo-color': '#fff', 'text-halo-width': 1.5 };
    if (!map.getLayer('pois-food')) {
      map.addLayer({
        id: 'pois-food', type: 'symbol', source: SRC, minzoom: 14,
        filter: ['all', ['==', ['get', 'kind'], 'food'], ['!=', ['get', 'onRoute'], true]],
        layout: layout(15), paint,
      });
    }
    if (!map.getLayer('pois-main')) {
      map.addLayer({
        id: 'pois-main', type: 'symbol', source: SRC, minzoom: 11,
        filter: ['any', ['!=', ['get', 'kind'], 'food'], ['==', ['get', 'onRoute'], true]],
        layout: layout(14), paint,
      });
    }
    setVisible(map, mapSettings.pois);
  });

  function setVisible(map: MlMap, v: boolean) {
    for (const id of POI_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', v ? 'visible' : 'none');
  }

  $effect(() => {
    const d = data();
    (mapState.map?.getSource(SRC) as GeoJSONSource | undefined)?.setData(d);
  });
  $effect(() => {
    const v = mapSettings.pois;
    if (mapState.map) setVisible(mapState.map, v);
  });

  // Laden: sichtbarer Ausschnitt (ab Zoom 12) und entlang der geöffneten Route
  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    let t: ReturnType<typeof setTimeout>;
    const load = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        if (!mapSettings.pois || map.getZoom() < 12) return;
        const b = map.getBounds();
        const cells = cellsForBbox(b.getWest(), b.getSouth(), b.getEast(), b.getNorth());
        if (cells.length <= 16) loadCells(cells, 16);
      }, 500);
    };
    map.on('moveend', load);
    load();
    return () => { map.off('moveend', load); clearTimeout(t); };
  });
  $effect(() => {
    const r = planner.route;
    if (r.length > 1 && !planner.routing) loadCells(routeCells(r), 60);
  });

  $effect(() => {
    const map = mapState.map;
    if (!map) return;
    const click = (e: MapMouseEvent & { features?: { properties: { id: string } }[] }) => {
      const id = e.features?.[0]?.properties.id;
      const p = poiState.pois.find((x) => x.id === id);
      if (p) showPoiPopup(p);
    };
    const enter = () => (map.getCanvas().style.cursor = 'pointer');
    const leave = () => (map.getCanvas().style.cursor = '');
    for (const l of POI_LAYERS) {
      map.on('click', l, click as any);
      map.on('mouseenter', l, enter);
      map.on('mouseleave', l, leave);
    }
    return () => {
      for (const l of POI_LAYERS) {
        map.off('click', l, click as any);
        map.off('mouseenter', l, enter);
        map.off('mouseleave', l, leave);
      }
    };
  });
</script>

<style>
  :global(.maplibregl-popup-content) { border-radius: 14px; padding: 12px 14px; box-shadow: 0 6px 24px rgba(0, 0, 0, .2); font-family: -apple-system, system-ui, sans-serif; }
  :global(.maplibregl-popup-close-button) { font-size: 20px; width: 30px; height: 30px; color: #8e8e93; }
  :global(.pp-title) { font-weight: 650; font-size: 1rem; padding-right: 22px; }
  :global(.pp-sub) { color: #8e8e93; font-size: .82rem; margin-bottom: 4px; }
  :global(.pp-ok) { color: #248a3d; font-weight: 600; font-size: .88rem; }
  :global(.pp-bad) { color: #d70015; font-weight: 600; font-size: .88rem; }
  :global(.pp-warn) { color: #c96a00; font-weight: 600; font-size: .85rem; }
  :global(.pp-oh) { font-size: .85rem; margin: 4px 0; }
  :global(.pp-raw) { color: #8e8e93; font-size: .75rem; margin-top: 2px; }
  :global(.pp-links) { margin-top: 6px; font-size: .9rem; }
  :global(.pp-links a) { color: #007aff; font-weight: 500; text-decoration: none; }
  :global(.pp-note) { color: #8e8e93; font-size: .72rem; margin-top: 6px; }
</style>
