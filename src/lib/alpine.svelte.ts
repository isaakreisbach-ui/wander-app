// Alpine Abschnitte entlang einer Route erkennen (Daten aus OpenStreetMap):
//  • Klettersteige (highway=via_ferrata, Schwierigkeit via_ferrata_scale)
//  • Gletscher (natural=glacier) – Route führt über Eis
//  • alpine Wege (sac_scale T4–T6)
// Ergebnis: Abschnitte mit km-Angaben – für Warnhinweise, Kartenmarkierung und Ausrüstung.

import { overpass, type OsmEl } from './overpass';
import { distance, cumulative, type Pt } from './geo';

export type AlpineKind = 'via_ferrata' | 'glacier' | 'alpine';
export type AlpineSection = {
  kind: AlpineKind;
  fromKm: number;
  toKm: number;
  fromIdx: number;
  toIdx: number;
  name: string;
  grade: string;
};

export const alpineState = $state<{ key: string; status: 'idle' | 'loading' | 'done' | 'error'; sections: AlpineSection[]; message: string }>({
  key: '', status: 'idle', sections: [], message: '',
});

const cache = new Map<string, AlpineSection[]>();
let abort: AbortController | null = null;

const SAC: Record<string, string> = {
  alpine_hiking: 'T4', demanding_alpine_hiking: 'T5', difficult_alpine_hiking: 'T6',
};

function routeKey(r: Pt[]) {
  if (r.length < 2) return '';
  const a = r[0], b = r[r.length - 1], m = r[Math.floor(r.length / 2)];
  return [a, m, b].map((p) => `${p[0].toFixed(4)},${p[1].toFixed(4)}`).join(';') + `|${r.length}`;
}

/** Abstand Punkt–Strecke in Metern (lokal flach gerechnet – genügt für wenige Meter) */
function distToSegment(p: Pt, a: number[], b: number[]) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111320, m = 110540;
  const px = p[0] * k, py = p[1] * m, ax = a[0] * k, ay = a[1] * m, bx = b[0] * k, by = b[1] * m;
  const dx = bx - ax, dy = by - ay;
  const t = dx || dy ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(ax + t * dx - px, ay + t * dy - py);
}

function inPolygon(p: Pt, ring: number[][]) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const geomOf = (e: OsmEl & { geometry?: { lat: number; lon: number }[] }) => (e.geometry ?? []).map((g) => [g.lon, g.lat]);

type Features = {
  lines: { kind: 'via_ferrata' | 'alpine'; coords: number[][]; name: string; grade: string }[];
  polys: { coords: number[][]; name: string }[];
};

function bboxOf(routes: Pt[][]) {
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of routes) for (const p of r) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  const pad = 0.002;
  return `(${(s - pad).toFixed(4)},${(w - pad).toFixed(4)},${(n + pad).toFixed(4)},${(e + pad).toFixed(4)})`;
}

/** Prüft mehrere Routen mit EINER Abfrage (z. B. alle „Von hier aus“-Vorschläge) */
export async function analyzeMany(routes: Pt[][], signal?: AbortSignal): Promise<AlpineSection[][]> {
  const feats = await fetchFeatures(bboxOf(routes), signal);
  return routes.map((r) => sectionsFor(r, feats));
}

/** Startet die Prüfung (nur online, Ergebnis wird je Route zwischengespeichert) */
export async function checkAlpine(route: Pt[]) {
  const key = routeKey(route);
  if (!key || key === alpineState.key) return;
  abort?.abort();
  alpineState.key = key;
  if (cache.has(key)) { Object.assign(alpineState, { status: 'done', sections: cache.get(key)!, message: '' }); return; }
  if (!navigator.onLine) { Object.assign(alpineState, { status: 'error', sections: [], message: 'Prüfung braucht Internet.' }); return; }
  const ctrl = (abort = new AbortController());
  Object.assign(alpineState, { status: 'loading', sections: [], message: '' });
  try {
    const sections = sectionsFor(route, await fetchFeatures(bboxOf([route]), ctrl.signal));
    cache.set(key, sections);
    if (alpineState.key === key) Object.assign(alpineState, { status: 'done', sections, message: '' });
  } catch (err) {
    if ((err as Error).name === 'AbortError') return;
    if (alpineState.key === key) Object.assign(alpineState, { status: 'error', sections: [], message: (err as Error).message });
  }
}

async function fetchFeatures(bb: string, signal?: AbortSignal): Promise<Features> {
  {
    const els = (await overpass(
      `[out:json][timeout:25];(` +
      `way["highway"="via_ferrata"]${bb};way["via_ferrata_scale"]${bb};` +
      `way["sac_scale"~"^(alpine_hiking|demanding_alpine_hiking|difficult_alpine_hiking)$"]${bb};` +
      `way["natural"="glacier"]${bb};relation["natural"="glacier"]${bb};` +
      `);out geom tags;`,
      signal,
    )) as (OsmEl & { geometry?: { lat: number; lon: number }[]; members?: { role: string; geometry?: { lat: number; lon: number }[] }[] })[];

    const lines: { kind: 'via_ferrata' | 'alpine'; coords: number[][]; name: string; grade: string }[] = [];
    const polys: { coords: number[][]; name: string }[] = [];
    for (const el of els) {
      const t = el.tags ?? {};
      if (t.natural === 'glacier') {
        if (el.type === 'way') polys.push({ coords: geomOf(el), name: t.name ?? 'Gletscher' });
        else {
          // Multipolygon: äußere Ringe aneinanderhängen
          const ring = (el.members ?? []).filter((m) => m.role === 'outer').flatMap((m) => (m.geometry ?? []).map((g) => [g.lon, g.lat]));
          if (ring.length > 3) polys.push({ coords: ring, name: t.name ?? 'Gletscher' });
        }
      } else if (t.highway === 'via_ferrata' || t.via_ferrata_scale) {
        const sc = t.via_ferrata_scale;
        const grade = sc ? (/^\d$/.test(sc) ? ['A', 'A/B', 'B', 'C', 'D', 'E', 'F'][Math.min(6, +sc)] ?? sc : sc) : '';
        lines.push({ kind: 'via_ferrata', coords: geomOf(el), name: t.name ?? 'Klettersteig', grade });
      } else if (t.sac_scale) {
        lines.push({ kind: 'alpine', coords: geomOf(el), name: t.name ?? 'Alpiner Steig', grade: SAC[t.sac_scale] ?? '' });
      }
    }
    return { lines, polys };
  }
}

/** Alpine Abschnitte einer Route anhand der geladenen OSM-Daten bestimmen */
export function sectionsFor(route: Pt[], { lines, polys }: Features): AlpineSection[] {
  {
    // Für jeden Routenpunkt bestimmen, ob er auf einem alpinen Abschnitt liegt
    const cum = cumulative(route);
    const flag: ({ kind: AlpineKind; name: string; grade: string } | null)[] = route.map((p) => {
      for (const g of polys) if (inPolygon(p, g.coords)) return { kind: 'glacier' as const, name: g.name, grade: '' };
      for (const l of lines.filter((x) => x.kind === 'via_ferrata')) {
        for (let i = 1; i < l.coords.length; i++) if (distToSegment(p, l.coords[i - 1], l.coords[i]) < 15) return { kind: l.kind, name: l.name, grade: l.grade };
      }
      for (const l of lines.filter((x) => x.kind === 'alpine')) {
        for (let i = 1; i < l.coords.length; i++) if (distToSegment(p, l.coords[i - 1], l.coords[i]) < 12) return { kind: l.kind, name: l.name, grade: l.grade };
      }
      return null;
    });

    // Zusammenhängende Stücke bilden (Lücken < 60 m überbrücken), sehr kurze (< 40 m) verwerfen
    const sections: AlpineSection[] = [];
    let i = 0;
    while (i < route.length) {
      const f = flag[i];
      if (!f) { i++; continue; }
      let j = i;
      while (j + 1 < route.length) {
        const nf = flag[j + 1];
        if (nf && nf.kind === f.kind) { j++; continue; }
        // kleine Lücke?
        let k = j + 1;
        while (k < route.length && !flag[k] && cum[k] - cum[j] < 60) k++;
        if (k < route.length && flag[k]?.kind === f.kind && cum[k] - cum[j] < 60) { j = k; continue; }
        break;
      }
      if (cum[j] - cum[i] >= 40 || f.kind === 'via_ferrata') {
        sections.push({ kind: f.kind, fromIdx: i, toIdx: j, fromKm: cum[i] / 1000, toKm: cum[j] / 1000, name: f.name, grade: f.grade });
      }
      i = j + 1;
    }
    return sections;
  }
}

export type RouteCategory = 'wander' | 'alpine' | 'via_ferrata' | 'glacier';

/** Gesamt-Kategorie einer Route = der anspruchsvollste Abschnitt */
export function categoryOf(sections: AlpineSection[]): { cat: RouteCategory; grade: string } {
  const pick = (k: AlpineKind) => sections.filter((s) => s.kind === k);
  const gl = pick('glacier'), vf = pick('via_ferrata'), al = pick('alpine');
  if (gl.length) return { cat: 'glacier', grade: '' };
  if (vf.length) return { cat: 'via_ferrata', grade: vf.map((s) => s.grade).sort().at(-1) ?? '' };
  if (al.length) return { cat: 'alpine', grade: al.map((s) => s.grade).sort().at(-1) ?? '' };
  return { cat: 'wander', grade: '' };
}

export const CATEGORY_STYLE: Record<RouteCategory, { icon: string; label: string; color: string }> = {
  wander: { icon: '🥾', label: 'Wanderweg', color: '#34c759' },
  alpine: { icon: '⛰️', label: 'Alpiner Steig', color: '#8e44ad' },
  via_ferrata: { icon: '🧗', label: 'Klettersteig', color: '#d70015' },
  glacier: { icon: '🧊', label: 'Gletscher', color: '#5ac8fa' },
};

export const ALPINE_STYLE: Record<AlpineKind, { icon: string; label: string; color: string }> = {
  via_ferrata: { icon: '🧗', label: 'Klettersteig', color: '#d70015' },
  glacier: { icon: '🧊', label: 'Gletscher', color: '#5ac8fa' },
  alpine: { icon: '⛰️', label: 'Alpiner Steig', color: '#8e44ad' },
};

/** Für die Ausrüstungs-Box: Welche alpinen Abschnitte gibt es? */
export function alpineSummary(sections: AlpineSection[]) {
  const vf = sections.filter((s) => s.kind === 'via_ferrata');
  const gl = sections.filter((s) => s.kind === 'glacier');
  const al = sections.filter((s) => s.kind === 'alpine');
  const maxVf = vf.map((s) => s.grade).sort().at(-1) ?? '';
  const maxT = al.map((s) => s.grade).sort().at(-1) ?? '';
  return { viaFerrata: vf.length > 0, vfGrade: maxVf, glacier: gl.length > 0, alpine: al.length > 0, alpineGrade: maxT };
}

export function sectionsDistance(route: Pt[], s: AlpineSection) {
  return distance(route[s.fromIdx], route[s.toIdx]);
}
