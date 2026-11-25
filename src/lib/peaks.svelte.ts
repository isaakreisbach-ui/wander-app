// Gipfel-Vorschläge: Rund um einen Gipfel Startpunkte suchen (Parkplätze, Haltestellen, Bahnhöfe,
// Orte aus OpenStreetMap), je Himmelsrichtung den besten wählen und die Route dorthin mit BRouter
// berechnen. Dazu Links für die Anreise mit Auto oder Öffis (Apple/Google Karten).

import { overpass, type OsmEl } from './overpass';
import { routeSegment } from './routing';
import { distance, cumulative, climb, walkingTimeHours, difficulty, maxGrade, type Pt, type Difficulty } from './geo';

export type Peak = { name: string; lng: number; lat: number; ele?: number };

export type StartKind = 'parking' | 'bus' | 'rail' | 'place';
export type StartPoint = { id: string; kind: StartKind; name: string; lng: number; lat: number; dist: number; dir: string };

export type Suggestion = {
  start: StartPoint;
  route: Pt[];
  meters: number;
  up: number;
  down: number;
  hoursUp: number;
  hoursRound: number;
  difficulty: Difficulty;
  /** nächste Haltestelle am Startpunkt (für die Öffi-Anreise) */
  transit: { name: string; lng: number; lat: number; dist: number } | null;
};

export const peakState = $state<{
  peak: Peak | null;
  status: 'idle' | 'searching' | 'routing' | 'done' | 'error';
  message: string;
  suggestions: Suggestion[];
  selected: number | null;
}>({ peak: null, status: 'idle', message: '', suggestions: [], selected: null });

const KIND_RANK: Record<StartKind, number> = { parking: 3, rail: 3, bus: 2, place: 1 };
const DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
let abort: AbortController | null = null;

function bearingDeg(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

function kindOf(t: Record<string, string>): StartKind | null {
  if (t.amenity === 'parking') return 'parking';
  if (t.railway === 'station' || t.railway === 'halt') return 'rail';
  if (t.highway === 'bus_stop' || t.public_transport === 'platform') return 'bus';
  if (t.place) return 'place';
  return null;
}

/** Zweisprachige Südtiroler Namen („Sankt Jakob - San Giacomo“) auf den deutschen Teil kürzen */
const shortName = (n: string) => n.split(/ - | \/ /)[0].trim();

export function closePeak() {
  abort?.abort();
  peakState.peak = null;
  peakState.status = 'idle';
  peakState.suggestions = [];
  peakState.selected = null;
}

export async function openPeak(peak: Peak) {
  abort?.abort();
  const ctrl = (abort = new AbortController());
  Object.assign(peakState, { peak, status: 'searching', message: 'Suche Startpunkte …', suggestions: [], selected: null });
  if (!navigator.onLine) {
    Object.assign(peakState, { status: 'error', message: 'Für Routen-Vorschläge wird Internet benötigt.' });
    return;
  }
  try {
    const { lat, lng } = peak;
    const R = 7000;
    const els = await overpass(
      `[out:json][timeout:25];(` +
      `nwr["amenity"="parking"]["access"!~"private|no"](around:${R},${lat},${lng});` +
      `node["highway"="bus_stop"](around:${R},${lat},${lng});` +
      `node["railway"~"^(station|halt)$"](around:${R + 2000},${lat},${lng});` +
      `node["place"~"^(village|hamlet)$"](around:${R},${lat},${lng});` +
      `);out center tags;`,
      ctrl.signal,
    );
    const all = els.map((e: OsmEl) => {
      const t = e.tags ?? {};
      const k = kindOf(t);
      const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
      if (!k || la === undefined || lo === undefined) return null;
      const d = distance([lng, lat], [lo, la]);
      return { id: `${e.type}${e.id}`, kind: k, rawName: t.name ? shortName(t.name) : '', lng: lo, lat: la, dist: d, dir: DIRS[Math.round(bearingDeg([lng, lat], [lo, la]) / 45) % 8] };
    }).filter((x): x is NonNullable<typeof x> => !!x && x.dist > 1200);

    const named = all.filter((x) => x.rawName && (x.kind === 'place' || x.kind === 'bus' || x.kind === 'rail'));
    // Namenlose Parkplätze nach dem nächsten Ort/der nächsten Haltestelle benennen (nur wenn wirklich nah)
    const nearestName = (p: { lng: number; lat: number }) => {
      let best = '', bd = Infinity;
      for (const n of named) { const d = distance([p.lng, p.lat], [n.lng, n.lat]); if (d < bd) { bd = d; best = n.rawName.split(',')[0]; } }
      return bd < 2500 ? best : '';
    };
    const DIR_NAME: Record<string, string> = { N: 'Nord', NO: 'Nordost', O: 'Ost', SO: 'Südost', S: 'Süd', SW: 'Südwest', W: 'West', NW: 'Nordwest' };
    const cands: StartPoint[] = all.map((x) => {
      const near = x.kind === 'parking' && !x.rawName ? nearestName(x) : '';
      return {
        id: x.id, kind: x.kind, lng: x.lng, lat: x.lat, dist: x.dist, dir: x.dir,
        name: x.rawName || (x.kind === 'parking' ? (near ? `Parkplatz bei ${near}` : `Parkplatz (${DIR_NAME[x.dir]})`) : 'Startpunkt'),
      };
    });

    // Je Himmelsrichtung den besten Startpunkt: wichtigere Art zuerst, dann der nächstgelegene
    const bySector = new Map<string, StartPoint>();
    for (const c of cands) {
      const cur = bySector.get(c.dir);
      if (!cur || KIND_RANK[c.kind] > KIND_RANK[cur.kind] || (KIND_RANK[c.kind] === KIND_RANK[cur.kind] && c.dist < cur.dist)) bySector.set(c.dir, c);
    }
    const picks = [...bySector.values()].sort((a, b) => a.dist - b.dist).slice(0, 5);
    if (!picks.length) throw new Error('Rund um diesen Gipfel sind keine Parkplätze, Haltestellen oder Orte eingetragen.');

    const stops = cands.filter((c) => c.kind === 'bus' || c.kind === 'rail');
    Object.assign(peakState, { status: 'routing', message: `Berechne ${picks.length} Routen …` });

    const results: Suggestion[] = [];
    for (const s of picks) {
      if (ctrl.signal.aborted) return;
      try {
        const route = await routeSegment([s.lng, s.lat], [peak.lng, peak.lat], ctrl.signal);
        const cum = cumulative(route);
        const meters = cum[cum.length - 1];
        if (meters > 20000) continue; // zu weit für einen sinnvollen Zustieg
        const { up, down } = climb(route);
        const hoursUp = walkingTimeHours(meters, up, down);
        const hoursRound = walkingTimeHours(meters * 2, up + down, down + up);
        let transit: Suggestion['transit'] = null;
        if (s.kind === 'bus' || s.kind === 'rail') transit = { name: s.name, lng: s.lng, lat: s.lat, dist: 0 };
        else {
          for (const t of stops) {
            const d = distance([s.lng, s.lat], [t.lng, t.lat]);
            if (d < 800 && (!transit || d < transit.dist)) transit = { name: t.name, lng: t.lng, lat: t.lat, dist: Math.round(d) };
          }
        }
        results.push({
          start: s, route, meters, up, down, hoursUp, hoursRound,
          difficulty: difficulty(meters * 2, up + down, hoursRound, maxGrade(route, cum)), transit,
        });
        peakState.suggestions = [...results].sort((a, b) => a.hoursUp - b.hoursUp);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    if (!results.length) throw new Error('Von den gefundenen Startpunkten aus ließ sich keine Route zum Gipfel berechnen.');
    Object.assign(peakState, { status: 'done', message: '' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    Object.assign(peakState, { status: 'error', message: (e as Error).message });
  }
}

// ---------- Anreise ----------

const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export function directionsUrl(lng: number, lat: number, mode: 'car' | 'transit') {
  if (ios) return `https://maps.apple.com/?daddr=${lat.toFixed(6)},${lng.toFixed(6)}&dirflg=${mode === 'car' ? 'd' : 'r'}`;
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=${mode === 'car' ? 'driving' : 'transit'}`;
}

/** Kartenebenen der Gipfel (nur Standard-Karte) */
export const PEAK_LAYERS = ['peaks-label', 'peaks-dot'];

export const START_ICON: Record<StartKind, string> = { parking: '🅿️', bus: '🚌', rail: '🚆', place: '🏘️' };
export const SUGGEST_COLORS = ['#007aff', '#af52de', '#ff9500', '#34c759', '#ff2d55'];
