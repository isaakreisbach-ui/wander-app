// Routing über den öffentlichen BRouter-Server (kostenlos, ohne Key) mit Wanderprofil.
// Für Luftlinien-Abschnitte kommen die Höhen von der Open-Meteo-Höhen-API.

import { interpolate, type Pt } from './geo';

const BROUTER = 'https://brouter.de/brouter';
export const ROUTING_PROFILE = 'hiking-mountain';

export async function routeSegment(a: [number, number], b: [number, number], signal?: AbortSignal): Promise<Pt[]> {
  const url = `${BROUTER}?lonlats=${a[0].toFixed(6)},${a[1].toFixed(6)}|${b[0].toFixed(6)},${b[1].toFixed(6)}` +
    `&profile=${ROUTING_PROFILE}&alternativeidx=0&format=geojson`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (/not mapped|no track|target island|from-position not mapped|to-position not mapped/i.test(text)) {
      throw new RoutingError('Kein Weg in der Nähe dieses Punktes gefunden.');
    }
    throw new RoutingError('Der Routenserver antwortet gerade nicht.');
  }
  const data = (await res.json()) as { features: { geometry: { coordinates: number[][] }; properties?: { messages?: string[][] } }[] };
  const coords = data.features?.[0]?.geometry?.coordinates;
  if (!coords?.length) throw new RoutingError('Keine Route gefunden.');
  // Wegbeschaffenheit je Abschnitt merken (aus den Weg-Merkmalen, die BRouter mitliefert)
  const msgs = data.features[0].properties?.messages;
  if (msgs?.length) surfaceCache.set(surfaceKey(a, b), summarizeSurface(msgs));
  return coords.map((c) => [c[0], c[1], c[2]] as Pt);
}

// ---------- Wegbeschaffenheit ----------

export type Surface = { asphalt: number; gravel: number; path: number; other: number };
export const surfaceCache = new Map<string, Surface>();
export const surfaceKey = (a: [number, number], b: [number, number]) => `${a[0].toFixed(6)},${a[1].toFixed(6)};${b[0].toFixed(6)},${b[1].toFixed(6)}`;

const PAVED = /surface=(asphalt|paved|concrete|paving_stones|sett|cobblestone)/;
const UNPAVED = /surface=(gravel|fine_gravel|compacted|unpaved|dirt|ground|grass|pebblestone)/;

function summarizeSurface(msgs: string[][]): Surface {
  const head = msgs[0];
  const iDist = head.indexOf('Distance'), iTags = head.indexOf('WayTags');
  const s: Surface = { asphalt: 0, gravel: 0, path: 0, other: 0 };
  for (const row of msgs.slice(1)) {
    const d = +row[iDist] || 0, tags = row[iTags] ?? '';
    const hw = /highway=(\w+)/.exec(tags)?.[1] ?? '';
    if (PAVED.test(tags)) s.asphalt += d;
    else if (['path', 'footway', 'steps', 'bridleway', 'via_ferrata'].includes(hw)) s.path += d;
    else if (hw === 'track' || UNPAVED.test(tags)) s.gravel += d;
    else if (['primary', 'secondary', 'tertiary', 'residential', 'unclassified', 'service', 'living_street', 'cycleway', 'pedestrian'].includes(hw)) s.asphalt += d;
    else s.other += d;
  }
  return s;
}

export async function straightSegment(a: [number, number], b: [number, number], signal?: AbortSignal): Promise<Pt[]> {
  const pts = interpolate(a, b);
  try {
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' +
      pts.map((p) => p[1].toFixed(5)).join(',') + '&longitude=' + pts.map((p) => p[0].toFixed(5)).join(',');
    const res = await fetch(url, { signal });
    if (res.ok) {
      const { elevation } = (await res.json()) as { elevation: number[] };
      elevation.forEach((e, i) => { if (pts[i]) pts[i][2] = e; });
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    // ohne Höhen weitermachen
  }
  return pts;
}

export class RoutingError extends Error {}
