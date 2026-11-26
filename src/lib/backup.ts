// Datensicherung: alle Touren, Aufzeichnungen und Einstellungen in EINE Datei –
// zum Ablegen in iCloud/OneDrive oder zum Übertragen auf ein anderes Gerät.
// Offline-Kartenkacheln werden nicht mitgesichert (zu groß) – die lädt man neu herunter.

import { db, type Tour } from './db';
import { shareOrDownload } from './gpx';

const FORMAT = 'wanderapp-backup';
const LAST_KEY = 'wander.backup.last';

export async function createBackup() {
  const tours = await db.tours.toArray();
  const settings: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    // Einstellungen, Packlisten, Lieblingsorte … (keine großen Zwischenspeicher)
    if (k.startsWith('wander.') && !k.startsWith('wander.poi.') && !k.startsWith('wander.weather.')) settings[k] = localStorage.getItem(k)!;
  }
  const data = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), tours, settings };
  const date = new Date().toISOString().slice(0, 10);
  await shareOrDownload(`wanderapp-sicherung-${date}.json`, JSON.stringify(data), 'application/json');
  localStorage.setItem(LAST_KEY, String(Date.now()));
  return tours.length;
}

export function lastBackup(): number | null {
  const v = localStorage.getItem(LAST_KEY);
  return v ? +v : null;
}

/** Sicherung einspielen. Vorhandene Touren bleiben, gleiche Touren werden durch die neuere ersetzt. */
export async function restoreBackup(file: File): Promise<{ tours: number }> {
  const data = JSON.parse(await file.text());
  if (data?.format !== FORMAT || !Array.isArray(data.tours)) throw new Error('Das ist keine Sicherungsdatei der Wanderapp.');
  const existing = new Map((await db.tours.toArray()).map((t) => [t.id, t]));
  const toPut = (data.tours as Tour[]).filter((t) => !existing.has(t.id) || existing.get(t.id)!.updatedAt < t.updatedAt);
  await db.tours.bulkPut(toPut);
  for (const [k, v] of Object.entries(data.settings ?? {})) {
    if (k.startsWith('wander.') && !localStorage.getItem(k)) localStorage.setItem(k, v as string);
  }
  return { tours: toPut.length };
}
