// 3D-Flug entlang der geöffneten Tour: Gelände aus AWS Terrain Tiles (offener Datensatz,
// kostenlos, ohne Key), Kamera folgt der Route. Nur online.

import type { Map as MlMap } from 'maplibre-gl';
import { mapState, onStyleReady } from './map.svelte';
import { planner } from './planner.svelte';
import type { Pt } from './geo';

const DEM_SOURCE = 'flyover-dem';
const DEM_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png';
/** So lange dauert der Flug über die ganze Tour bei Tempo 1× (Sekunden), angepasst an die Länge */
function baseSeconds(meters: number) {
  return Math.min(120, Math.max(25, meters / 250));
}

export const SPEEDS = [0.5, 1, 2, 4] as const;

class Flyover {
  active = $state(false);
  playing = $state(false);
  /** zurückgelegter Anteil 0..1 */
  progress = $state(0);
  speed = $state<number>(1);
  exaggeration = $state(1.5);

  private raf = 0;
  private last = 0;
  private bearing: number | null = null;
  private cleanup: (() => void) | null = null;

  constructor() {
    // Bei Wechsel der Grundkarte Gelände wieder einschalten
    onStyleReady((map) => { if (this.active) this.enableTerrain(map); });
  }

  start() {
    const map = mapState.map;
    const route = planner.route;
    if (!map || route.length < 2 || this.active) return;
    this.active = true;
    this.progress = 0;
    this.bearing = null;

    // Im flachen Mittelgebirge das Gelände stärker überhöhen als in den Alpen
    const s = planner.stats;
    const relief = s && s.maxEle !== null && s.minEle !== null ? s.maxEle - s.minEle : 500;
    this.exaggeration = relief < 300 ? 2.2 : relief < 700 ? 1.7 : 1.3;

    this.enableTerrain(map);
    map.dragRotate.enable();
    map.touchZoomRotate.enableRotation();
    map.touchPitch.enable();
    map.keyboard.enableRotation();

    // Wer selbst an der Karte zieht oder dreht, pausiert den Flug
    const pauseOnUser = (e: { originalEvent?: Event }) => { if (e.originalEvent) this.pause(); };
    map.on('dragstart', pauseOnUser);
    map.on('rotatestart', pauseOnUser);
    map.on('pitchstart', pauseOnUser);
    map.on('wheel', pauseOnUser);
    this.cleanup = () => {
      map.off('dragstart', pauseOnUser);
      map.off('rotatestart', pauseOnUser);
      map.off('pitchstart', pauseOnUser);
      map.off('wheel', pauseOnUser);
    };

    // Erst zum Start fliegen, dann losfahren
    const [lng, lat] = route[0];
    map.flyTo({ center: [lng, lat], zoom: 15, pitch: 65, bearing: this.bearingAt(0), duration: 2500, essential: true });
    map.once('moveend', () => { if (this.active) this.play(); });
  }

  stop() {
    const map = mapState.map;
    this.pause();
    this.active = false;
    this.cleanup?.();
    this.cleanup = null;
    planner.hover = null;
    if (!map) return;
    try { map.setTerrain(null); } catch { /* egal */ }
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  }

  play() {
    if (!this.active || this.playing) return;
    if (this.progress >= 1) this.progress = 0;
    this.playing = true;
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
  }

  toggle() { this.playing ? this.pause() : this.play(); }

  /** An eine Stelle springen (0..1) */
  seek(p: number) {
    this.progress = Math.min(1, Math.max(0, p));
    this.bearing = null;
    this.place(true);
  }

  // ---------- intern ----------

  private enableTerrain(map: MlMap) {
    if (!map.getSource(DEM_SOURCE)) {
      map.addSource(DEM_SOURCE, {
        type: 'raster-dem', tiles: [DEM_TILES], encoding: 'terrarium', tileSize: 256, maxzoom: 14,
        attribution: 'Gelände: <a href="https://registry.opendata.aws/terrain-tiles/" target="_blank">Terrain Tiles (Mapzen/AWS)</a>',
      });
    }
    map.setTerrain({ source: DEM_SOURCE, exaggeration: this.exaggeration });
    try {
      map.setSky({ 'sky-color': '#8ec5f0', 'horizon-color': '#e8f2fb', 'fog-color': '#e8f2fb', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2 });
    } catch { /* ältere Versionen ohne Himmel */ }
  }

  private frame(t: number) {
    if (!this.playing) return;
    // Zeitbasiert – auch bei wenigen Bildern pro Sekunde stimmt das Tempo
    const dt = Math.min(0.5, (t - this.last) / 1000);
    this.last = t;
    const total = planner.cum[planner.cum.length - 1] || 1;
    this.progress = Math.min(1, this.progress + (dt * this.speed) / baseSeconds(total));
    this.place(false);
    if (this.progress >= 1) { this.pause(); return; }
    this.raf = requestAnimationFrame((tt) => this.frame(tt));
  }

  /** Kamera an die aktuelle Stelle setzen */
  private place(immediate: boolean) {
    const map = mapState.map;
    const route = planner.route, cum = planner.cum;
    if (!map || route.length < 2) return;
    const total = cum[cum.length - 1];
    const d = this.progress * total;
    const i = indexAt(cum, d);
    planner.hover = i; // gelber Punkt auf Karte + Cursor im Höhenprofil
    const pos = interpolate(route, cum, d);

    // Blickrichtung: auf einen Punkt ~250 m voraus, weich nachgeführt
    const target = this.bearingAt(d);
    if (this.bearing === null || immediate) this.bearing = target;
    else {
      let diff = ((target - this.bearing + 540) % 360) - 180;
      this.bearing = (this.bearing + diff * 0.04 + 360) % 360;
    }
    map.jumpTo({ center: pos, bearing: this.bearing, pitch: Math.max(map.getPitch(), 55) });
  }

  private bearingAt(d: number): number {
    const route = planner.route, cum = planner.cum;
    const total = cum[cum.length - 1];
    const a = interpolate(route, cum, Math.max(0, Math.min(total, d)));
    const b = interpolate(route, cum, Math.min(total, d + 250));
    if (a[0] === b[0] && a[1] === b[1]) return mapState.map?.getBearing() ?? 0;
    return bearing(a, b);
  }
}

function indexAt(cum: number[], d: number): number {
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (cum[mid] <= d) lo = mid; else hi = mid - 1;
  }
  return lo;
}

function interpolate(route: Pt[], cum: number[], d: number): [number, number] {
  const i = indexAt(cum, d);
  const j = Math.min(route.length - 1, i + 1);
  const seg = cum[j] - cum[i];
  const t = seg > 0 ? (d - cum[i]) / seg : 0;
  return [route[i][0] + (route[j][0] - route[i][0]) * t, route[i][1] + (route[j][1] - route[i][1]) * t];
}

function bearing(a: [number, number], b: [number, number]) {
  const r = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * r) * Math.cos(b[1] * r);
  const x = Math.cos(a[1] * r) * Math.sin(b[1] * r) - Math.sin(a[1] * r) * Math.cos(b[1] * r) * Math.cos((b[0] - a[0]) * r);
  return (Math.atan2(y, x) / r + 360) % 360;
}

export const flyover = new Flyover();
