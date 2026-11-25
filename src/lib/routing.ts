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
  const data = (await res.json()) as { features: { geometry: { coordinates: number[][] } }[] };
  const coords = data.features?.[0]?.geometry?.coordinates;
  if (!coords?.length) throw new RoutingError('Keine Route gefunden.');
  return coords.map((c) => [c[0], c[1], c[2]] as Pt);
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
