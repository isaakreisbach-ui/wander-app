// Zustand der gerade geplanten Tour: Wegpunkte, berechnete Route, Werte, Rückgängig.
// Der Entwurf wird laufend im Gerät gespeichert, damit nach einem Neustart nichts fehlt.

import {
  cumulative, climb, walkingTimeHours, difficulty, maxGrade, type Pt, type Difficulty,
} from './geo';
import { routeSegment, straightSegment, RoutingError } from './routing';

export type Waypoint = { id: string; lng: number; lat: number };

export type RouteStats = {
  meters: number; up: number; down: number; hours: number;
  minEle: number | null; maxEle: number | null; difficulty: Difficulty;
};

const DRAFT_KEY = 'wander.plan.draft.v1';
let idCounter = 0;
const newId = () => `wp${Date.now().toString(36)}${(idCounter++).toString(36)}`;

function computeStats(route: Pt[], cum: number[]): RouteStats | null {
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

  cum = $derived(cumulative(this.route));
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
      if (d?.waypoints?.length) {
        this.waypoints = d.waypoints;
        this.followTrails = d.followTrails ?? true;
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
    this.saveDraft();
    this.recompute();
  }

  /** Zu welchem Abschnitt gehört Routenpunkt `idx`? */
  segmentOf(idx: number): number {
    let seg = 0;
    for (let i = 0; i < this.segStart.length; i++) if (this.segStart[i] <= idx) seg = i;
    return seg;
  }

  // ---------- Route berechnen ----------

  private key(a: Waypoint, b: Waypoint) {
    return `${this.followTrails ? 'r' : 's'}:${a.lng.toFixed(6)},${a.lat.toFixed(6)};${b.lng.toFixed(6)},${b.lat.toFixed(6)}`;
  }

  async recompute() {
    const gen = ++this.generation;
    this.abort?.abort();
    const ctrl = (this.abort = new AbortController());
    const wps = this.waypoints;
    this.error = null;

    if (wps.length < 2) {
      this.route = wps.length === 1 ? [[wps[0].lng, wps[0].lat]] : [];
      this.segStart = [];
      this.routing = false;
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
          errors.push(e instanceof RoutingError ? e.message : 'Keine Verbindung zum Routenserver.');
          // Ersatz: Luftlinie, damit die Tour trotzdem sichtbar ist
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
      segStart.push(Math.max(0, route.length - (route.length ? 1 : 0)));
      route.push(...(route.length ? seg.slice(1) : seg));
    }
    this.segStart = segStart;
    this.route = route;
    this.routing = false;
    if (errors.length) this.error = `${errors[0]} Dieser Abschnitt ist als Luftlinie eingezeichnet.`;
  }

  private saveDraft() {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ waypoints: this.waypoints, followTrails: this.followTrails }));
  }
}

export const planner = new Planner();
