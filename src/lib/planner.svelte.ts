// Zustand der gerade geplanten Tour: Wegpunkte, berechnete Route, Werte, Rückgängig, Speichern.
// Der Entwurf wird laufend im Gerät gespeichert, damit nach einem Neustart nichts fehlt.

import {
  cumulative, climb, walkingTimeHours, difficulty, maxGrade, anchorIndices, isStraight, gradeClasses, type Pt,
} from './geo';
import { routeSegment, straightSegment, RoutingError } from './routing';
import { db, newTourId, type Tour, type TourStats, type Waypoint } from './db';

export type { Waypoint };

const DRAFT_KEY = 'wander.plan.draft.v2';
let idCounter = 0;
const newId = () => `wp${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function computeStats(route: Pt[], cum: number[]): TourStats | null {
  if (route.length < 2) return null;
  const meters = cum[cum.length - 1];
  const { up, down } = climb(route);
  const hours = walkingTimeHours(meters, up, down);
  let minEle: number | null = null, maxEle: number | null = null;
  for (const p of route) {
    const e = p[2];
    if (e === undefined) continue;
    minEle = minEle === null ? e : Math.min(minEle, e);
    maxEle = maxEle === null ? e : Math.max(maxEle, e);
  }
  return { meters, up, down, hours, minEle, maxEle, difficulty: difficulty(meters, up, hours, maxGrade(route, cum)) };
}

/**
 * Fremde Strecke (GPX, Link) als Tour anlegen: wenige Stützpunkte werden zu Wegpunkten,
 * die Original-Strecke bleibt zwischen ihnen erhalten, bis man etwas ändert.
 */
export function tourFromTrack(name: string, points: Pt[], source: Tour['source']): Tour {
  const idx = anchorIndices(points);
  const now = Date.now();
  return {
    id: newTourId(),
    kind: 'plan',
    name,
    createdAt: now,
    updatedAt: now,
    waypoints: idx.map((i) => ({ id: newId(), lng: points[i][0], lat: points[i][1] })),
    followTrails: true,
    route: points,
    segStart: idx.slice(0, -1),
    stats: computeStats(points, cumulative(points)),
    start: [points[0][0], points[0][1]],
    source,
  };
}

/** Tour aus einem Teilen-Link anlegen */
export function tourFromShare(p: {
  kind: Tour['kind']; name: string; followTrails: boolean;
  waypoints: [number, number][]; route: Pt[]; segStart: number[];
}): Tour {
  const now = Date.now();
  return {
    id: newTourId(),
    kind: p.kind,
    name: p.name,
    createdAt: now,
    updatedAt: now,
    waypoints: p.waypoints.map(([lng, lat]) => ({ id: newId(), lng, lat })),
    followTrails: p.followTrails,
    route: p.route,
    segStart: p.segStart,
    stats: computeStats(p.route, cumulative(p.route)),
    start: p.route.length ? [p.route[0][0], p.route[0][1]] : null,
    source: 'link',
  };
}

export function defaultTourName() {
  return `Tour vom ${new Date().toLocaleDateString('de-DE')}`;
}

class Planner {
  /** true, solange der Bereich „Planen“ offen ist – nur dann setzt ein Klick in die Karte Punkte */
  active = $state(false);
  waypoints = $state.raw<Waypoint[]>([]);
  followTrails = $state(true);
  routing = $state(false);
  error = $state<string | null>(null);
  route = $state.raw<Pt[]>([]);
  /** Index in `route`, an dem Abschnitt i (zwischen Wegpunkt i und i+1) beginnt */
  segStart = $state.raw<number[]>([]);
  /** Index des Routenpunkts, über dem Maus/Finger gerade im Profil oder auf der Karte ist */
  hover = $state<number | null>(null);

  /** Gespeicherte Tour, die gerade bearbeitet wird (null = neue, noch nicht gespeicherte Tour) */
  tourId = $state<string | null>(null);
  name = $state('');
  dirty = $state(false);
  private meta: (Pick<Tour, 'createdAt' | 'source' | 'plannedFor' | 'notes' | 'times' | 'track'> & { kind?: Tour['kind'] }) | null = null;
  /** Art der geöffneten Tour (geplant oder aufgezeichnet) */
  get kind(): Tour['kind'] { return this.meta?.kind ?? 'plan'; }

  cum = $derived(cumulative(this.route));
  /** Steilheit je Routenpunkt (für die farbige Anzeige) */
  grades = $derived(gradeClasses(this.route, this.cum));
  /** Je Abschnitt: true = Luftlinie (kein Weg), false = folgt einem Weg */
  // (bei Aufzeichnungen nie – dort ist man die Strecke ja tatsächlich gegangen)
  straight = $derived(this.segmentPieces().map((p) => this.kind !== 'track' && isStraight(p)));

  /** Die Route in Abschnitte zwischen den Wegpunkten zerlegt */
  segmentPieces(): Pt[][] {
    const r = this.route, s = this.segStart;
    if (r.length < 2) return [];
    if (!s.length) return [r];
    return s.map((from, i) => r.slice(from, (i + 1 < s.length ? s[i + 1] : r.length - 1) + 1));
  }
  stats = $derived(computeStats(this.route, this.cum));

  canUndo = $state(false);
  canRedo = $state(false);

  private undoStack: Waypoint[][] = [];
  private redoStack: Waypoint[][] = [];
  private cache = new Map<string, Pt[]>();
  private generation = 0;
  private abort?: AbortController;

  constructor() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (d) {
        this.waypoints = d.waypoints ?? [];
        this.followTrails = d.followTrails ?? true;
        this.tourId = d.tourId ?? null;
        this.name = d.name ?? '';
        this.dirty = d.dirty ?? false;
        this.meta = d.meta ?? null;
        if (d.route?.length && d.segStart) this.seed(this.waypoints, d.route, d.segStart);
        queueMicrotask(() => this.recompute());
      }
    } catch { /* kaputter Entwurf – ignorieren */ }
  }

  // ---------- Bearbeiten ----------

  private commit(next: Waypoint[]) {
    this.undoStack.push(this.waypoints);
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.apply(next);
  }

  private apply(next: Waypoint[]) {
    this.waypoints = next;
    this.dirty = true;
    this.canUndo = this.undoStack.length > 0;
    this.canRedo = this.redoStack.length > 0;
    this.saveDraft();
    this.recompute();
  }

  add(lng: number, lat: number) {
    this.commit([...this.waypoints, { id: newId(), lng, lat }]);
  }

  prepend(lng: number, lat: number) {
    this.commit([{ id: newId(), lng, lat }, ...this.waypoints]);
  }

  /** Neuen Punkt in Abschnitt `seg` einfügen (zwischen Wegpunkt seg und seg+1) */
  insert(seg: number, lng: number, lat: number) {
    const next = [...this.waypoints];
    next.splice(seg + 1, 0, { id: newId(), lng, lat });
    this.commit(next);
  }

  move(id: string, lng: number, lat: number) {
    this.commit(this.waypoints.map((w) => (w.id === id ? { ...w, lng, lat } : w)));
  }

  remove(id: string) {
    this.commit(this.waypoints.filter((w) => w.id !== id));
  }

  reverse() {
    if (this.waypoints.length < 2) return;
    this.commit([...this.waypoints].reverse());
  }

  clear() {
    if (!this.waypoints.length) return;
    this.commit([]);
  }

  undo() {
    const prev = this.undoStack.pop();
    if (!prev) return;
    this.redoStack.push(this.waypoints);
    this.apply(prev);
  }

  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push(this.waypoints);
    this.apply(next);
  }

  setFollowTrails(v: boolean) {
    this.followTrails = v;
    this.dirty = true;
    this.saveDraft();
    this.recompute();
  }

  setName(v: string) {
    this.name = v;
    this.dirty = true;
    this.saveDraft();
  }

  /** Zu welchem Abschnitt gehört Routenpunkt `idx`? */
  segmentOf(idx: number): number {
    let seg = 0;
    for (let i = 0; i < this.segStart.length; i++) if (this.segStart[i] <= idx) seg = i;
    return seg;
  }

  // ---------- Neu / Öffnen / Speichern ----------

  private reset() {
    this.abort?.abort();
    this.generation++;
    this.undoStack = [];
    this.redoStack = [];
    this.canUndo = this.canRedo = false;
    this.error = null;
    this.routing = false;
    this.hover = null;
  }

  newTour() {
    this.reset();
    this.waypoints = [];
    this.route = [];
    this.segStart = [];
    this.tourId = null;
    this.name = '';
    this.meta = null;
    this.dirty = false;
    this.saveDraft();
  }

  /**
   * Neue Planung aus fertigen Punkten anlegen (z. B. Gipfel-Vorschlag „Start → Gipfel → Start“).
   * `known` sind bereits berechnete Abschnitte, die nicht erneut geroutet werden müssen.
   */
  newPlanFrom(name: string, points: [number, number][], known: { a: [number, number]; b: [number, number]; pts: Pt[] }[] = []) {
    this.reset();
    this.followTrails = true;
    const wp = (p: [number, number]) => ({ id: '', lng: p[0], lat: p[1] });
    for (const k of known) this.cache.set(this.key(wp(k.a), wp(k.b), true), k.pts);
    this.waypoints = points.map(([lng, lat]) => ({ id: newId(), lng, lat }));
    this.route = [];
    this.segStart = [];
    this.tourId = null;
    this.name = name;
    this.meta = null;
    this.dirty = true;
    this.saveDraft();
    this.recompute();
  }

  /** Gespeicherte Tour zum Bearbeiten öffnen – ohne neu zu routen */
  open(t: Tour) {
    this.reset();
    this.followTrails = t.followTrails;
    this.seed(t.waypoints, t.route, t.segStart);
    this.waypoints = t.waypoints;
    this.route = t.route;
    this.segStart = t.segStart;
    this.tourId = t.id;
    this.name = t.name;
    this.meta = {
      createdAt: t.createdAt, source: t.source, plannedFor: t.plannedFor, notes: t.notes,
      kind: t.kind, times: t.times, track: t.track,
    };
    this.dirty = false;
    this.saveDraft();
  }

  /** Speichert die Tour. `asNew` legt eine Kopie an, statt die bestehende zu überschreiben. */
  async save(asNew = false): Promise<Tour> {
    const now = Date.now();
    const id = !asNew && this.tourId ? this.tourId : newTourId();
    const name = this.name.trim() || defaultTourName();
    // Eine Aufzeichnung bleibt eine Aufzeichnung, solange die Strecke nicht verändert wurde
    const m = this.meta;
    const isTrack = m?.kind === 'track' && !!m.times && m.times.length === this.route.length;
    const tour: Tour = {
      id,
      kind: isTrack ? 'track' : 'plan',
      times: isTrack ? m!.times : undefined,
      track: isTrack ? m!.track : undefined,
      name,
      createdAt: !asNew && this.meta?.createdAt ? this.meta.createdAt : now,
      updatedAt: now,
      waypoints: $state.snapshot(this.waypoints) as Waypoint[],
      followTrails: this.followTrails,
      route: $state.snapshot(this.route) as Pt[],
      segStart: [...this.segStart],
      stats: this.stats ? { ...this.stats } : null,
      start: this.waypoints.length ? [this.waypoints[0].lng, this.waypoints[0].lat] : null,
      source: this.meta?.source ?? 'app',
      plannedFor: this.meta?.plannedFor,
      notes: this.meta?.notes,
    };
    await db.tours.put(tour);
    this.tourId = id;
    this.name = name;
    this.meta = {
      createdAt: tour.createdAt, source: tour.source, plannedFor: tour.plannedFor, notes: tour.notes,
      kind: tour.kind, times: tour.times, track: tour.track,
    };
    this.dirty = false;
    this.saveDraft();
    return tour;
  }

  // ---------- Route berechnen ----------

  private key(a: Waypoint, b: Waypoint, follow = this.followTrails) {
    return `${follow ? 'r' : 's'}:${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}`;
  }

  /** Bekannte Abschnitte in den Zwischenspeicher legen, damit nicht neu geroutet wird */
  private seed(wps: Waypoint[], route: Pt[], segStart: number[]) {
    for (let i = 0; i < wps.length - 1; i++) {
      const from = segStart[i];
      const to = i + 1 < segStart.length ? segStart[i + 1] : route.length - 1;
      if (from === undefined || to === undefined || to <= from) continue;
      this.cache.set(this.key(wps[i], wps[i + 1]), route.slice(from, to + 1));
    }
  }

  /**
   * Alle Abschnitte neu mit BRouter berechnen (z. B. nach Empfang per Link, wo nur eine
   * vereinfachte Strecke mitkam). Klappt das nicht, bleibt die bisherige Strecke stehen.
   * Gibt true zurück, wenn alles neu berechnet werden konnte.
   */
  async reroute(): Promise<boolean> {
    const prior = new Map(this.cache);
    this.cache.clear();
    await this.recompute(prior);
    return !this.error;
  }

  async recompute(prior?: Map<string, Pt[]>) {
    const gen = ++this.generation;
    this.abort?.abort();
    const ctrl = (this.abort = new AbortController());
    const wps = this.waypoints;
    this.error = null;

    if (wps.length < 2) {
      this.route = wps.length === 1 ? [[wps[0].lng, wps[0].lat]] : [];
      this.segStart = [];
      this.routing = false;
      this.saveDraft();
      return;
    }

    const pairs = wps.slice(1).map((b, i) => [wps[i], b] as const);
    const missing = pairs.filter(([a, b]) => !this.cache.has(this.key(a, b)));
    if (missing.length) this.routing = true;

    const errors: string[] = [];
    // Ersatz-Luftlinien nur für diese Berechnung – nicht cachen, damit es beim nächsten Mal neu versucht wird
    const fallback = new Map<string, Pt[]>();
    // höchstens 3 Anfragen gleichzeitig – schont den kostenlosen Server
    const queue = [...missing];
    const worker = async () => {
      for (let p = queue.shift(); p; p = queue.shift()) {
        const [a, b] = p;
        const k = this.key(a, b);
        try {
          const seg = this.followTrails
            ? await routeSegment([a.lng, a.lat], [b.lng, b.lat], ctrl.signal)
            : await straightSegment([a.lng, a.lat], [b.lng, b.lat], ctrl.signal);
          this.cache.set(k, seg);
        } catch (e) {
          if ((e as Error).name === 'AbortError') return;
          const old = prior?.get(k);
          if (old) {
            // bisherige Strecke behalten
            this.cache.set(k, old);
            errors.push('Route konnte nicht neu berechnet werden – die mitgeschickte Strecke wird verwendet.');
            continue;
          }
          errors.push(
            e instanceof RoutingError ? e.message
              : navigator.onLine ? 'Keine Verbindung zum Routenserver.' : 'Ohne Internet kann keine Route berechnet werden.',
          );
          fallback.set(k, await straightSegment([a.lng, a.lat], [b.lng, b.lat], ctrl.signal).catch(() => [[a.lng, a.lat], [b.lng, b.lat]] as Pt[]));
        }
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    if (gen !== this.generation) return;

    const route: Pt[] = [];
    const segStart: number[] = [];
    for (const [a, b] of pairs) {
      const k = this.key(a, b);
      const seg = this.cache.get(k) ?? fallback.get(k) ?? [[a.lng, a.lat], [b.lng, b.lat]];
      segStart.push(route.length ? route.length - 1 : 0);
      route.push(...(route.length ? seg.slice(1) : seg));
    }
    this.segStart = segStart;
    this.route = route;
    this.routing = false;
    if (errors.length) {
      this.error = errors[0].includes('mitgeschickte') ? errors[0] : `${errors[0]} Dieser Abschnitt ist als Luftlinie eingezeichnet.`;
    }
    this.saveDraft();
  }

  private saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        waypoints: this.waypoints, followTrails: this.followTrails,
        tourId: this.tourId, name: this.name, dirty: this.dirty, meta: this.meta,
        route: this.route, segStart: this.segStart,
      }));
    } catch {
      // Speicher voll (sehr lange Route) – dann nur die Wegpunkte merken
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        waypoints: this.waypoints, followTrails: this.followTrails,
        tourId: this.tourId, name: this.name, dirty: this.dirty, meta: this.meta,
      }));
    }
  }
}

export const planner = new Planner();
