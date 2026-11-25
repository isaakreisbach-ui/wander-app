// Gemeinsamer Zugriff auf die Overpass-API (OpenStreetMap-Abfragen).
// Mehrere öffentliche Server; ist einer überlastet (429/504), wird der nächste versucht.

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export type OsmEl = {
  type: string; id: number; lat?: number; lon?: number;
  center?: { lat: number; lon: number }; tags?: Record<string, string>;
};

export async function overpass(query: string, signal?: AbortSignal): Promise<OsmEl[]> {
  let lastErr: unknown = null;
  for (let round = 0; round < 2; round++) {
    for (const ep of ENDPOINTS) {
      // Höchstens 25 s pro Server warten, dann den nächsten versuchen
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 25_000);
      const onAbort = () => ctrl.abort();
      signal?.addEventListener('abort', onAbort);
      try {
        const res = await fetch(`${ep}?data=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (res.ok) return ((await res.json()) as { elements: OsmEl[] }).elements ?? [];
        lastErr = new Error(`Server ${res.status}`);
      } catch (e) {
        if (signal?.aborted) throw e;
        lastErr = (e as Error).name === 'AbortError' ? new Error('Zeitüberschreitung') : e;
      } finally {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      }
    }
    // alle Server belegt → kurz warten und noch einmal
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`OpenStreetMap-Server gerade überlastet – bitte später erneut versuchen. (${(lastErr as Error)?.message ?? ''})`);
}
