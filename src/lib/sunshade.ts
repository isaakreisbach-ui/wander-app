// Sonne oder Schatten entlang der Route: Sonnenstand berechnen und prüfen, ob Berge in Sonnenrichtung höher sind.
// Geländehöhen aus den freien AWS-Terrain-Kacheln (Terrarium-PNG, Zoom 11 ≈ 50–75 m Raster).

import type { Pt } from './geo';

const DEM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
const Z = 11;
const RAD = Math.PI / 180;

// ---------- Sonnenstand (vereinfachter NOAA-Algorithmus, genau auf ca. 0,5°) ----------
export function sunPosition(date: Date, lat: number, lng: number): { alt: number; az: number } {
  const d = date.getTime() / 86400000 - 10957.5; // Tage seit J2000
  const g = (357.529 + 0.98560028 * d) * RAD;
  const q = 280.459 + 0.98564736 * d;
  const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const e = (23.439 - 0.00000036 * d) * RAD;
  const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
  const dec = Math.asin(Math.sin(e) * Math.sin(L));
  const gmst = (18.697374558 + 24.06570982441908 * d) % 24;
  const ha = ((gmst * 15 + lng) * RAD) - ra;
  const la = lat * RAD;
  const alt = Math.asin(Math.sin(la) * Math.sin(dec) + Math.cos(la) * Math.cos(dec) * Math.cos(ha));
  const az = Math.atan2(-Math.sin(ha), Math.tan(dec) * Math.cos(la) - Math.sin(la) * Math.cos(ha)); // 0 = Norden, im Uhrzeigersinn
  return { alt: alt / RAD, az: ((az / RAD) + 360) % 360 };
}

// ---------- Höhenmodell ----------
const lng2x = (lng: number) => ((lng + 180) / 360) * 2 ** Z;
const lat2y = (lat: number) => { const r = lat * RAD; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** Z; };

export type Dem = (lng: number, lat: number) => number | null;

export async function loadDem(bbox: [number, number, number, number], signal?: AbortSignal): Promise<Dem> {
  const x0 = Math.floor(lng2x(bbox[0])), x1 = Math.floor(lng2x(bbox[2]));
  const y0 = Math.floor(lat2y(bbox[3])), y1 = Math.floor(lat2y(bbox[1]));
  if ((x1 - x0 + 1) * (y1 - y0 + 1) > 30) throw new Error('Gebiet zu groß');
  const tiles = new Map<string, Uint8ClampedArray>();
  const jobs: Promise<void>[] = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    jobs.push((async () => {
      const res = await fetch(DEM.replace('{z}', String(Z)).replace('{x}', String(x)).replace('{y}', String(y)), { signal });
      if (!res.ok) return;
      const bmp = await createImageBitmap(await res.blob());
      const c = new OffscreenCanvas(256, 256);
      const ctx = c.getContext('2d')!;
      ctx.drawImage(bmp, 0, 0);
      tiles.set(`${x}/${y}`, ctx.getImageData(0, 0, 256, 256).data);
    })());
  }
  await Promise.all(jobs);
  return (lng, lat) => {
    const fx = lng2x(lng), fy = lat2y(lat);
    const tx = Math.floor(fx), ty = Math.floor(fy);
    const d = tiles.get(`${tx}/${ty}`);
    if (!d) return null;
    const px = Math.min(255, Math.floor((fx - tx) * 256)), py = Math.min(255, Math.floor((fy - ty) * 256));
    const i = (py * 256 + px) * 4;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  };
}

const STEPS = [150, 300, 500, 750, 1000, 1400, 1900, 2500, 3200, 4000, 5000, 6500, 8000];

/** Liegt der Punkt in der Sonne? (Sonne über dem Gelände-Horizont in Sonnenrichtung) */
export function inSun(dem: Dem, p: Pt, sun: { alt: number; az: number }): boolean {
  if (sun.alt <= 0) return false;
  const h0 = (p[2] ?? dem(p[0], p[1]) ?? 0) + 2;
  const tanSun = Math.tan(sun.alt * RAD);
  const dx = Math.sin(sun.az * RAD), dy = Math.cos(sun.az * RAD);
  const mLat = 111320, mLng = 111320 * Math.cos(p[1] * RAD);
  for (const s of STEPS) {
    const h = dem(p[0] + (dx * s) / mLng, p[1] + (dy * s) / mLat);
    if (h !== null && (h - h0) / s > tanSun) return false;
  }
  return true;
}

/** Route etwa alle `step` Meter abtasten */
export function sampleRoute(route: Pt[], cum: number[], step: number): { p: Pt; m: number }[] {
  const out: { p: Pt; m: number }[] = [];
  let next = 0;
  for (let i = 0; i < route.length; i++) if (cum[i] >= next) { out.push({ p: route[i], m: cum[i] }); next = cum[i] + step; }
  const last = route.length - 1;
  if (out.at(-1)?.m !== cum[last]) out.push({ p: route[last], m: cum[last] });
  return out;
}
