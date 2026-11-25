// Ortssuche über Photon (komoot) – kostenlos, ohne Key, Daten aus OpenStreetMap.
// Fair Use: Anfragen erst nach kurzer Tipp-Pause, max. 6 Ergebnisse.

export type SearchResult = {
  id: string;
  name: string;
  detail: string;
  kind: string;
  lng: number;
  lat: number;
  /** [west, süd, ost, nord] */
  bbox?: [number, number, number, number];
};

const KINDS: Record<string, string> = {
  peak: 'Gipfel', volcano: 'Gipfel', saddle: 'Sattel', city: 'Stadt', town: 'Stadt', village: 'Dorf',
  hamlet: 'Weiler', suburb: 'Ortsteil', locality: 'Ort', alpine_hut: 'Hütte', wilderness_hut: 'Hütte',
  shelter: 'Schutzhütte', viewpoint: 'Aussichtspunkt', parking: 'Parkplatz', station: 'Bahnhof',
  halt: 'Haltepunkt', bus_stop: 'Haltestelle', restaurant: 'Restaurant', water: 'Gewässer',
  lake: 'See', spring: 'Quelle', waterfall: 'Wasserfall', tower: 'Turm', castle: 'Burg', ruins: 'Ruine',
  forest: 'Wald', wood: 'Wald', street: 'Straße', residential: 'Straße', path: 'Weg', footway: 'Weg', track: 'Weg',
};

/** Koordinaten wie "50.2324, 8.4573" oder "50,2324 8,4573" erkennen */
export function parseCoordinates(q: string): SearchResult | null {
  const m = q.trim().match(/^(-?\d{1,2}(?:[.,]\d+)?)\s*[,; ]\s*(-?\d{1,3}(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { id: 'coord', name: `${lat.toFixed(5)}, ${lng.toFixed(5)}`, detail: 'Koordinaten', kind: '📍', lng, lat };
}

type PhotonFeature = {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | number[] | undefined> & {
    name?: string; osm_value?: string; osm_id?: number; osm_type?: string; extent?: number[];
  };
};

export async function search(q: string, near: { lng: number; lat: number }, signal: AbortSignal): Promise<SearchResult[]> {
  const url = new URL('https://photon.komoot.io/api/');
  url.searchParams.set('q', q);
  url.searchParams.set('lang', 'de');
  url.searchParams.set('limit', '6');
  url.searchParams.set('lat', near.lat.toFixed(3));
  url.searchParams.set('lon', near.lng.toFixed(3));
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Suche fehlgeschlagen (${res.status})`);
  const data = (await res.json()) as { features: PhotonFeature[] };

  return data.features.map((f, i) => {
    const p = f.properties;
    const [lng, lat] = f.geometry.coordinates;
    const place = [p.city, p.state, p.country].filter((x, j, a) => x && x !== p.name && a.indexOf(x) === j);
    const ext = p.extent;
    return {
      id: `${p.osm_type}${p.osm_id ?? i}`,
      name: String(p.name ?? ([p.street, p.housenumber].filter(Boolean).join(' ') || 'Ohne Namen')),
      detail: place.join(', '),
      kind: KINDS[String(p.osm_value)] ?? '',
      lng, lat,
      bbox: ext && ext.length === 4 ? [ext[0], ext[3], ext[2], ext[1]] : undefined,
    };
  });
}
