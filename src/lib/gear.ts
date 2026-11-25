// Ausrüstungs-Empfehlung für eine Tour – abgeleitet aus Länge, Höhenmetern, Schwierigkeit,
// Höhenlage, Jahreszeit und (falls geladen) dem Wetter am gewählten Tag.
// Das sind Faustregeln, keine Garantie – sie ersetzen nicht den eigenen Blick aufs Gelände.

import type { TourStats } from './db';
import type { DayForecast, Hint } from './weather';

export type GearLevel = 'must' | 'recommended' | 'optional';
export type GearGroup = 'Kleidung' | 'Ausrüstung' | 'Essen & Trinken' | 'Sicherheit';

export type GearItem = {
  id: string;
  icon: string;
  name: string;
  why: string;
  level: GearLevel;
  group: GearGroup;
};

export type GearWeather = {
  day: DayForecast;
  /** kältester / wärmster / windigster Wert über Start und Gipfel */
  tMin: number;
  tMax: number;
  gusts: number;
  precip: number;
  precipProb: number | null;
  hints: Hint[];
};

export function recommendGear(stats: TourStats, wx: GearWeather | null, date = new Date()): GearItem[] {
  const items: GearItem[] = [];
  const add = (i: GearItem) => items.push(i);
  const km = stats.meters / 1000;
  const hours = stats.hours;
  const up = stats.up;
  const maxEle = stats.maxEle ?? 0;
  const month = (wx ? new Date(wx.day.date + 'T12:00') : date).getMonth() + 1;
  const winter = month <= 3 || month >= 11;
  const summer = month >= 6 && month <= 8;
  const alpine = maxEle >= 1500;
  const hard = stats.difficulty === 'schwer';
  const has = (key: string) => wx?.hints.some((h) => h.text.toLowerCase().includes(key)) ?? false;

  // ---------- Kleidung ----------
  if (hard || alpine || up > 600) {
    add({ id: 'boots', icon: '🥾', name: 'Knöchelhohe Wanderschuhe', why: alpine ? 'Alpines Gelände, oft steinig' : `${Math.round(up)} Hm – guter Halt bergab`, level: 'must', group: 'Kleidung' });
  } else {
    add({ id: 'boots', icon: '👟', name: 'Wander- oder Trailschuhe', why: 'Feste Sohle mit Profil reicht hier', level: 'must', group: 'Kleidung' });
  }
  add({
    id: 'rainjacket', icon: '🧥', name: 'Regenjacke',
    why: wx && (wx.precipProb ?? 0) >= 40 ? `Regenwahrscheinlichkeit ${wx.precipProb} %` : 'Gehört immer in den Rucksack – auch als Windschutz',
    level: 'must', group: 'Kleidung',
  });
  if (wx && ((wx.precipProb ?? 0) >= 60 || wx.precip >= 5)) {
    add({ id: 'rainpants', icon: '👖', name: 'Regenhose', why: `${Math.round(wx.precip)} mm Regen erwartet`, level: 'recommended', group: 'Kleidung' });
  }
  const cold = wx ? wx.tMin <= 10 : winter || alpine;
  if (cold || alpine) {
    add({ id: 'fleece', icon: '🧶', name: 'Warme Zwischenschicht (Fleece)', why: wx ? `Morgens nur ${Math.round(wx.tMin)} °C` : alpine ? 'Oben deutlich kälter als im Tal' : 'Kühle Jahreszeit', level: 'must', group: 'Kleidung' });
  }
  if ((wx && wx.tMin <= 3) || (winter && !wx)) {
    add({ id: 'hat', icon: '🧤', name: 'Mütze und Handschuhe', why: wx ? `Bis ${Math.round(wx.tMin)} °C${wx.gusts >= 40 ? ', dazu Wind' : ''}` : 'Winter', level: 'must', group: 'Kleidung' });
  }
  if (hours > 4) {
    add({ id: 'shirt', icon: '👕', name: 'Wechselshirt', why: 'Nach dem Aufstieg trocken weiter', level: 'optional', group: 'Kleidung' });
  }
  if (has('schnee')) {
    add({ id: 'gaiters', icon: '❄️', name: 'Gamaschen', why: 'Schneefall angesagt', level: 'recommended', group: 'Kleidung' });
  }

  // ---------- Ausrüstung ----------
  const liters = Math.max(10, Math.round((hours <= 3 ? 15 : hours <= 6 ? 25 : 30) / 5) * 5);
  add({ id: 'pack', icon: '🎒', name: `Rucksack ${liters === 15 ? '10–20' : liters === 25 ? '20–30' : '30–40'} l`, why: `Für ca. ${Math.round(hours * 10) / 10} h unterwegs`, level: 'must', group: 'Ausrüstung' });
  if (up > 500 || stats.down > 500 || hard) {
    add({ id: 'poles', icon: '🦯', name: 'Wanderstöcke', why: `${Math.round(Math.max(up, stats.down))} Hm – schont die Knie bergab`, level: up > 900 ? 'must' : 'recommended', group: 'Ausrüstung' });
  }
  if (has('glätte') || (has('frost') && winter)) {
    add({ id: 'spikes', icon: '⛓️', name: 'Grödel / Schuhspikes', why: 'Vereiste Wege möglich', level: has('glätte') ? 'must' : 'recommended', group: 'Ausrüstung' });
  }
  if (summer || alpine || (wx && wx.day.code <= 1)) {
    add({ id: 'sun', icon: '🕶️', name: 'Sonnenbrille, Sonnencreme, Kappe', why: alpine ? 'Starke UV-Strahlung in der Höhe' : 'Sonniger Tag', level: alpine ? 'must' : 'recommended', group: 'Ausrüstung' });
  }
  if (month >= 3 && month <= 10 && !alpine) {
    add({ id: 'ticks', icon: '🕷️', name: 'Zeckenschutz & lange Hose', why: 'Zeckensaison – im Taunus Risikogebiet', level: 'recommended', group: 'Ausrüstung' });
  }
  add({ id: 'phone', icon: '📱', name: hours > 3 ? 'Handy + Powerbank' : 'Handy (geladen)', why: hours > 3 ? 'GPS-Aufzeichnung braucht viel Akku' : 'Für Karte und Notruf', level: 'must', group: 'Ausrüstung' });

  // Tageslicht: reicht es?
  if (wx) {
    const daylight = (Date.parse(wx.day.sunset) - Date.parse(wx.day.sunrise)) / 3600000;
    if (hours + 1 > daylight - 2 || winter) {
      add({ id: 'lamp', icon: '🔦', name: 'Stirnlampe', why: `Sonnenuntergang ${wx.day.sunset.slice(11, 16)} Uhr – früh starten`, level: hours + 1 > daylight - 2 ? 'must' : 'recommended', group: 'Ausrüstung' });
    }
  } else if (winter || hours > 6) {
    add({ id: 'lamp', icon: '🔦', name: 'Stirnlampe', why: winter ? 'Im Winter wird es früh dunkel' : 'Lange Tour', level: 'recommended', group: 'Ausrüstung' });
  }

  // ---------- Essen & Trinken ----------
  let water = Math.max(0.5, Math.round(hours * 0.5 * 2) / 2);
  if (wx && wx.tMax >= 25) water = Math.round(water * 1.5 * 2) / 2;
  add({ id: 'water', icon: '💧', name: `Wasser: ca. ${water.toLocaleString('de-DE')} l`, why: wx && wx.tMax >= 25 ? `Warm (${Math.round(wx.tMax)} °C) – mehr trinken` : '½ l pro Stunde Gehzeit', level: 'must', group: 'Essen & Trinken' });
  if (hours >= 2) {
    add({ id: 'food', icon: '🥪', name: hours > 4 ? 'Proviant (Brotzeit + Snacks)' : 'Snacks (Riegel, Nüsse, Obst)', why: `${km.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km – Energie nachlegen`, level: hours > 4 ? 'must' : 'recommended', group: 'Essen & Trinken' });
  }
  if (cold && hours > 2) {
    add({ id: 'thermos', icon: '☕', name: 'Thermoskanne mit Tee', why: 'Wärmt bei kaltem Wetter', level: 'optional', group: 'Essen & Trinken' });
  }

  // ---------- Sicherheit ----------
  add({ id: 'firstaid', icon: '🩹', name: 'Erste-Hilfe-Set (Pflaster, Blasenpflaster)', why: 'Kleines Set reicht', level: hours > 2 || hard ? 'must' : 'recommended', group: 'Sicherheit' });
  if (alpine || hard || winter) {
    add({ id: 'blanket', icon: '🛟', name: 'Rettungsdecke', why: alpine ? 'Wetterumschwung in der Höhe' : hard ? 'Lange, anspruchsvolle Tour' : 'Kälte bei unfreiwilliger Pause', level: 'recommended', group: 'Sicherheit' });
  }
  add({ id: 'offline', icon: '🗺️', name: 'Offline-Karte gespeichert', why: 'Im Wald und in den Bergen oft kein Netz', level: 'recommended', group: 'Sicherheit' });
  add({ id: 'id', icon: '💶', name: 'Ausweis, Bargeld, Krankenkassenkarte', why: 'Für Hütte, Notfall, Bus zurück', level: 'recommended', group: 'Sicherheit' });
  if (wx?.hints.some((h) => h.level === 'danger')) {
    add({ id: 'plan-b', icon: '⚠️', name: 'Plan B / Abbruchpunkt überlegen', why: wx.hints.find((h) => h.level === 'danger')!.text, level: 'must', group: 'Sicherheit' });
  }

  const order: Record<GearLevel, number> = { must: 0, recommended: 1, optional: 2 };
  return items.sort((a, b) => order[a.level] - order[b.level]);
}

export const GROUPS: GearGroup[] = ['Kleidung', 'Ausrüstung', 'Essen & Trinken', 'Sicherheit'];
