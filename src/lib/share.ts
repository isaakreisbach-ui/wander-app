// Touren ohne Server übertragen: Die Tour steckt komplett im Link (nach dem #).
// Der Teil nach # wird nie an einen Server geschickt – auch nicht an GitHub.
//
// Inhalt: Name, Art, „Wanderwegen folgen“, Wegpunkte und eine vereinfachte Strecke mit Höhen.
// Der Empfänger berechnet geplante Touren mit BRouter exakt neu (wenn online);
// ohne Netz wird die mitgeschickte vereinfachte Strecke verwendet.

import { simplifyIndices, type Pt } from './geo';
import type { Tour } from './db';

const APP_URL = new URL(import.meta.env.BASE_URL, location.origin).href;
const VERSION = '1';
/** Maximale Länge des Tour-Teils im Link – damit der QR-Code noch gut scannbar bleibt */
const MAX_PAYLOAD = 1400;

export type SharePayload = {
  kind: 'plan' | 'track';
  name: string;
  followTrails: boolean;
  waypoints: [number, number][];
  route: Pt[];
  segStart: number[];
};

// ---------- Polyline-Kodierung (wie Google Maps), erweitert um eine Höhen-Spalte ----------

function encodeNumbers(rows: number[][], factors: number[]): string {
  let out = '';
  const prev = factors.map(() => 0);
  for (const row of rows) {
    factors.forEach((f, i) => {
      const v = Math.round(row[i] * f);
      let d = v - prev[i];
      prev[i] = v;
      d = d < 0 ? ~(d << 1) : d << 1;
      while (d >= 0x20) {
        out += String.fromCharCode((0x20 | (d & 0x1f)) + 63);
        d >>= 5;
      }
      out += String.fromCharCode(d + 63);
    });
  }
  return out;
}

function decodeNumbers(s: string, factors: number[]): number[][] {
  const rows: number[][] = [];
  const prev = factors.map(() => 0);
  let i = 0;
  while (i < s.length) {
    const row: number[] = [];
    for (let k = 0; k < factors.length; k++) {
      let shift = 0, result = 0, b: number;
      do {
        if (i >= s.length) throw new Error('kaputt');
        b = s.charCodeAt(i++) - 63;
        result |= (b & 0x1f) << shift;
        shift += 5;
      } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      prev[k] += d;
      row.push(prev[k] / factors[k]);
    }
    rows.push(row);
  }
  return rows;
}

// ---------- Base64url (UTF-8) ----------

function toB64url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

// ---------- Strecke vereinfachen, Abschnittsgrenzen bleiben erhalten ----------

function simplifyRoute(route: Pt[], segStart: number[], tolerance: number): { pts: Pt[]; seg: number[] } {
  const bounds = segStart.length ? [...segStart, route.length - 1] : [0, route.length - 1];
  const pts: Pt[] = [];
  const seg: number[] = [];
  for (let s = 0; s < bounds.length - 1; s++) {
    const piece = route.slice(bounds[s], bounds[s + 1] + 1);
    const keep = simplifyIndices(piece, tolerance);
    seg.push(pts.length ? pts.length - 1 : 0);
    keep.forEach((k, j) => {
      if (pts.length && j === 0) return; // gemeinsamer Punkt mit vorherigem Abschnitt
      pts.push(piece[k]);
    });
  }
  return { pts, seg };
}

type Shareable = Pick<Tour, 'name' | 'route' | 'segStart' | 'followTrails' | 'kind'> & {
  waypoints: { lng: number; lat: number }[];
};

/** Baut den Teilen-Link für eine Tour */
export function buildShareLink(t: Shareable): { url: string; simplified: boolean } {
  const name = (t.name || 'Tour').slice(0, 60);
  const wps = encodeNumbers(t.waypoints.map((w) => [w.lng, w.lat]), [1e5, 1e5]);
  const segStart = t.segStart.length ? t.segStart : [0];
  let tol = 3;
  for (;;) {
    const { pts, seg } = simplifyRoute(t.route, segStart, tol);
    const route = encodeNumbers(pts.map((p) => [p[0], p[1], p[2] ?? 0]), [1e5, 1e5, 1]);
    const text = [
      VERSION,
      t.kind === 'track' ? 't' : 'p',
      t.followTrails ? '1' : '0',
      encodeURIComponent(name),
      wps,
      route,
      seg.join('.'),
    ].join('\n');
    const payload = toB64url(text);
    if (payload.length <= MAX_PAYLOAD || tol > 2000) {
      return { url: `${APP_URL}#t=${payload}`, simplified: tol > 3 };
    }
    tol *= 1.5;
  }
}

/** Liest eine Tour aus einem Link (oder einem Text, der den Link enthält). null = kein Tour-Link. */
export function parseShareLink(input: string): SharePayload | null {
  const m = input.match(/#t=([A-Za-z0-9_-]+)/);
  if (!m) return null;
  try {
    const [ver, kind, follow, name, wps, route, seg] = fromB64url(m[1]).split('\n');
    if (ver !== VERSION) throw new Error('Version');
    const waypoints = decodeNumbers(wps, [1e5, 1e5]).map((r) => [r[0], r[1]] as [number, number]);
    const pts = decodeNumbers(route, [1e5, 1e5, 1]).map((r) => [r[0], r[1], r[2]] as Pt);
    // Höhe 0 bei allen Punkten = keine Höhendaten
    const hasEle = pts.some((p) => p[2] !== 0);
    if (!hasEle) pts.forEach((p) => p.splice(2, 1));
    return {
      kind: kind === 't' ? 'track' : 'plan',
      name: decodeURIComponent(name) || 'Geteilte Tour',
      followTrails: follow === '1',
      waypoints,
      route: pts,
      segStart: seg ? seg.split('.').map(Number) : [],
    };
  } catch {
    throw new Error('Dieser Link ist unvollständig oder beschädigt. Bitte den ganzen Link kopieren.');
  }
}
