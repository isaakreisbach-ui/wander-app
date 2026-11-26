// Dauerhafter Speicher für Overpass-Daten je Kachel (0,05°): Pfade bei kleinem Zoom und markierte Routen.
// Liegt im Cache-Speicher des Browsers, damit die Linien auch offline erscheinen.
// Beim Herunterladen einer Offline-Karte werden alle Kacheln des Gebiets mit EINER Anfrage je Art vorab geladen.

import { overpass } from './overpass';
import { cellsForBbox } from './pois.svelte';

export type CellKind = 'paths' | 'routes';
type El = { id?: number; type?: string; tags?: Record<string, string>; geometry?: { lat: number; lon: number }[];
  members?: { type: string; ref: number; geometry?: { lat: number; lon: number }[] }[] };

const CACHE = 'overlay-cells-v1';
const CELL = 0.05;
const FRESH_MS = 30 * 24 * 3600e3;
const url = (kind: CellKind, key: string) => `https://wander.local/${kind}/${key}`;

const bboxStr = (s: number, w: number, n: number, e: number) => `(${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)})`;
const QUERY: Record<CellKind, (bb: string) => string> = {
  paths: (bb) => `[out:json][timeout:60];way["highway"~"^(path|footway|bridleway|steps|track)$"]${bb};out geom tags;`,
  routes: (bb) => `[out:json][timeout:60];relation["route"~"^(hiking|foot)$"]${bb};out geom tags;`,
};

function cellBox(key: string) {
  const [cx, cy] = key.split('_').map(Number);
  return { w: cx * CELL, s: cy * CELL, e: (cx + 1) * CELL, n: (cy + 1) * CELL };
}

async function readCell(kind: CellKind, key: string): Promise<{ t: number; els: El[] } | null> {
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(url(kind, key));
    return r ? await r.json() : null;
  } catch { return null; }
}

async function writeCell(kind: CellKind, key: string, els: El[]) {
  try {
    const c = await caches.open(CACHE);
    await c.put(url(kind, key), new Response(JSON.stringify({ t: Date.now(), els }), { headers: { 'content-type': 'application/json' } }));
  } catch { /* Speicher voll – egal */ }
}

/** Elemente einer Kachel: erst aus dem Speicher, sonst (wenn online) übers Netz. */
export async function cellElements(kind: CellKind, key: string): Promise<El[] | null> {
  const cached = await readCell(kind, key);
  if (cached && (Date.now() - cached.t < FRESH_MS || !navigator.onLine)) return cached.els;
  if (!navigator.onLine) return null;
  const b = cellBox(key);
  try {
    const els = (await overpass(QUERY[kind](bboxStr(b.s, b.w, b.n, b.e)))) as El[];
    await writeCell(kind, key, els);
    return els;
  } catch {
    return cached?.els ?? null;
  }
}

const inBox = (g: { lat: number; lon: number }[] | undefined, b: ReturnType<typeof cellBox>) =>
  !!g?.some((p) => p.lon >= b.w && p.lon < b.e && p.lat >= b.s && p.lat < b.n);

/** Alle Kacheln eines Gebiets vorab speichern (für Offline-Karten). Gibt die Zahl der gespeicherten Kacheln zurück. */
export async function prefetchCells(kind: CellKind, bbox: [number, number, number, number]): Promise<number> {
  const keys = cellsForBbox(bbox[0], bbox[1], bbox[2], bbox[3]);
  const need: string[] = [];
  for (const k of keys) {
    const c = await readCell(kind, k);
    if (!c || Date.now() - c.t > FRESH_MS) need.push(k);
  }
  if (!need.length) return keys.length;
  // in Blöcken von höchstens 0,3° × 0,3°, damit Overpass nicht überlastet
  const boxes = need.map(cellBox);
  const groups = new Map<string, string[]>();
  need.forEach((k, i) => {
    const g = `${Math.floor(boxes[i].w / 0.3)}_${Math.floor(boxes[i].s / 0.3)}`;
    groups.set(g, [...(groups.get(g) ?? []), k]);
  });
  let saved = keys.length - need.length;
  for (const group of groups.values()) {
    const bs = group.map(cellBox);
    const w = Math.min(...bs.map((b) => b.w)), s = Math.min(...bs.map((b) => b.s));
    const e = Math.max(...bs.map((b) => b.e)), n = Math.max(...bs.map((b) => b.n));
    let els: El[];
    try { els = (await overpass(QUERY[kind](bboxStr(s, w, n, e)))) as El[]; } catch { continue; }
    for (let i = 0; i < group.length; i++) {
      const b = bs[i];
      const inCell = kind === 'paths'
        ? els.filter((el) => inBox(el.geometry, b))
        : els.map((r) => ({ ...r, members: r.members?.filter((m) => inBox(m.geometry, b)) })).filter((r) => r.members?.length);
      await writeCell(kind, group[i], inCell);
      saved++;
    }
  }
  return saved;
}
