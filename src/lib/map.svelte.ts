// Karten-Zustand und Kartenquellen.
// Andere Teile der App (Planen, Aufzeichnen …) holen sich die Karte über `mapState.map`
// und registrieren ihre eigenen Ebenen mit `onStyleReady`, damit diese auch nach
// einem Wechsel der Grundkarte wieder erscheinen.

import type { Map as MlMap, StyleSpecification } from 'maplibre-gl';

export type BaseId = 'standard' | 'topo' | 'satellit';

export const BASES: { id: BaseId; label: string; hint: string }[] = [
  { id: 'standard', label: 'Standard', hint: 'OpenFreeMap – später auch offline' },
  { id: 'topo', label: 'Topo', hint: 'OpenTopoMap – mit Höhenlinien, nur online' },
  { id: 'satellit', label: 'Satellit', hint: 'Esri Luftbild – nur online' },
];

const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>-Mitwirkende';

export function styleFor(base: BaseId): string | StyleSpecification {
  if (base === 'standard') return 'https://tiles.openfreemap.org/styles/liberty';
  if (base === 'satellit') {
    // Esri World Imagery: nur online ansehen, kein Offline-Download (Nutzungsbedingungen)
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: {
        satellit: {
          type: 'raster',
          tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
          tileSize: 256,
          maxzoom: 18,
          attribution: 'Luftbild: © Esri, Maxar, Earthstar Geographics, GIS User Community',
        },
        // Wege und Gipfel aus OpenFreeMap über das Luftbild legen
        openmaptiles: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' },
      },
      layers: [{ id: 'satellit', type: 'raster', source: 'satellit' }],
    };
  }
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: {
      topo: {
        type: 'raster',
        tiles: ['a', 'b', 'c'].map((s) => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`),
        tileSize: 256,
        maxzoom: 17,
        attribution: `${OSM_ATTR}, SRTM | Darstellung: © <a href="https://opentopomap.org" target="_blank">OpenTopoMap</a> (CC-BY-SA)`,
      },
    },
    layers: [{ id: 'topo', type: 'raster', source: 'topo' }],
  };
}

const TRAILS_SOURCE = 'trails';
const TRAILS_LAYER = 'trails';

export function addTrailsOverlay(map: MlMap, visible: boolean) {
  if (!map.getSource(TRAILS_SOURCE)) {
    map.addSource(TRAILS_SOURCE, {
      type: 'raster',
      tiles: ['https://tile.waymarkedtrails.org/hiking/{z}/{x}/{y}.png'],
      tileSize: 256,
      maxzoom: 17,
      attribution: 'Wanderwege: © <a href="https://hiking.waymarkedtrails.org" target="_blank">Waymarked Trails</a>',
    });
  }
  if (!map.getLayer(TRAILS_LAYER)) {
    map.addLayer({
      id: TRAILS_LAYER,
      type: 'raster',
      source: TRAILS_SOURCE,
      paint: { 'raster-opacity': 0.85 },
      layout: { visibility: visible ? 'visible' : 'none' },
    });
  }
}

export function setTrailsVisible(map: MlMap, visible: boolean) {
  if (map.getLayer(TRAILS_LAYER)) map.setLayoutProperty(TRAILS_LAYER, 'visibility', visible ? 'visible' : 'none');
}

/** Id der Ebene direkt über `id` (um eine eigene Ebene genau darüber einzuschieben) */
function nextLayerAfter(map: MlMap, id: string): string | undefined {
  const layers = map.getStyle().layers ?? [];
  const i = layers.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < layers.length ? layers[i + 1].id : undefined;
}

/**
 * Anpassungen an der Standard-Karte (OpenFreeMap „Liberty“) für Wanderer:
 * Straßennamen und Straßennummern ausblenden, Gipfel mit Namen und Höhe einblenden.
 */
export function adjustStandardStyle(map: MlMap) {
  if (!map.getSource('openmaptiles')) return;
  const sat = !!map.getSource('satellit');
  for (const layer of map.getStyle().layers ?? []) {
    if ('source-layer' in layer && layer['source-layer'] === 'transportation_name') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
  // Wanderkarten-Look: Pfade rotbraun gestrichelt, Feld-/Forstwege braun gestrichelt
  const width = ['interpolate', ['linear'], ['zoom'], 12, 1, 14, 1.8, 16, 2.6, 18, 4] as unknown as number;
  for (const id of ['road_path_pedestrian', 'bridge_path_pedestrian', 'tunnel_path_pedestrian']) {
    if (!map.getLayer(id)) continue;
    map.setPaintProperty(id, 'line-color', '#b5442b');
    map.setPaintProperty(id, 'line-width', width);
    map.setPaintProperty(id, 'line-dasharray', [2, 1.2]);
    map.setPaintProperty(id, 'line-opacity', 0.95);
  }
  if (!map.getLayer('hike-tracks') && map.getLayer('road_service_track')) {
    map.addLayer({
      id: 'hike-tracks', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12,
      filter: ['all', ['==', ['get', 'class'], 'track'], ['match', ['get', 'brunnel'], ['tunnel'], false, true]],
      layout: { 'line-join': 'round' },
      paint: { 'line-color': '#8a6a3b', 'line-width': width as never, 'line-dasharray': [3, 1.5] },
    }, nextLayerAfter(map, 'road_service_track'));
  }

  // Satellit: eigene gestrichelte Wege (hell, damit man sie auf dem Luftbild sieht)
  if (sat && !map.getLayer('sat-paths')) {
    const base = { type: 'line' as const, source: 'openmaptiles', 'source-layer': 'transportation', minzoom: 12, layout: { 'line-join': 'round' as const } };
    map.addLayer({ ...base, id: 'sat-casing', filter: ['match', ['get', 'class'], ['path', 'pedestrian', 'track'], true, false],
      paint: { 'line-color': '#000', 'line-opacity': 0.35, 'line-width': ['interpolate', ['linear'], ['zoom'], 12, 2.5, 16, 5.5] } });
    map.addLayer({ ...base, id: 'sat-tracks', filter: ['==', ['get', 'class'], 'track'],
      paint: { 'line-color': '#ffffff', 'line-width': width, 'line-dasharray': [3, 1.5] } });
    map.addLayer({ ...base, id: 'sat-paths', filter: ['match', ['get', 'class'], ['path', 'pedestrian'], true, false],
      paint: { 'line-color': '#ffd166', 'line-width': width, 'line-dasharray': [2, 1.2] } });
  }

  if (map.getLayer('peaks-label')) return;
  // Gipfelkreuz als Symbol
  if (!map.hasImage('peak-cross')) {
    const c = document.createElement('canvas');
    c.width = c.height = 44;
    const g = c.getContext('2d')!;
    const cross = (color: string, w: number) => {
      g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round';
      g.beginPath(); g.moveTo(22, 6); g.lineTo(22, 40); g.moveTo(12, 15); g.lineTo(32, 15); g.stroke();
    };
    cross(sat ? '#000' : '#fff', 9);
    cross(sat ? '#fff' : '#2b2118', 4);
    map.addImage('peak-cross', g.getImageData(0, 0, 44, 44), { pixelRatio: 2 });
  }
  map.addLayer({
    id: 'peaks-dot',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'mountain_peak',
    minzoom: 11,
    filter: ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]],
    layout: { 'icon-image': 'peak-cross', 'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.7, 15, 1.1], 'icon-allow-overlap': true, 'icon-anchor': 'bottom' },
  });
  map.addLayer({
    id: 'peaks-label',
    type: 'symbol',
    source: 'openmaptiles',
    'source-layer': 'mountain_peak',
    minzoom: 10,
    filter: ['all', ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]], ['has', 'name']],
    layout: {
      'text-field': [
        'case',
        ['has', 'ele'],
        ['format', ['coalesce', ['get', 'name:de'], ['get', 'name']], {}, '\n', {}, ['concat', ['to-string', ['get', 'ele']], ' m'], { 'font-scale': 0.85 }],
        ['coalesce', ['get', 'name:de'], ['get', 'name']],
      ],
      'text-font': ['Noto Sans Bold'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 10, 11, 15, 14],
      'text-anchor': 'top',
      'text-offset': [0, 0.4],
      'text-max-width': 9,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
    },
    paint: sat
      ? { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.85)', 'text-halo-width': 1.8 }
      : { 'text-color': '#4a2f17', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
  });
}

// ---------- gespeicherte Einstellungen ----------

const KEY = 'wander.map.v1';
type Saved = { base: BaseId; trails: boolean; pois: boolean; diffColors: boolean; center: [number, number]; zoom: number; pathsV2?: boolean };

const DEFAULTS: Saved = {
  base: 'standard',
  trails: false,
  pathsV2: true,
  pois: true,
  diffColors: false,
  center: [8.4573, 50.2324], // Großer Feldberg
  zoom: 12,
};

function load(): Saved {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    // Einmalig: neue gestrichelte Wege – die bunte Wanderwege-Ebene standardmäßig aus
    if (!saved.pathsV2) { saved.trails = false; saved.pathsV2 = true; }
    return { ...DEFAULTS, ...saved };
  } catch {
    return DEFAULTS;
  }
}

export const mapSettings = $state<Saved>(load());

export function saveMapSettings() {
  localStorage.setItem(KEY, JSON.stringify(mapSettings));
}

// ---------- gemeinsame Karteninstanz ----------

export const mapState = $state<{ map: MlMap | null }>({ map: null });

const styleHooks: ((map: MlMap) => void)[] = [];

/** Wird bei jedem (Neu-)Laden des Kartenstils aufgerufen – hier eigene Ebenen hinzufügen. */
export function onStyleReady(fn: (map: MlMap) => void) {
  styleHooks.push(fn);
  const m = mapState.map;
  if (m && m.isStyleLoaded()) fn(m);
}

export function runStyleHooks(map: MlMap) {
  for (const fn of styleHooks) fn(map);
}
