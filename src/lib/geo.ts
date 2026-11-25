// Reine Rechenfunktionen für Strecken – ohne Abhängigkeit von Karte oder UI,
// damit sie später auch für Aufzeichnung, Tagebuch und Statistik nutzbar sind.

/** [Längengrad, Breitengrad, Höhe in m (optional)] */
export type Pt = [number, number, number?];

const R = 6371008.8;
const rad = (d: number) => (d * Math.PI) / 180;

export function distance(a: Pt | [number, number], b: Pt | [number, number]): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Kumulierte Distanz in Metern für jeden Punkt */
export function cumulative(pts: Pt[]): number[] {
  const out = new Array<number>(pts.length);
  let d = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) d += distance(pts[i - 1], pts[i]);
    out[i] = d;
  }
  return out;
}

/** Auf- und Abstieg mit Schwelle (Hysterese), damit Messrauschen nicht mitgezählt wird */
export function climb(pts: Pt[], threshold = 4): { up: number; down: number } {
  let up = 0, down = 0;
  let ref: number | undefined;
  for (const p of pts) {
    const e = p[2];
    if (e === undefined || Number.isNaN(e)) continue;
    if (ref === undefined) { ref = e; continue; }
    const diff = e - ref;
    if (diff >= threshold) { up += diff; ref = e; }
    else if (diff <= -threshold) { down -= diff; ref = e; }
  }
  return { up, down };
}

/**
 * Gehzeit nach DAV/Alpenvereins-Formel (DIN 33466):
 * 4 km/h horizontal, 300 Hm/h bergauf, 500 Hm/h bergab.
 * Gesamt = größerer Wert + halber kleinerer Wert.
 */
export function walkingTimeHours(meters: number, up: number, down: number): number {
  const h = meters / 1000 / 4;
  const v = up / 300 + down / 500;
  return Math.max(h, v) + Math.min(h, v) / 2;
}

export type Difficulty = 'leicht' | 'mittel' | 'schwer';

/** Einfache Einstufung aus Länge, Höhenmetern, Gehzeit und steilstem Abschnitt */
export function difficulty(meters: number, up: number, hours: number, maxGrade: number): Difficulty {
  const km = meters / 1000;
  if (km > 20 || up > 1000 || hours > 6 || maxGrade > 45) return 'schwer';
  if (km > 10 || up > 400 || hours > 3 || maxGrade > 28) return 'mittel';
  return 'leicht';
}

/** Steilster Abschnitt in % (über mind. 100 m gemittelt, damit Ausreißer nicht zählen) */
export function maxGrade(pts: Pt[], cum: number[], window = 100): number {
  let max = 0;
  let j = 0;
  for (let i = 0; i < pts.length; i++) {
    const ei = pts[i][2];
    if (ei === undefined) continue;
    while (j < i && cum[i] - cum[j + 1] >= window) j++;
    const ej = pts[j][2];
    const d = cum[i] - cum[j];
    if (ej !== undefined && d >= window) max = Math.max(max, (Math.abs(ei - ej) / d) * 100);
  }
  return max;
}

export function formatDistance(m: number): string {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
}

export function formatDuration(hours: number): string {
  const total = Math.round(hours * 60 / 5) * 5; // auf 5 Minuten gerundet
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')} h` : `${m} min`;
}

/** Punkte entlang einer Geraden, ca. alle `step` Meter */
export function interpolate(a: [number, number], b: [number, number], step = 50): Pt[] {
  const n = Math.max(1, Math.min(99, Math.ceil(distance(a, b) / step)));
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
  }
  return out;
}
