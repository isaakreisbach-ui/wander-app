// GPX-Export und -Import (Standardformat, das fast alle Wander-Apps verstehen).

import type { Pt } from './geo';

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function toGpx(name: string, route: Pt[], waypoints: { lng: number; lat: number }[] = [], times?: number[]): string {
  const withTime = !!times && times.length === route.length;
  const wpts = waypoints.map((w, i) => {
    const label = i === 0 ? 'Start' : i === waypoints.length - 1 ? 'Ziel' : `Punkt ${i}`;
    return `  <wpt lat="${w.lat.toFixed(6)}" lon="${w.lng.toFixed(6)}"><name>${label}</name></wpt>`;
  });
  const trkpts = route.map((p, i) =>
    `      <trkpt lat="${p[1].toFixed(6)}" lon="${p[0].toFixed(6)}">${p[2] !== undefined ? `<ele>${p[2].toFixed(1)}</ele>` : ''}` +
    `${withTime ? `<time>${new Date(times![i]).toISOString()}</time>` : ''}</trkpt>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Wanderapp" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata><name>${esc(name)}</name><time>${new Date().toISOString()}</time></metadata>
${wpts.join('\n')}
  <trk>
    <name>${esc(name)}</name>
    <trkseg>
${trkpts.join('\n')}
    </trkseg>
  </trk>
</gpx>
`;
}

export type ParsedGpx = { name: string; points: Pt[]; times?: number[] };

/** Liest Tracks (trk) oder – falls keine vorhanden – Routen (rte) aus einer GPX-Datei */
export function parseGpx(text: string, fallbackName: string): ParsedGpx[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('Die Datei ist keine gültige GPX-Datei.');

  const read = (els: HTMLCollectionOf<Element> | Element[]): Pt[] =>
    Array.from(els).flatMap((el) => {
      const lat = parseFloat(el.getAttribute('lat') ?? '');
      const lon = parseFloat(el.getAttribute('lon') ?? '');
      if (Number.isNaN(lat) || Number.isNaN(lon)) return [];
      const eleText = el.getElementsByTagName('ele')[0]?.textContent;
      const ele = eleText ? parseFloat(eleText) : NaN;
      return [Number.isNaN(ele) ? ([lon, lat] as Pt) : ([lon, lat, ele] as Pt)];
    });

  const nameOf = (el: Element | Document) =>
    Array.from(el.getElementsByTagName('name'))[0]?.textContent?.trim() || '';
  const docName = doc.getElementsByTagName('metadata')[0] ? nameOf(doc.getElementsByTagName('metadata')[0]) : '';

  // Zeitstempel (nur wenn jeder Punkt einen hat) → dann ist es eine Aufzeichnung
  const readTimes = (els: HTMLCollectionOf<Element>): number[] | undefined => {
    const t = Array.from(els).map((el) => Date.parse(el.getElementsByTagName('time')[0]?.textContent ?? ''));
    return t.length && t.every((x) => !Number.isNaN(x)) ? t : undefined;
  };

  const out: ParsedGpx[] = [];
  for (const trk of Array.from(doc.getElementsByTagName('trk'))) {
    const els = trk.getElementsByTagName('trkpt');
    const points = read(els);
    const times = readTimes(els);
    if (points.length >= 2) out.push({ name: nameOf(trk) || docName || fallbackName, points, times: times?.length === points.length ? times : undefined });
  }
  if (!out.length) {
    for (const rte of Array.from(doc.getElementsByTagName('rte'))) {
      const points = read(rte.getElementsByTagName('rtept'));
      if (points.length >= 2) out.push({ name: nameOf(rte) || docName || fallbackName, points });
    }
  }
  if (!out.length) throw new Error('In der Datei wurde keine Strecke gefunden.');
  return out;
}

export function safeFileName(name: string) {
  return (name || 'Tour').replace(/[\\/:*?"<>|]+/g, '_').trim().slice(0, 80) || 'Tour';
}

/**
 * Datei weitergeben: Auf dem iPhone öffnet sich das Teilen-Menü (In Dateien sichern, AirDrop,
 * WhatsApp, Mail …), am PC wird die Datei heruntergeladen.
 */
export async function shareOrDownload(filename: string, content: string, mime = 'application/gpx+xml') {
  const file = new File([content], filename, { type: mime });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
