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
  // Steilheit allein macht eine kurze Tour nicht „schwer“, kann sie aber auf „mittel“ heben
  if (km > 20 || up > 1000 || hours > 6) return 'schwer';
  if (km > 10 || up > 400 || hours > 3 || maxGrade > 30) return 'mittel';
  return 'leicht';
}

/** Steilster Abschnitt in % (über mind. 100 m gemittelt, damit Ausreißer nicht zählen) */
export function maxGrade(pts: Pt[], cum: number[], window = 200): number {
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

/**
 * Douglas-Peucker: Indizes der Punkte, die die Form der Strecke mit höchstens
 * `tolerance` Metern Abweichung beschreiben (erster und letzter Punkt immer dabei).
 */
export function simplifyIndices(pts: Pt[], tolerance: number): number[] {
  if (pts.length <= 2) return pts.map((_, i) => i);
  const lat0 = (pts[0][1] * Math.PI) / 180;
  const mx = 111320 * Math.cos(lat0), my = 110540;
  const xy = pts.map((p) => [p[0] * mx, p[1] * my]);
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = xy[a], [bx, by] = xy[b];
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let maxD = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const [px, py] = xy[i];
      let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const ex = ax + t * dx - px, ey = ay + t * dy - py;
      const d = ex * ex + ey * ey;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > tolerance * tolerance) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  keep.forEach((k, i) => { if (k) out.push(i); });
  return out;
}

/**
 * Ist dieser Abschnitt eine Luftlinie (schnurgerade, also keinem Weg gefolgt)?
 * Echte Wege weichen fast immer um mehr als ein paar Meter von der Geraden ab.
 */
export function isStraight(pts: Pt[]): boolean {
  if (pts.length < 2) return false;
  if (distance(pts[0], pts[pts.length - 1]) < 60) return false; // sehr kurze Stücke nicht markieren
  return simplifyIndices(pts, 2).length === 2;
}

/** Wenige gut verteilte Stützpunkte für eine importierte Strecke (zum späteren Bearbeiten) */
export function anchorIndices(pts: Pt[], maxCount = 25): number[] {
  let tol = 15;
  let idx = simplifyIndices(pts, tol);
  while (idx.length > maxCount && tol < 5000) {
    tol *= 1.6;
    idx = simplifyIndices(pts, tol);
  }
  return idx;
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
