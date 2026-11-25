// Welcher Bereich gerade offen ist – damit z. B. „Tour öffnen“ in der Liste zum Planen wechseln kann.

export type View = 'karte' | 'planen' | 'touren' | 'aufzeichnen' | 'info';

const desktop = window.matchMedia('(min-width: 900px)').matches;

export const ui = $state<{ view: View; toast: string | null }>({
  view: desktop ? 'planen' : 'karte',
  toast: null,
});

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/** Kurze Meldung unten auf dem Bildschirm */
export function toast(text: string, ms = 3500) {
  ui.toast = text;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (ui.toast = null), ms);
}
