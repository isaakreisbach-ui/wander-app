// Offline-Karten: Kacheln der Standard-Karte (OpenFreeMap) für ein Gebiet vorab speichern.
//
// Fair Use: Nur OpenFreeMap wird heruntergeladen (Vektorkacheln, sehr klein, ausdrücklich
// ohne Nutzungsgrenzen). OpenTopoMap, Waymarked Trails und Esri werden NICHT vorab geladen,
// weil deren Bedingungen Massen-Downloads verbieten.
// Grenzen: max. MAX_TILES Kacheln pro Download, Zoomstufen 6–14 (höher wird die Karte aus z14
// vergrößert – Vektorkarten bleiben dabei scharf), höchstens 4 Anfragen gleichzeitig.

import { db, newTourId, type OfflineArea } from './db';
import { distance, type Pt } from './geo';

export const OFFLINE_CACHE = 'ofm-offline';
const STATIC_CACHE = 'ofm-static';
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
export const MAX_TILES = 2500;
export const MIN_Z = 6;
export const MAX_Z = 14;
const PARALLEL = 4;

export const tileKeyUrl = (z: number, x: number, y: number) => `https://tiles.openfreemap.org/__tile/${z}/${x}/${y}.pbf`;

// ---------- Kachel-Mathematik ----------

function lng2x(lng: number, z: number) { return Math.floor(((lng + 180) / 360) * 2 ** z); }
function lat2y(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
}

function addBox(set: Set<string>, z: number, w: number, s: number, e: number, n: number) {
  const max = 2 ** z - 1;
  const x0 = Math.max(0, lng2x(w, z)), x1 = Math.min(max, lng2x(e, z));
  const y0 = Math.max(0, lat2y(n, z)), y1 = Math.min(max, lat2y(s, z));
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set.add(`${z}/${x}/${y}`);
}

/** Kacheln für einen Streifen von `bufferM` Metern links und rechts der Strecke */
export function tilesForRoute(route: Pt[], bufferM: number): Set<string> {
  const set = new Set<string>();
  if (route.length < 1) return set;
  // Strecke ca. alle 150 m abtasten
  const samples: Pt[] = [route[0]];
  let acc = 0;
  for (let i = 1; i < route.length; i++) {
    acc += distance(route[i - 1], route[i]);
    if (acc >= 150) { samples.push(route[i]); acc = 0; }
  }
  samples.push(route[route.length - 1]);
  for (const p of samples) {
    const dLat = bufferM / 111320;
    const dLng = bufferM / (111320 * Math.cos((p[1] * Math.PI) / 180));
    for (let z = MIN_Z; z <= MAX_Z; z++) addBox(set, z, p[0] - dLng, p[1] - dLat, p[0] + dLng, p[1] + dLat);
  }
  return set;
}

export function tilesForBounds(b: [number, number, number, number]): Set<string> {
  const set = new Set<string>();
  for (let z = MIN_Z; z <= MAX_Z; z++) addBox(set, z, b[0], b[1], b[2], b[3]);
  return set;
}

export function routeBbox(route: Pt[]): [number, number, number, number] {
  let w = 180, s = 90, e = -180, n = -90;
  for (const p of route) { w = Math.min(w, p[0]); e = Math.max(e, p[0]); s = Math.min(s, p[1]); n = Math.max(n, p[1]); }
  return [w, s, e, n];
}

// ---------- Download ----------

export type Job = {
  name: string;
  total: number;
  done: number;
  bytes: number;
  failed: number;
  status: 'running' | 'done' | 'error' | 'cancelled';
  message?: string;
};

export const offline = $state<{ job: Job | null }>({ job: null });
let abort: AbortController | null = null;

/** Stil, TileJSON, Symbole und Schriften speichern, damit die Karte offline überhaupt starten kann */
async function cacheStatic(signal: AbortSignal): Promise<string> {
  const cache = await caches.open(STATIC_CACHE);
  const get = async (url: string) => {
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`Kartenserver antwortet nicht (${res.status})`);
    await cache.put(url, res.clone());
    return res;
  };
  const style = await (await get(STYLE_URL)).json();
  const tilejsonUrl: string = style.sources.openmaptiles.url;
  const tilejson = await (await get(tilejsonUrl)).json();
  const sprite: string = typeof style.sprite === 'string' ? style.sprite : style.sprite?.[0]?.url;
  const extras: string[] = [];
  if (sprite) for (const suf of ['.json', '.png', '@2x.json', '@2x.png']) extras.push(sprite + suf);
  // Schriften: Grundbereiche für deutsche/europäische Beschriftungen
  for (const font of ['Noto Sans Regular', 'Noto Sans Italic', 'Noto Sans Bold']) {
    for (const range of ['0-255', '256-511', '8192-8447']) {
      extras.push(style.glyphs.replace('{fontstack}', encodeURIComponent(font)).replace('{range}', range));
    }
  }
  // Übersichtskarte für sehr kleine Zoomstufen
  const ne = style.sources.ne2_shaded?.tiles?.[0];
  if (ne) for (let z = 0; z <= 3; z++) for (let x = 0; x < 2 ** z; x++) for (let y = 0; y < 2 ** z; y++)
    extras.push(ne.replace('{z}', z).replace('{x}', x).replace('{y}', y));
  await Promise.all(extras.map((u) => get(u).catch(() => null)));
  return tilejson.tiles[0] as string;
}

export function estimateMB(tileCount: number) {
  // Erfahrungswert: im Schnitt ~35 KB pro Kachel
  return Math.max(0.1, Math.round((tileCount * 35) / 102.4) / 10);
}

export async function downloadArea(opts: {
  name: string; kind: OfflineArea['kind']; tourId?: string;
  bbox: [number, number, number, number]; tiles: Set<string>;
}): Promise<OfflineArea | null> {
  if (offline.job?.status === 'running') throw new Error('Es läuft bereits ein Download.');
  if (opts.tiles.size > MAX_TILES) throw new Error(`Das Gebiet ist zu groß (${opts.tiles.size} Kacheln, erlaubt sind ${MAX_TILES}). Bitte weiter hineinzoomen.`);
  if (!navigator.onLine) throw new Error('Zum Herunterladen wird Internet benötigt.');

  abort = new AbortController();
  const signal = abort.signal;
  const job: Job = { name: opts.name, total: opts.tiles.size, done: 0, bytes: 0, failed: 0, status: 'running' };
  offline.job = job;

  try {
    const template = await cacheStatic(signal);
    const cache = await caches.open(OFFLINE_CACHE);
    const queue = [...opts.tiles];

    const worker = async () => {
      for (let key = queue.shift(); key; key = queue.shift()) {
        if (signal.aborted) return;
        const [z, x, y] = key.split('/').map(Number);
        const keyUrl = tileKeyUrl(z, x, y);
        try {
          const existing = await cache.match(keyUrl);
          if (existing) {
            offline.job!.bytes += Number(existing.headers.get('content-length')) || 0;
          } else {
            const res = await fetch(template.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal });
            if (res.ok || res.status === 204) {
              const blob = await res.blob();
              await cache.put(keyUrl, new Response(blob, {
                headers: { 'content-type': 'application/x-protobuf', 'content-length': String(blob.size) },
              }));
              offline.job!.bytes += blob.size;
            } else {
              offline.job!.failed++;
            }
          }
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          offline.job!.failed++;
        }
        offline.job!.done++;
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));

    if (signal.aborted) {
      offline.job!.status = 'cancelled';
      return null;
    }
    const area: OfflineArea = {
      id: newTourId(),
      name: opts.name,
      kind: opts.kind,
      tourId: opts.tourId,
      createdAt: Date.now(),
      bbox: opts.bbox,
      tiles: [...opts.tiles],
      bytes: offline.job!.bytes,
    };
    // Gleiche Tour schon einmal gespeichert → alten Eintrag ersetzen
    if (opts.tourId) {
      const old = await db.offlineAreas.where('tourId').equals(opts.tourId).toArray();
      await db.offlineAreas.bulkDelete(old.map((a) => a.id));
    }
    await db.offlineAreas.put(area);
    offline.job!.status = 'done';
    offline.job!.message = offline.job!.failed
      ? `${offline.job!.failed} Kacheln fehlen – bitte später erneut herunterladen.`
      : undefined;
    return area;
  } catch (e) {
    offline.job!.status = 'error';
    offline.job!.message = (e as Error).message;
    return null;
  } finally {
    abort = null;
  }
}

export function cancelDownload() {
  abort?.abort();
}

/** Gebiet löschen – Kacheln, die ein anderes Gebiet noch braucht, bleiben erhalten */
export async function deleteArea(id: string) {
  const area = await db.offlineAreas.get(id);
  if (!area) return;
  await db.offlineAreas.delete(id);
  const stillUsed = new Set<string>();
  for (const a of await db.offlineAreas.toArray()) for (const t of a.tiles) stillUsed.add(t);
  const cache = await caches.open(OFFLINE_CACHE);
  await Promise.all(area.tiles.filter((t) => !stillUsed.has(t)).map((t) => {
    const [z, x, y] = t.split('/').map(Number);
    return cache.delete(tileKeyUrl(z, x, y));
  }));
}

/** Beim Surfen zwischengespeicherte Kacheln begrenzen (älteste zuerst löschen) */
export async function trimBrowseCache(max = 3000) {
  try {
    const cache = await caches.open('ofm-browse');
    const keys = await cache.keys();
    const extra = keys.length - max;
    if (extra > 0) await Promise.all(keys.slice(0, extra).map((k) => cache.delete(k)));
  } catch { /* egal */ }
}

export function formatMB(bytes: number) {
  const mb = bytes / 1024 / 1024;
  return mb < 1 ? `${Math.max(0.1, Math.round(mb * 10) / 10).toLocaleString('de-DE')} MB` : `${Math.round(mb * 10) / 10} MB`.replace('.', ',');
}
