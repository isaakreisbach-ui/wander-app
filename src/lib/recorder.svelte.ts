// GPS-Aufzeichnung: Start / Pause / Stopp, Bildschirm wach halten, jeder Punkt wird sofort
// in der Datenbank gesichert. Nach einem Absturz oder Neustart wird die Aufzeichnung wiederhergestellt.

import { db, newTourId, type RecPoint, type Recording, type Tour } from './db';
import { distance, type Pt } from './geo';
import { tourFromTrack } from './planner.svelte';

export type RecStatus = 'idle' | 'recording' | 'paused';

const MAX_ACCURACY = 40; // m – ungenauere Punkte werden nicht gespeichert
const MAX_SPEED = 15; // m/s – Sprünge (GPS-Ausreißer) verwerfen
const ALT_SMOOTH = 5; // gleitender Mittelwert über so viele Höhenwerte
const ALT_THRESHOLD = 5; // m Hysterese für Auf-/Abstieg aus GPS-Höhe
const GAP_WARN_MS = 60_000;

class Recorder {
  status = $state<RecStatus>('idle');
  /** true, wenn eine Aufzeichnung nach Neustart/Absturz wiederhergestellt wurde */
  restored = $state(false);
  points = $state.raw<RecPoint[]>([]);
  distance = $state(0);
  up = $state(0);
  down = $state(0);
  altitude = $state<number | null>(null);
  accuracy = $state<number | null>(null);
  /** aktuelle Position [lng, lat] – auch außerhalb der Aufzeichnung, solange GPS läuft */
  position = $state<[number, number] | null>(null);
  movingMs = $state(0);
  lastResume = $state<number | null>(null);
  now = $state(Date.now());
  wakeLock = $state<'on' | 'off' | 'unsupported'>('wakeLock' in navigator ? 'off' : 'unsupported');
  gpsError = $state<string | null>(null);
  gapWarning = $state<string | null>(null);
  startedAt = $state<number | null>(null);

  elapsedMs = $derived(this.movingMs + (this.lastResume ? Math.max(0, this.now - this.lastResume) : 0));

  private meta: Recording | null = null;
  private watchId: number | null = null;
  private tick?: ReturnType<typeof setInterval>;
  private lock: WakeLockSentinel | null = null;
  private altBuf: number[] = [];
  private altRef: number | null = null;
  private hiddenAt: number | null = null;

  constructor() {
    this.restore();
    document.addEventListener('visibilitychange', () => this.onVisibility());
  }

  // ---------- Steuerung ----------

  async start() {
    if (this.status !== 'idle') return;
    const now = Date.now();
    this.meta = { id: newTourId(), startedAt: now, status: 'recording', movingMs: 0, lastResume: now, seg: 0 };
    await db.recordings.put(this.meta);
    this.reset();
    this.startedAt = now;
    this.lastResume = now;
    this.status = 'recording';
    this.begin();
  }

  async pause() {
    if (this.status !== 'recording' || !this.meta) return;
    const now = Date.now();
    this.movingMs += now - (this.lastResume ?? now);
    this.lastResume = null;
    this.status = 'paused';
    Object.assign(this.meta, { status: 'paused', movingMs: this.movingMs, lastResume: null, seg: this.meta.seg + 1 });
    await db.recordings.put($state.snapshot(this.meta) as Recording);
    this.end();
  }

  async resume() {
    if (this.status !== 'paused' || !this.meta) return;
    const now = Date.now();
    this.lastResume = now;
    this.status = 'recording';
    this.restored = false;
    this.altRef = null;
    this.altBuf = [];
    Object.assign(this.meta, { status: 'recording', lastResume: now });
    await db.recordings.put($state.snapshot(this.meta) as Recording);
    this.begin();
  }

  /** Beenden und als Tour speichern. Gibt die gespeicherte Tour zurück (oder null, wenn zu kurz). */
  async stop(name: string): Promise<Tour | null> {
    if (this.status === 'recording') await this.pause();
    const meta = this.meta;
    const pts = this.points;
    if (!meta || pts.length < 2) {
      await this.discard();
      return null;
    }
    const smoothed = smoothAltitudes(pts);
    let route: Pt[] = pts.map((p, i) => (smoothed[i] === null ? [p.lng, p.lat] : [p.lng, p.lat, smoothed[i]!]) as Pt);
    // Höhen aus dem Geländemodell sind genauer als GPS-Höhen
    route = await correctElevation(route).catch(() => route);

    const base = tourFromTrack(name, route, 'app');
    const tour: Tour = {
      ...base,
      id: meta.id,
      kind: 'track',
      createdAt: meta.startedAt,
      times: pts.map((p) => p.t),
      track: { startedAt: meta.startedAt, endedAt: pts[pts.length - 1].t, movingMs: this.movingMs },
    };
    await db.tours.put(tour);
    await this.clearStorage(meta.id);
    this.reset();
    this.meta = null;
    this.status = 'idle';
    this.restored = false;
    return tour;
  }

  async discard() {
    this.end();
    if (this.meta) await this.clearStorage(this.meta.id);
    this.meta = null;
    this.reset();
    this.status = 'idle';
    this.restored = false;
  }

  // ---------- GPS ----------

  private begin() {
    this.gpsError = null;
    if (!('geolocation' in navigator)) {
      this.gpsError = 'Dieses Gerät hat kein GPS.';
      return;
    }
    this.watchId = navigator.geolocation.watchPosition(
      (pos) => this.onPosition(pos),
      (err) => {
        this.gpsError = err.code === 1
          ? 'Standort nicht erlaubt. iPhone: Einstellungen → Datenschutz & Sicherheit → Ortungsdienste → Safari-Websites → „Beim Verwenden der App“.'
          : err.code === 3 ? 'Suche GPS-Signal …' : 'GPS gerade nicht verfügbar.';
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30000 },
    );
    this.tick = setInterval(() => (this.now = Date.now()), 1000);
    this.requestWakeLock();
  }

  private end() {
    if (this.watchId !== null) navigator.geolocation.clearWatch(this.watchId);
    this.watchId = null;
    clearInterval(this.tick);
    this.now = Date.now();
    this.releaseWakeLock();
  }

  private onPosition(pos: GeolocationPosition) {
    const c = pos.coords;
    this.gpsError = null;
    this.position = [c.longitude, c.latitude];
    this.accuracy = c.accuracy;
    if (c.altitude !== null) this.altitude = Math.round(c.altitude);
    if (this.status !== 'recording' || !this.meta) return;
    if (c.accuracy > MAX_ACCURACY) return;

    const p: RecPoint = {
      recId: this.meta.id,
      t: pos.timestamp || Date.now(),
      lng: c.longitude,
      lat: c.latitude,
      alt: c.altitude,
      acc: c.accuracy,
      seg: this.meta.seg,
    };

    const last = this.points[this.points.length - 1];
    if (last) {
      const d = distance([last.lng, last.lat], [p.lng, p.lat]);
      const dt = Math.max(1, (p.t - last.t) / 1000);
      if (last.seg === p.seg) {
        // zu nah am letzten Punkt → nicht speichern (spart Speicher), außer nach längerer Zeit
        if (d < Math.max(5, c.accuracy * 0.5) && dt < 30) return;
        if (d / dt > MAX_SPEED) return;
        this.distance += d;
      }
    }

    if (p.alt !== null) this.addAltitude(p.alt);
    this.points = [...this.points, p];
    db.recPoints.add(p).catch((e) => console.error('Punkt konnte nicht gespeichert werden', e));
  }

  private addAltitude(alt: number) {
    this.altBuf.push(alt);
    if (this.altBuf.length > ALT_SMOOTH) this.altBuf.shift();
    const avg = this.altBuf.reduce((a, b) => a + b, 0) / this.altBuf.length;
    if (this.altRef === null) { this.altRef = avg; return; }
    const diff = avg - this.altRef;
    if (diff >= ALT_THRESHOLD) { this.up += diff; this.altRef = avg; }
    else if (diff <= -ALT_THRESHOLD) { this.down -= diff; this.altRef = avg; }
  }

  // ---------- Bildschirm wach halten ----------

  private async requestWakeLock() {
    if (!('wakeLock' in navigator)) { this.wakeLock = 'unsupported'; return; }
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.wakeLock = 'on';
      this.lock.addEventListener('release', () => { this.wakeLock = 'off'; });
    } catch {
      this.wakeLock = 'off';
    }
  }

  private releaseWakeLock() {
    this.lock?.release().catch(() => {});
    this.lock = null;
    if (this.wakeLock !== 'unsupported') this.wakeLock = 'off';
  }

  private onVisibility() {
    if (this.status !== 'recording') return;
    if (document.visibilityState === 'hidden') {
      this.hiddenAt = Date.now();
    } else {
      if (this.hiddenAt && Date.now() - this.hiddenAt > GAP_WARN_MS) {
        const min = Math.round((Date.now() - this.hiddenAt) / 60000);
        this.gapWarning = `Die App war ${min} min nicht im Vordergrund – in dieser Zeit hat iOS das GPS angehalten. Die Lücke wird als gerade Linie verbunden.`;
      }
      this.hiddenAt = null;
      this.requestWakeLock(); // Wake Lock geht beim Verlassen der App verloren
    }
  }

  // ---------- Speicher / Wiederherstellen ----------

  private reset() {
    this.points = [];
    this.distance = 0;
    this.up = 0;
    this.down = 0;
    this.movingMs = 0;
    this.lastResume = null;
    this.startedAt = null;
    this.altBuf = [];
    this.altRef = null;
    this.gapWarning = null;
  }

  private async clearStorage(recId: string) {
    await db.recPoints.where('recId').equals(recId).delete();
    await db.recordings.delete(recId);
  }

  private async restore() {
    try {
      const meta = await db.recordings.toCollection().first();
      if (!meta) return;
      const pts = await db.recPoints.where('recId').equals(meta.id).sortBy('id');
      this.reset();
      this.meta = meta;
      this.startedAt = meta.startedAt;
      // War die Aufzeichnung beim Absturz aktiv, zählt die Zeit bis zum letzten Punkt
      let moving = meta.movingMs;
      if (meta.lastResume && pts.length) moving += Math.max(0, pts[pts.length - 1].t - meta.lastResume);
      this.movingMs = moving;
      for (let i = 0; i < pts.length; i++) {
        const p = pts[i], prev = pts[i - 1];
        if (prev && prev.seg === p.seg) this.distance += distance([prev.lng, prev.lat], [p.lng, p.lat]);
        if (p.alt !== null) this.addAltitude(p.alt);
      }
      this.points = pts;
      Object.assign(meta, { status: 'paused', movingMs: moving, lastResume: null, seg: meta.seg + 1 });
      await db.recordings.put(meta);
      this.status = 'paused';
      this.restored = true;
    } catch (e) {
      console.error('Wiederherstellen fehlgeschlagen', e);
    }
  }
}

/** GPS-Höhen glätten (gleitender Mittelwert über 7 Punkte) */
function smoothAltitudes(pts: RecPoint[]): (number | null)[] {
  return pts.map((_, i) => {
    let sum = 0, n = 0;
    for (let j = Math.max(0, i - 3); j <= Math.min(pts.length - 1, i + 3); j++) {
      const a = pts[j].alt;
      if (a !== null) { sum += a; n++; }
    }
    return n ? Math.round(sum / n) : null;
  });
}

/**
 * Höhen nachträglich aus dem Geländemodell holen (Open-Meteo, max. 1000 Stützstellen),
 * dazwischen wird interpoliert. Ohne Internet bleiben die GPS-Höhen.
 */
export async function correctElevation(route: Pt[]): Promise<Pt[]> {
  if (!navigator.onLine || route.length < 2) return route;
  const step = Math.max(1, Math.ceil(route.length / 1000));
  const idx: number[] = [];
  for (let i = 0; i < route.length; i += step) idx.push(i);
  if (idx[idx.length - 1] !== route.length - 1) idx.push(route.length - 1);

  const ele: number[] = [];
  for (let k = 0; k < idx.length; k += 100) {
    const chunk = idx.slice(k, k + 100);
    const url = 'https://api.open-meteo.com/v1/elevation?latitude=' +
      chunk.map((i) => route[i][1].toFixed(5)).join(',') + '&longitude=' + chunk.map((i) => route[i][0].toFixed(5)).join(',');
    const res = await fetch(url);
    if (!res.ok) throw new Error('Höhen nicht verfügbar');
    ele.push(...((await res.json()).elevation as number[]));
  }
  const out = route.map((p) => [p[0], p[1], p[2]] as Pt);
  for (let k = 0; k < idx.length - 1; k++) {
    const a = idx[k], b = idx[k + 1];
    for (let i = a; i <= b; i++) {
      const t = b === a ? 0 : (i - a) / (b - a);
      out[i][2] = Math.round((ele[k] + (ele[k + 1] - ele[k]) * t) * 10) / 10;
    }
  }
  return out;
}

export const recorder = new Recorder();

export function formatClock(ms: number) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
