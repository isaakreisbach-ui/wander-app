// Aktionen rund um gespeicherte Touren, die von mehreren Bereichen genutzt werden.

import { db, type Tour } from './db';
import { planner, tourFromTrack, tourFromShare } from './planner.svelte';
import { parseShareLink, type SharePayload } from './share';
import { detectPlatform, isStandalone } from './status.svelte';
import { mapState } from './map.svelte';
import { ui, toast } from './ui.svelte';
import { toGpx, parseGpx, safeFileName, shareOrDownload } from './gpx';
import type { Pt } from './geo';

export function fitRoute(route: Pt[]) {
  const map = mapState.map;
  if (!map || route.length < 2) return;
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const p of route) {
    w = Math.min(w, p[0]); e = Math.max(e, p[0]);
    s = Math.min(s, p[1]); n = Math.max(n, p[1]);
  }
  const desktop = window.matchMedia('(min-width: 900px)').matches;
  // Auf dem Handy liegt unten das Blatt über der Karte – dort mehr Abstand lassen
  const padding = desktop ? 60 : { top: 80, left: 30, right: 70, bottom: Math.round(window.innerHeight * 0.45) };
  map.fitBounds([[w, s], [e, n]], { padding, maxZoom: 16, duration: 700 });
}

/** Fragt nach, falls die aktuelle Planung ungespeicherte Änderungen hat */
export function confirmDiscard(): boolean {
  if (!planner.dirty || planner.waypoints.length === 0) return true;
  return confirm(`„${planner.name || 'Aktuelle Planung'}“ hat ungespeicherte Änderungen. Trotzdem verwerfen?`);
}

export function openTour(t: Tour) {
  if (planner.tourId !== t.id && !confirmDiscard()) return;
  planner.open(t);
  ui.view = 'planen';
  fitRoute(t.route);
}

export async function exportTour(t: Pick<Tour, 'name' | 'route'> & { waypoints: { lng: number; lat: number }[] }) {
  await shareOrDownload(`${safeFileName(t.name)}.gpx`, toGpx(t.name, t.route, t.waypoints));
}

export async function deleteTour(t: Tour) {
  if (!confirm(`„${t.name}“ wirklich löschen? Das lässt sich nicht rückgängig machen.`)) return;
  await db.tours.delete(t.id);
  if (planner.tourId === t.id) planner.newTour();
  toast('Tour gelöscht');
}

export async function renameTour(t: Tour) {
  const name = prompt('Neuer Name:', t.name)?.trim();
  if (!name || name === t.name) return;
  await db.tours.update(t.id, { name, updatedAt: Date.now() });
  if (planner.tourId === t.id) planner.name = name;
}

// ---------- Teilen per Link / QR ----------

/**
 * Text (Link, eingefügter Text, QR-Inhalt) prüfen und die Tour zum Übernehmen anbieten.
 * Gibt false zurück, wenn kein Tour-Link darin steckt.
 */
export function receiveShareText(text: string): boolean {
  let p: SharePayload | null;
  try {
    p = parseShareLink(text);
  } catch (e) {
    alert((e as Error).message);
    return true;
  }
  if (!p) return false;
  ui.incoming = p;
  return true;
}

/** Beim Start: Steckt eine Tour im Link, mit dem die App geöffnet wurde? */
export function checkLaunchLink() {
  const hash = location.hash;
  if (!hash.startsWith('#t=')) return;
  const url = location.href;
  history.replaceState(null, '', location.pathname + location.search);
  // iPhone: Safari und Homescreen-App haben getrennte Speicher → Hinweis, den Link in die App zu holen
  if (detectPlatform() === 'ios' && !isStandalone()) {
    ui.handoff = url;
    return;
  }
  receiveShareText(url);
}

/** Empfangene Tour speichern, öffnen und (bei geplanten Touren) exakt neu berechnen */
export async function acceptIncoming() {
  if (!ui.incoming) return;
  // Reine Kopie ohne Svelte-Proxy – sonst kann IndexedDB die Daten nicht speichern
  const p: SharePayload = JSON.parse(JSON.stringify(ui.incoming));
  if (!confirmDiscard()) return;
  ui.incoming = null;
  const tour = tourFromShare(p);
  await db.tours.put(tour);
  planner.open(tour);
  ui.view = 'planen';
  fitRoute(tour.route);
  if (p.kind === 'plan' && p.followTrails && navigator.onLine) {
    toast(`„${tour.name}“ gespeichert – Route wird genau berechnet …`);
    const ok = await planner.reroute();
    if (planner.tourId === tour.id) await planner.save();
    toast(ok ? `„${tour.name}“ übernommen` : `„${tour.name}“ übernommen (vereinfachte Strecke)`);
  } else {
    toast(`„${tour.name}“ übernommen`);
  }
}

/** GPX-Datei(en) einlesen: eine Strecke → direkt zum Bearbeiten öffnen, mehrere → alle speichern */
export async function importGpxFiles(files: FileList | File[]) {
  const list = Array.from(files);
  let imported = 0;
  for (const file of list) {
    try {
      const text = await file.text();
      const tracks = parseGpx(text, file.name.replace(/\.gpx$/i, ''));
      const tours = tracks.map((t) => tourFromTrack(t.name, t.points, 'gpx'));
      await db.tours.bulkPut(tours);
      imported += tours.length;
      // Eine einzelne Strecke gleich zum Ansehen/Bearbeiten öffnen
      if (list.length === 1 && tours.length === 1) {
        openTour(tours[0]);
        toast(`„${tours[0].name}“ importiert und gespeichert`);
        return;
      }
    } catch (e) {
      alert(`${file.name}: ${(e as Error).message}`);
    }
  }
  if (imported) toast(`${imported} Touren importiert`);
}
