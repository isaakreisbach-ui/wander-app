// Lokale Datenbank (IndexedDB) – alle Touren bleiben nur auf diesem Gerät.
// Neue Tabellen (z. B. Tagebuch in Version 2) werden mit einer neuen `version(n)` ergänzt;
// bestehende Daten bleiben dabei erhalten.

import { Dexie, type Table } from 'dexie';
import type { Pt, Difficulty } from './geo';

export type Waypoint = { id: string; lng: number; lat: number };

export type TourStats = {
  meters: number; up: number; down: number; hours: number;
  minEle: number | null; maxEle: number | null; difficulty: Difficulty;
};

/** 'plan' = geplante Tour, 'track' = aufgezeichnete Tour (kommt mit der Aufzeichnung) */
export type TourKind = 'plan' | 'track';

export interface Tour {
  id: string;
  kind: TourKind;
  name: string;
  createdAt: number;
  updatedAt: number;
  waypoints: Waypoint[];
  followTrails: boolean;
  route: Pt[];
  /** Index in `route`, an dem Abschnitt i beginnt */
  segStart: number[];
  stats: TourStats | null;
  /** Startpunkt [lng, lat] – z. B. für Wetter und „Touren in der Nähe“ */
  start: [number, number] | null;
  source: 'app' | 'gpx' | 'link';
  /** Für später: geplanter Tag (YYYY-MM-DD), Notizen fürs Tagebuch */
  plannedFor?: string;
  notes?: string;
}

class WanderDB extends Dexie {
  tours!: Table<Tour, string>;

  constructor() {
    super('wanderapp');
    this.version(1).stores({
      tours: 'id, kind, updatedAt, name',
    });
  }
}

export const db = new WanderDB();

export function newTourId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
