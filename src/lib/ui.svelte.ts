// Welcher Bereich / welches Fenster gerade offen ist.

import type { SharePayload } from './share';
import type { Tour } from './db';

export type View = 'karte' | 'planen' | 'touren' | 'aufzeichnen' | 'info';

export type ShareSource = Pick<Tour, 'name' | 'route' | 'segStart' | 'followTrails' | 'kind'> & {
  waypoints: { lng: number; lat: number }[];
};

const desktop = window.matchMedia('(min-width: 900px)').matches;

export const ui = $state<{
  view: View;
  toast: string | null;
  /** Tour, für die gerade das Teilen-Fenster offen ist */
  share: ShareSource | null;
  /** Empfangene Tour, die auf Bestätigung wartet */
  incoming: SharePayload | null;
  /** Link, der im iPhone-Safari statt in der App geöffnet wurde */
  handoff: string | null;
  scanner: boolean;
  pasteLink: boolean;
}>({
  view: desktop ? 'planen' : 'karte',
  toast: null,
  share: null,
  incoming: null,
  handoff: null,
  scanner: false,
  pasteLink: false,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Kurze Meldung oben auf dem Bildschirm */
export function toast(text: string, ms = 3500) {
  ui.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast = null), ms);
}
