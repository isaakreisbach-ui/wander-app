// Beste Startzeit für eine Tour: Tageslicht, Gehzeit inkl. Pausen, Gewitter, Regen, Hitze,
// Gletscher (morgens fester Schnee) und eine GESCHÄTZTE Auslastung.
//
// Ehrlich: Echte Besucherzahlen gibt es kostenlos nicht. Die Auslastung wird geschätzt aus
// Wochentag, Feiertag, Uhrzeit, Jahreszeit und Wetter (schönes Wetter am Wochenende = voll).
// Schulferien sind nicht enthalten.

import type { TourStats } from './db';
import type { GearWeather } from './gear';

export type Crowd = 0 | 1 | 2; // ruhig, mittel, voll
export type StartRec = {
  date: string;
  dayType: 'Feiertag' | 'Wochenende' | 'Werktag';
  dayLabel: string;
  durationH: number;
  best: number; // Stunde als Dezimalzahl, z. B. 8.5
  latest: number;
  end: number;
  sunrise: number | null;
  sunset: number | null;
  reasons: string[];
  warnings: string[];
  crowdAt: (h: number) => Crowd;
  crowdBest: Crowd;
};

const dec = (iso: string) => +iso.slice(11, 13) + +iso.slice(14, 16) / 60;
export const hm = (h: number) => {
  const m = Math.round(h * 60);
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
};

async function isHoliday(date: Date, lat: number, lng: number): Promise<boolean> {
  try {
    const mod = await import('opening_hours');
    const OH = (mod as unknown as { default: new (...a: unknown[]) => { getState(d: Date): boolean } }).default;
    const de = lat > 47.2 && lat < 55.1 && lng > 5.8 && lng < 15.1;
    const it = lat > 46.2 && lat < 47.1 && lng > 10.3 && lng < 12.5;
    if (!de && !it) return false;
    const nominatim = { lat, lon: lng, address: de ? { country_code: 'de', state: lat > 49.4 && lat < 51.7 && lng > 7.7 && lng < 10.3 ? 'Hessen' : '' } : { country_code: 'it', state: 'Trentino-Alto Adige' } };
    return new OH('PH', nominatim, {}).getState(new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12));
  } catch {
    return false;
  }
}

export async function recommendStart(
  stats: TourStats, wx: GearWeather | null, lat: number, lng: number, glacier = false,
): Promise<StartRec> {
  const date = wx ? new Date(wx.day.date + 'T12:00') : new Date();
  const dateStr = wx?.day.date ?? date.toISOString().slice(0, 10);
  const dow = date.getDay();
  const holiday = await isHoliday(date, lat, lng);
  const dayType: StartRec['dayType'] = holiday ? 'Feiertag' : dow === 0 || dow === 6 ? 'Wochenende' : 'Werktag';
  const month = date.getMonth() + 1;
  const season = month >= 5 && month <= 10;

  // Dauer: Gehzeit + Pausen (ca. 15 % + 15 min)
  const durationH = Math.round((stats.hours * 1.15 + 0.25) * 4) / 4;
  const sunrise = wx ? dec(wx.day.sunrise) : null;
  const sunset = wx ? dec(wx.day.sunset) : null;

  // Wetter je Stunde (schlechtester Wert von Start und Gipfel)
  const hourly = new Map<number, { prob: number; storm: boolean; temp: number; code: number }>();
  for (const place of wx?.hours ?? []) {
    for (const h of place) {
      const hr = +h.time.slice(11, 13);
      const cur = hourly.get(hr);
      const v = { prob: h.precipProb ?? 0, storm: h.code >= 95, temp: h.temp, code: h.code };
      hourly.set(hr, cur ? { prob: Math.max(cur.prob, v.prob), storm: cur.storm || v.storm, temp: Math.max(cur.temp, v.temp), code: Math.max(cur.code, v.code) } : v);
    }
  }
  const sunny = !!wx && wx.day.code <= 2 && (wx.precipProb ?? 0) < 40;

  // Geschätzte Auslastung nach Uhrzeit
  const crowdAt = (h: number): Crowd => {
    const busyDay = dayType !== 'Werktag';
    let base: Crowd = 0;
    if (busyDay) base = h >= 10.5 && h < 15 ? 2 : h >= 9 && h < 16.5 ? 1 : 0;
    else base = h >= 11 && h < 14.5 ? 1 : 0;
    if (!sunny && base > 0) base = (base - 1) as Crowd; // schlechtes Wetter = leerer
    if (busyDay && sunny && season && h >= 9 && h < 16.5) base = 2;
    if (!season && base === 2 && !sunny) base = 1;
    return base;
  };

  const first = Math.max(5, sunrise !== null ? Math.ceil((sunrise + 0.25) * 2) / 2 : 6.5);
  let latest = sunset !== null ? Math.floor((sunset - durationH - 0.5) * 2) / 2 : 19 - durationH;
  const warnings: string[] = [];

  // Gewitter: spätestens 1 h vorher zurück (bzw. vom Gipfel runter)
  const stormHours = [...hourly.entries()].filter(([, v]) => v.storm).map(([h]) => h).sort((a, b) => a - b);
  if (stormHours.length) {
    const byStorm = stormHours[0] - 1 - durationH;
    if (byStorm < latest) latest = Math.floor(byStorm * 2) / 2;
    warnings.push(`Gewitter ab ca. ${stormHours[0]} Uhr möglich – bis ${stormHours[0] - 1} Uhr zurück sein.`);
  }

  const reasons: string[] = [];
  let best = first, bestScore = Infinity;
  for (let s = first; s <= Math.max(first, latest); s += 0.5) {
    let score = (s - first) * 0.05; // leicht früher bevorzugen
    let crowd = 0, n = 0;
    for (let t = s; t < s + durationH; t += 0.5) {
      const w = hourly.get(Math.floor(t));
      if (w) {
        score += (w.prob / 100) * 1.5;
        if (w.storm) score += 10;
        if (w.temp >= 27) score += 0.8;
      }
      crowd += crowdAt(t);
      n++;
    }
    score += (crowd / Math.max(1, n)) * 0.8;
    if (glacier) score += Math.max(0, s - 6) * 0.4; // fester Schnee nur am Morgen
    if (score < bestScore) { bestScore = score; best = s; }
  }

  // Begründungen
  if (sunset !== null) reasons.push(`Gehzeit inkl. Pausen ca. ${hm(durationH)} h – Sonnenuntergang ${hm(sunset)} Uhr.`);
  else reasons.push(`Gehzeit inkl. Pausen ca. ${hm(durationH)} h. (Wetter-Box öffnen für Tageslicht und Wetter.)`);
  if ([...hourly.values()].some((v) => v.temp >= 27)) reasons.push('Heiß am Nachmittag – früh starten, Aufstieg im Schatten der Morgenstunden.');
  const rainy = [...hourly.entries()].filter(([h, v]) => h >= best && h < best + durationH && v.prob >= 50);
  if (rainy.length) reasons.push(`Auch zur besten Zeit Regen möglich (bis ${Math.max(...rainy.map(([, v]) => v.prob))} %).`);
  if (glacier) reasons.push('Gletscher: Am Morgen ist der Schnee fest, nachmittags weich und Spaltenbrücken unsicher.');
  if (dayType !== 'Werktag') reasons.push(`${dayType}${sunny ? ' bei schönem Wetter' : ''}: zwischen 10:30 und 15 Uhr wird es voller.`);
  if (latest < first) warnings.push('Die Tour ist für das Tageslicht zu lang – Stirnlampe mitnehmen oder kürzen.');

  return {
    date: dateStr, dayType,
    dayLabel: date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }),
    durationH, best, latest: Math.max(first, latest), end: best + durationH,
    sunrise, sunset, reasons, warnings, crowdAt, crowdBest: crowdAt(best + durationH / 2),
  };
}
