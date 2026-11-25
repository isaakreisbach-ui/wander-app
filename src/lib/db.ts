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
  /** Nur bei Aufzeichnungen: Zeitstempel (ms) je Routenpunkt und Eckdaten */
  times?: number[];
  track?: { startedAt: number; endedAt: number; movingMs: number };
}

/** Laufende (noch nicht beendete) Aufzeichnung – überlebt Absturz und Neustart */
export interface Recording {
  id: string;
  startedAt: number;
  status: 'recording' | 'paused';
  /** Bewegungszeit bis zur letzten Pause */
  movingMs: number;
  /** Zeitpunkt des letzten Starts/Fortsetzens (null = pausiert) */
  lastResume: number | null;
  /** Abschnittsnummer – erhöht sich bei jeder Pause */
  seg: number;
}

export interface RecPoint {
  id?: number;
  recId: string;
  t: number;
  lng: number;
  lat: number;
  alt: number | null;
  acc: number;
  seg: number;
}

class WanderDB extends Dexie {
  tours!: Table<Tour, string>;
  recordings!: Table<Recording, string>;
  recPoints!: Table<RecPoint, number>;

  constructor() {
    super('wanderapp');
    this.version(1).stores({
      tours: 'id, kind, updatedAt, name',
    });
    this.version(2).stores({
      tours: 'id, kind, updatedAt, name',
      recordings: 'id',
      recPoints: '++id, recId',
    });
  }
}

export const db = new WanderDB();

export function newTourId() {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}
