// „Was kann ich von hier aus machen?“ – für einen Punkt auf der Karte:
//  • Gipfel im Umkreis (OpenStreetMap) mit berechnetem Weg (BRouter)
//  • markierte Wanderungen in der Nähe (Waymarked Trails – kostenlos, ohne Key)

import { overpass } from './overpass';
import { routeSegment } from './routing';
import { distance, cumulative, climb, walkingTimeHours, difficulty, maxGrade, type Pt, type Difficulty } from './geo';
import { analyzeMany, categoryOf, type RouteCategory } from './alpine.svelte';

export type PeakOption = {
  id: string; name: string; ele?: number; lng: number; lat: number;
  route: Pt[]; meters: number; up: number; hoursUp: number; hoursRound: number; difficulty: Difficulty;
};

export type HikeOption = {
  id: number; name: string; ref: string; group: string; itinerary: string;
  /** Länge in m, Rundweg?, Abstand vom angetippten Punkt in m */
  length: number; loop: boolean; near: number;
  route: Pt[];
};

export const fromHere = $state<{
  point: { lng: number; lat: number } | null;
  peakStatus: 'idle' | 'loading' | 'done' | 'error';
  hikeStatus: 'idle' | 'loading' | 'done' | 'error';
  peakMsg: string;
  hikeMsg: string;
  peaks: PeakOption[];
  hikes: HikeOption[];
  selected: { type: 'peak' | 'hike'; id: string | number } | null;
  /** Kategorie je Vorschlag ('p:<id>' / 'h:<id>') – kommt nach, sobald geprüft */
  cats: Record<string, { cat: RouteCategory; grade: string }>;
  catStatus: 'idle' | 'loading' | 'done' | 'error';
  /** Welche Kategorien angezeigt werden (an/aus) */
  show: Record<RouteCategory, boolean>;
}>({
  point: null, peakStatus: 'idle', hikeStatus: 'idle', peakMsg: '', hikeMsg: '', peaks: [], hikes: [], selected: null,
  cats: {}, catStatus: 'idle',
  show: (() => {
    try { return { wander: true, alpine: true, via_ferrata: true, glacier: true, ...JSON.parse(localStorage.getItem('wander.fh.show') || '{}') }; }
    catch { return { wander: true, alpine: true, via_ferrata: true, glacier: true }; }
  })(),
});

export function toggleCategory(c: RouteCategory) {
  fromHere.show[c] = !fromHere.show[c];
  localStorage.setItem('wander.fh.show', JSON.stringify(fromHere.show));
}

/** Ist dieser Vorschlag nach den Schaltern sichtbar? (Ungeprüfte gelten als Wanderweg) */
export function visible(key: string) {
  const c = fromHere.cats[key]?.cat ?? 'wander';
  return fromHere.show[c];
}

async function classify(signal: AbortSignal) {
  const items = [
    ...fromHere.peaks.map((p) => ({ key: `p:${p.id}`, route: p.route })),
    ...fromHere.hikes.map((h) => ({ key: `h:${h.id}`, route: h.route })),
  ];
  if (!items.length) return;
  fromHere.catStatus = 'loading';
  try {
    const res = await analyzeMany(items.map((i) => i.route), signal);
    const cats: typeof fromHere.cats = {};
    items.forEach((it, i) => (cats[it.key] = categoryOf(res[i])));
    fromHere.cats = cats;
    fromHere.catStatus = 'done';
  } catch (e) {
    if ((e as Error).name !== 'AbortError') fromHere.catStatus = 'error';
  }
}

let abort: AbortController | null = null;

export function closeFromHere() {
  abort?.abort();
  Object.assign(fromHere, { point: null, peaks: [], hikes: [], selected: null, peakStatus: 'idle', hikeStatus: 'idle', cats: {}, catStatus: 'idle' });
}

export function openFromHere(lng: number, lat: number) {
  abort?.abort();
  const ctrl = (abort = new AbortController());
  Object.assign(fromHere, {
    point: { lng, lat }, peaks: [], hikes: [], selected: null, cats: {}, catStatus: 'idle',
    peakStatus: 'loading', hikeStatus: 'loading', peakMsg: 'Suche Gipfel …', hikeMsg: 'Suche Wanderungen …',
  });
  if (!navigator.onLine) {
    Object.assign(fromHere, { peakStatus: 'error', hikeStatus: 'error', peakMsg: 'Dafür wird Internet benötigt.', hikeMsg: '' });
    return;
  }
  // Wenn beides geladen ist: alle Vorschläge auf Klettersteig/Gletscher/alpin prüfen (eine Abfrage)
  Promise.all([loadPeaks(lng, lat, ctrl.signal), loadHikes(lng, lat, ctrl.signal)]).then(() => {
    if (!ctrl.signal.aborted) classify(ctrl.signal);
  });
}

// ---------- Gipfel ----------

async function loadPeaks(lng: number, lat: number, signal: AbortSignal) {
  try {
    const els = await overpass(`[out:json][timeout:25];node["natural"="peak"]["name"](around:7000,${lat.toFixed(5)},${lng.toFixed(5)});out body;`, signal);
    const peaks = els
      .map((e) => ({
        id: `n${e.id}`, name: (e.tags?.['name:de'] ?? e.tags?.name ?? '').split(/ - | \/ /)[0],
        ele: e.tags?.ele ? Math.round(parseFloat(e.tags.ele)) : undefined,
        lng: e.lon!, lat: e.lat!, d: distance([lng, lat], [e.lon!, e.lat!]),
      }))
      .filter((p) => p.name && p.d > 250)
      // nahe und hohe Gipfel bevorzugen
      .sort((a, b) => (a.d - (a.ele ?? 0) * 2) - (b.d - (b.ele ?? 0) * 2))
      .slice(0, 6);
    if (!peaks.length) throw new Error('Im Umkreis von 7 km sind keine Gipfel eingetragen.');
    fromHere.peakMsg = `Berechne Wege zu ${peaks.length} Gipfeln …`;
    const out: PeakOption[] = [];
    for (const p of peaks) {
      if (signal.aborted) return;
      try {
        const route = await routeSegment([lng, lat], [p.lng, p.lat], signal);
        const cum = cumulative(route);
        const meters = cum[cum.length - 1];
        if (meters > 18000) continue;
        const { up, down } = climb(route);
        const hoursUp = walkingTimeHours(meters, up, down);
        const hoursRound = walkingTimeHours(meters * 2, up + down, up + down);
        out.push({
          id: p.id, name: p.name, ele: p.ele, lng: p.lng, lat: p.lat, route, meters, up, hoursUp, hoursRound,
          difficulty: difficulty(meters * 2, up + down, hoursRound, maxGrade(route, cum)),
        });
        fromHere.peaks = [...out].sort((a, b) => a.hoursUp - b.hoursUp);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    Object.assign(fromHere, { peakStatus: out.length ? 'done' : 'error', peakMsg: out.length ? '' : 'Zu keinem Gipfel ließ sich ein Weg berechnen.' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    Object.assign(fromHere, { peakStatus: 'error', peakMsg: (e as Error).message });
  }
}

// ---------- Wanderungen (Waymarked Trails) ----------

const WMT = 'https://hiking.waymarkedtrails.org/api/v1';
const mx = (lng: number) => (lng * 20037508.34) / 180;
const my = (lat: number) => (Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180)) * 20037508.34 / 180;
const toLng = (x: number) => (x / 20037508.34) * 180;
const toLat = (y: number) => (Math.atan(Math.exp((y / 20037508.34) * Math.PI)) * 360) / Math.PI - 90;

type WmtWay = { geometry: { coordinates: number[][] }; direction?: number };
type WmtSeg = { ways?: WmtWay[]; main?: WmtSeg[] };

/** Linienstücke aus der verschachtelten Waymarked-Struktur einsammeln */
function collect(seg: WmtSeg, out: number[][][]) {
  if (seg.ways) {
    for (const w of seg.ways) {
      const c = w.geometry.coordinates.map(([x, y]) => [toLng(x), toLat(y)]);
      out.push(w.direction === -1 ? c.reverse() : c);
    }
  }
  if (seg.main) seg.main.forEach((s) => collect(s, out));
}

/** Teilstücke zu einer Linie verbinden (jeweils das passende Ende anhängen) */
function chain(parts: number[][][]): Pt[] {
  if (!parts.length) return [];
  const line = [...parts[0]];
  for (let i = 1; i < parts.length; i++) {
    let p = parts[i];
    const end = line[line.length - 1];
    if (distance(end as Pt, p[p.length - 1] as Pt) < distance(end as Pt, p[0] as Pt)) p = [...p].reverse();
    line.push(...p.slice(1));
  }
  return line.map((c) => [c[0], c[1]] as Pt);
}

async function loadHikes(lng: number, lat: number, signal: AbortSignal) {
  try {
    const d = 0.03; // ~3 km
    const bb = [mx(lng - d * 1.5), my(lat - d), mx(lng + d * 1.5), my(lat + d)].map((v) => v.toFixed(0)).join(',');
    const res = await fetch(`${WMT}/list/by_area?bbox=${bb}&limit=60`, { signal });
    if (!res.ok) throw new Error('Wanderwege-Dienst nicht erreichbar.');
    const list = ((await res.json()).results ?? []) as { id: number; type: string; name: string; ref?: string; group: string; itinerary?: string[] }[];
    // lokale Wege und regionale zuerst; Fernwanderwege (Tausende km) überspringen
    const order: Record<string, number> = { LOC: 0, REG: 1, NAT: 2, INT: 3 };
    const cands = list.filter((r) => r.type === 'relation' && (r.group === 'LOC' || r.group === 'REG'))
      .sort((a, b) => (order[a.group] ?? 9) - (order[b.group] ?? 9)).slice(0, 12);
    if (!cands.length) throw new Error('In der Nähe sind keine markierten Wanderungen eingetragen.');
    fromHere.hikeMsg = `Lade ${cands.length} Wanderungen …`;
    const out: HikeOption[] = [];
    for (const c of cands) {
      if (signal.aborted) return;
      try {
        const det = await fetch(`${WMT}/details/relation/${c.id}`, { signal }).then((r) => (r.ok ? r.json() : null));
        if (!det?.route) continue;
        const parts: number[][][] = [];
        collect(det.route, parts);
        const route = chain(parts);
        if (route.length < 2) continue;
        const length = det.route.length ?? cumulative(route).at(-1) ?? 0;
        if (length > 40000) continue; // zu lang für eine Tagestour
        let near = Infinity;
        for (const p of route) near = Math.min(near, distance([lng, lat], p));
        const loop = distance(route[0], route[route.length - 1]) < 300;
        out.push({
          id: c.id, name: c.name || c.ref || 'Wanderweg', ref: c.ref ?? '', group: c.group,
          itinerary: (c.itinerary ?? []).join(' – '), length, loop, near: Math.round(near), route,
        });
        fromHere.hikes = [...out].sort((a, b) => a.near - b.near);
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
      }
    }
    Object.assign(fromHere, { hikeStatus: out.length ? 'done' : 'error', hikeMsg: out.length ? '' : 'Keine passenden Wanderungen gefunden.' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') return;
    Object.assign(fromHere, { hikeStatus: 'error', hikeMsg: (e as Error).message });
  }
}

export const FH_COLORS = ['#007aff', '#af52de', '#ff9500', '#34c759', '#ff2d55', '#5ac8fa'];
