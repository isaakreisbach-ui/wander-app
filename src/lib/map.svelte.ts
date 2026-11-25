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

/**
 * Anpassungen an der Standard-Karte (OpenFreeMap „Liberty“) für Wanderer:
 * Straßennamen und Straßennummern ausblenden, Gipfel mit Namen und Höhe einblenden.
 */
export function adjustStandardStyle(map: MlMap) {
  if (!map.getSource('openmaptiles')) return;
  for (const layer of map.getStyle().layers ?? []) {
    if ('source-layer' in layer && layer['source-layer'] === 'transportation_name') {
      map.setLayoutProperty(layer.id, 'visibility', 'none');
    }
  }
  if (map.getLayer('peaks-label')) return;
  map.addLayer({
    id: 'peaks-dot',
    type: 'circle',
    source: 'openmaptiles',
    'source-layer': 'mountain_peak',
    minzoom: 10,
    filter: ['in', ['get', 'class'], ['literal', ['peak', 'volcano']]],
    paint: {
      'circle-radius': 3.5,
      'circle-color': '#6b4a2b',
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1.5,
    },
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
      'text-offset': [0, 0.5],
      'text-max-width': 9,
      'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
    },
    paint: {
      'text-color': '#4a2f17',
      'text-halo-color': '#ffffff',
      'text-halo-width': 1.6,
    },
  });
}

// ---------- gespeicherte Einstellungen ----------

const KEY = 'wander.map.v1';
type Saved = { base: BaseId; trails: boolean; center: [number, number]; zoom: number };

const DEFAULTS: Saved = {
  base: 'standard',
  trails: true,
  center: [8.4573, 50.2324], // Großer Feldberg
  zoom: 12,
};

function load(): Saved {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
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
