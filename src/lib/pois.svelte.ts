// Wasserstellen und Einkehrmöglichkeiten aus OpenStreetMap (Overpass-API, kostenlos, ohne Key).
// Geladen wird in Kacheln von 0,05° (ca. 5 × 3,5 km); jede Kachel wird im Gerät gespeichert,
// damit die Punkte auch offline sichtbar bleiben.
//
// Ehrlich: Speisekarten und Preise gibt es in OpenStreetMap nicht. Wenn eingetragen, verlinken wir
// Webseite oder Speisekarte. Öffnungszeiten sind von Freiwilligen gepflegt und nicht immer aktuell.

import { distance, type Pt } from './geo';

export type PoiKind = 'water' | 'hut' | 'food' | 'shelter';

export type Poi = {
  id: string;
  kind: PoiKind;
  lng: number;
  lat: number;
  name: string;
  /** z. B. „Trinkwasser“, „Quelle“, „Berghütte“, „Restaurant“ */
  label: string;
  drink: 'yes' | 'no' | 'unknown' | null;
  seasonal?: string;
  openingHours?: string;
  website?: string;
  menu?: string;
  phone?: string;
  ele?: number;
};

const CELL = 0.05;
const CACHE_PREFIX = 'wander.poi.v1.';
const FRESH_MS = 7 * 24 * 3600 * 1000;
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];

export const poiState = $state<{ pois: Poi[]; loading: number; error: string | null }>({ pois: [], loading: 0, error: null });
const loadedCells = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// ---------- Kacheln ----------

const cellKey = (cx: number, cy: number) => `${cx}_${cy}`;

export function cellsForBbox(w: number, s: number, e: number, n: number): string[] {
  const out: string[] = [];
  for (let cx = Math.floor(w / CELL); cx <= Math.floor(e / CELL); cx++)
    for (let cy = Math.floor(s / CELL); cy <= Math.floor(n / CELL); cy++) out.push(cellKey(cx, cy));
  return out;
}

function cellBbox(key: string) {
  const [cx, cy] = key.split('_').map(Number);
  return { w: cx * CELL, s: cy * CELL, e: (cx + 1) * CELL, n: (cy + 1) * CELL };
}

/** Kacheln laden (aus dem Speicher oder per Overpass). Höchstens `max` Kacheln auf einmal. */
export async function loadCells(keys: string[], max = 40) {
  const todo = keys.filter((k) => !loadedCells.has(k)).slice(0, max);
  if (!todo.length) return;

  // erst aus dem Gerätespeicher
  const stale: string[] = [];
  for (const k of todo) {
    const c = readCache(k);
    if (c) {
      addPois(c.pois);
      loadedCells.add(k);
      if (Date.now() - c.t > FRESH_MS && navigator.onLine) stale.push(k);
    } else stale.push(k);
  }
  if (!stale.length || !navigator.onLine) return;

  // dann übers Netz (höchstens 2 gleichzeitig – Fair Use)
  const queue = [...stale];
  const worker = async () => {
    for (let k = queue.shift(); k; k = queue.shift()) {
      if (inflight.has(k)) { await inflight.get(k); continue; }
      const p = fetchCell(k).finally(() => inflight.delete(k));
      inflight.set(k, p);
      await p;
    }
  };
  await Promise.all([worker(), worker()]);
}

async function fetchCell(key: string) {
  const { w, s, e, n } = cellBbox(key);
  const bb = `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
  const q = `[out:json][timeout:25];(` +
    `nwr["amenity"="drinking_water"]${bb};nwr["natural"="spring"]${bb};nwr["man_made"="water_tap"]${bb};` +
    `nwr["amenity"="water_point"]${bb};nwr["amenity"="fountain"]["drinking_water"="yes"]${bb};` +
    `nwr["tourism"~"^(alpine_hut|wilderness_hut)$"]${bb};nwr["amenity"~"^(restaurant|cafe|biergarten|pub)$"]${bb};` +
    `nwr["amenity"="shelter"]["shelter_type"~"^(basic_hut|weather_shelter|lean_to)$"]${bb};` +
    `);out center tags;`;
  poiState.loading++;
  try {
    let data: { elements: OsmEl[] } | null = null;
    for (const ep of ENDPOINTS) {
      try {
        const res = await fetch(`${ep}?data=${encodeURIComponent(q)}`);
        if (res.ok) { data = await res.json(); break; }
      } catch { /* nächster Server */ }
    }
    if (!data) throw new Error('OpenStreetMap-Server gerade nicht erreichbar');
    const pois = data.elements.map(toPoi).filter((p): p is Poi => !!p);
    try { localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), pois })); } catch { /* voll */ }
    addPois(pois);
    loadedCells.add(key);
    poiState.error = null;
  } catch (err) {
    poiState.error = (err as Error).message;
  } finally {
    poiState.loading--;
  }
}

function readCache(key: string): { t: number; pois: Poi[] } | null {
  try { return JSON.parse(localStorage.getItem(CACHE_PREFIX + key) || 'null'); } catch { return null; }
}

function addPois(list: Poi[]) {
  const known = new Set(poiState.pois.map((p) => p.id));
  const fresh = list.filter((p) => !known.has(p.id));
  if (fresh.length) poiState.pois = [...poiState.pois, ...fresh];
}

// ---------- OSM-Daten deuten ----------

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

function toPoi(el: OsmEl): Poi | null {
  const t = el.tags ?? {};
  const lat = el.lat ?? el.center?.lat, lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined) return null;
  const base = {
    id: `${el.type}${el.id}`, lng, lat,
    openingHours: t.opening_hours, website: t.website ?? t['contact:website'] ?? t.url,
    menu: t['website:menu'] ?? t['menu:url'] ?? t.menu, phone: t.phone ?? t['contact:phone'],
    ele: t.ele ? Math.round(parseFloat(t.ele)) : undefined, seasonal: t.seasonal,
  };
  const dw = t.drinking_water;
  const drink: Poi['drink'] = dw === 'yes' || dw === 'treated' ? 'yes' : dw === 'no' ? 'no' : null;

  if (t.amenity === 'drinking_water') return { ...base, kind: 'water', name: t.name ?? 'Trinkwasser', label: 'Trinkwasser', drink: drink ?? 'yes' };
  if (t.amenity === 'fountain') return { ...base, kind: 'water', name: t.name ?? 'Trinkbrunnen', label: 'Trinkbrunnen', drink: 'yes' };
  if (t.man_made === 'water_tap') return { ...base, kind: 'water', name: t.name ?? 'Wasserhahn', label: 'Wasserhahn', drink: drink ?? 'unknown' };
  if (t.amenity === 'water_point') return { ...base, kind: 'water', name: t.name ?? 'Wasserstelle', label: 'Wasserstelle', drink: drink ?? 'unknown' };
  if (t.natural === 'spring') return { ...base, kind: 'water', name: t.name ?? 'Quelle', label: 'Quelle', drink: drink ?? 'unknown' };
  if (t.tourism === 'alpine_hut') return { ...base, kind: 'hut', name: t.name ?? 'Berghütte', label: 'Bewirtschaftete Hütte', drink: null };
  if (t.tourism === 'wilderness_hut') return { ...base, kind: 'shelter', name: t.name ?? 'Selbstversorgerhütte', label: 'Unbewirtschaftete Hütte', drink: null };
  if (t.amenity === 'shelter') return { ...base, kind: 'shelter', name: t.name ?? 'Schutzhütte', label: 'Schutzhütte', drink: null };
  const food: Record<string, string> = { restaurant: 'Restaurant', cafe: 'Café', biergarten: 'Biergarten', pub: 'Gaststätte' };
  if (t.amenity && food[t.amenity]) {
    const hutLike = /hütte|baude|alm|hutte|rifugio|malga|baita/i.test(t.name ?? '');
    return { ...base, kind: hutLike ? 'hut' : 'food', name: t.name ?? food[t.amenity], label: hutLike ? 'Hütte / Einkehr' : food[t.amenity], drink: null };
  }
  return null;
}

// ---------- entlang der Route ----------

export type RoutePoi = Poi & { km: number; off: number };

/** POIs in der Nähe der Route mit Kilometer-Angabe, sortiert nach Reihenfolge */
export function poisAlongRoute(route: Pt[], cum: number[], pois: Poi[], maxOff = 300): RoutePoi[] {
  if (route.length < 2) return [];
  // grobe Vorauswahl über die Box der Route
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of route) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  const pad = 0.006;
  const step = Math.max(1, Math.floor(route.length / 600));
  const out: RoutePoi[] = [];
  for (const poi of pois) {
    if (poi.lng < w - pad || poi.lng > e + pad || poi.lat < s - pad || poi.lat > n + pad) continue;
    let best = Infinity, bi = 0;
    for (let i = 0; i < route.length; i += step) {
      const d = distance([poi.lng, poi.lat], route[i]);
      if (d < best) { best = d; bi = i; }
    }
    const limit = poi.kind === 'food' ? Math.min(maxOff, 200) : maxOff;
    if (best <= limit) out.push({ ...poi, km: cum[bi] / 1000, off: Math.round(best) });
  }
  return out.sort((a, b) => a.km - b.km);
}

export function routeCells(route: Pt[]): string[] {
  const keys = new Set<string>();
  const step = Math.max(1, Math.floor(route.length / 300));
  for (let i = 0; i < route.length; i += step) {
    const p = route[i];
    for (const k of cellsForBbox(p[0] - 0.004, p[1] - 0.003, p[0] + 0.004, p[1] + 0.003)) keys.add(k);
  }
  return [...keys];
}

// ---------- Öffnungszeiten ----------

export type OpenInfo = { open: boolean | null; text: string };

function guessRegion(lat: number, lng: number): { country_code: string; state: string } | null {
  if (lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1) {
    const state = lat > 49.4 && lat < 51.7 && lng > 7.7 && lng < 10.3 ? 'Hessen' : '';
    return { country_code: 'de', state };
  }
  if (lat > 46.2 && lat < 47.1 && lng > 10.3 && lng < 12.5) return { country_code: 'it', state: 'Trentino-Alto Adige' };
  if (lat > 46.3 && lat < 49.1 && lng > 9.5 && lng < 17.2) return { country_code: 'at', state: '' };
  return null;
}

const fmt = (d: Date) => d.toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit' });

/** Ist geöffnet? – zum Zeitpunkt `at` (Standard: jetzt) */
export async function openingInfo(poi: Poi, at = new Date()): Promise<OpenInfo | null> {
  if (!poi.openingHours) return null;
  try {
    const mod = await import('opening_hours');
    const OH = (mod as unknown as { default: new (...a: unknown[]) => any }).default;
    const region = guessRegion(poi.lat, poi.lng);
    const nominatim = region ? { lat: poi.lat, lon: poi.lng, address: region } : null;
    const oh = new OH(poi.openingHours, nominatim, { locale: 'de' });
    const open: boolean = oh.getState(at);
    const next: Date | undefined = oh.getNextChange(at);
    const now = Math.abs(at.getTime() - Date.now()) < 60_000;
    const when = now ? 'Jetzt' : at.toLocaleDateString('de-DE', { weekday: 'long' });
    if (open) return { open: true, text: `${when} geöffnet${next ? ` · bis ${fmt(next)}` : ''}` };
    return { open: false, text: `${when} geschlossen${next ? ` · öffnet ${fmt(next)}` : ''}` };
  } catch {
    return { open: null, text: poi.openingHours };
  }
}

export const POI_STYLE: Record<PoiKind, { emoji: string; color: string; name: string }> = {
  water: { emoji: '💧', color: '#0a84ff', name: 'Wasser' },
  hut: { emoji: '🏠', color: '#a2541c', name: 'Hütte' },
  food: { emoji: '🍽️', color: '#ff9500', name: 'Einkehr' },
  shelter: { emoji: '🛖', color: '#8e8e93', name: 'Schutzhütte' },
};
