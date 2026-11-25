// Wetter für eine Tour: 7-Tage-Vorhersage von Open-Meteo (kostenlos, ohne Key) für Start und
// höchsten Punkt, dazu amtliche Unwetterwarnungen des DWD über Bright Sky (nur Deutschland).
// Ergebnisse werden im Gerät zwischengespeichert, damit sie auch offline sichtbar bleiben.

export type DayForecast = {
  date: string; // YYYY-MM-DD
  code: number;
  tMax: number;
  tMin: number;
  precip: number; // mm
  precipProb: number | null; // %
  gusts: number; // km/h
  sunrise: string;
  sunset: string;
};

export type HourForecast = {
  time: string; // YYYY-MM-DDTHH:mm
  temp: number;
  feels: number;
  code: number;
  precipProb: number | null;
  precip: number;
  gusts: number;
};

export type PlaceForecast = { label: string; ele: number; days: DayForecast[]; hours: HourForecast[] };

export type OfficialAlert = {
  id: string;
  event: string;
  headline: string;
  description: string;
  instruction: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme' | string;
  onset: string;
  expires: string | null;
};

export type TourWeather = {
  fetchedAt: number;
  places: PlaceForecast[];
  alerts: OfficialAlert[];
  /** null = Warnungen konnten nicht geprüft werden (z. B. außerhalb Deutschlands) */
  alertRegion: string | null;
};

const CACHE_PREFIX = 'wander.weather.v1.';
const FRESH_MS = 30 * 60 * 1000;

type Loc = { label: string; lng: number; lat: number; ele: number | null };

function cacheKey(locs: Loc[]) {
  return CACHE_PREFIX + locs.map((l) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)},${Math.round((l.ele ?? 0) / 50)}`).join(';');
}

export function cachedWeather(locs: Loc[]): TourWeather | null {
  try {
    return JSON.parse(localStorage.getItem(cacheKey(locs)) || 'null');
  } catch {
    return null;
  }
}

export function isFresh(w: TourWeather | null) {
  return !!w && Date.now() - w.fetchedAt < FRESH_MS;
}

export async function loadWeather(locs: Loc[], signal?: AbortSignal): Promise<TourWeather> {
  const q = new URLSearchParams({
    latitude: locs.map((l) => l.lat.toFixed(4)).join(','),
    longitude: locs.map((l) => l.lng.toFixed(4)).join(','),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_gusts_10m_max,sunrise,sunset',
    hourly: 'temperature_2m,apparent_temperature,weather_code,precipitation_probability,precipitation,wind_gusts_10m',
    timezone: 'auto',
    forecast_days: '7',
  });
  if (locs.every((l) => l.ele !== null)) q.set('elevation', locs.map((l) => Math.round(l.ele!)).join(','));

  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${q}`, { signal });
  if (!res.ok) throw new Error('Wetterdienst nicht erreichbar');
  const raw = await res.json();
  const list = Array.isArray(raw) ? raw : [raw];

  const places: PlaceForecast[] = list.map((r: any, i: number) => ({
    label: locs[i].label,
    ele: Math.round(r.elevation),
    days: r.daily.time.map((date: string, d: number) => ({
      date,
      code: r.daily.weather_code[d],
      tMax: r.daily.temperature_2m_max[d],
      tMin: r.daily.temperature_2m_min[d],
      precip: r.daily.precipitation_sum[d] ?? 0,
      precipProb: r.daily.precipitation_probability_max[d],
      gusts: r.daily.wind_gusts_10m_max[d] ?? 0,
      sunrise: r.daily.sunrise[d],
      sunset: r.daily.sunset[d],
    })),
    hours: r.hourly.time.map((time: string, h: number) => ({
      time,
      temp: r.hourly.temperature_2m[h],
      feels: r.hourly.apparent_temperature[h],
      code: r.hourly.weather_code[h],
      precipProb: r.hourly.precipitation_probability[h],
      precip: r.hourly.precipitation[h] ?? 0,
      gusts: r.hourly.wind_gusts_10m[h] ?? 0,
    })),
  }));

  // Amtliche Warnungen (DWD) – nur in Deutschland verfügbar
  let alerts: OfficialAlert[] = [];
  let alertRegion: string | null = null;
  try {
    const a = await fetch(`https://api.brightsky.dev/alerts?lat=${locs[0].lat.toFixed(4)}&lon=${locs[0].lng.toFixed(4)}`, { signal });
    if (a.ok) {
      const j = await a.json();
      alertRegion = j.location ? [j.location.name_short ?? j.location.name, j.location.district].filter(Boolean).join(', ') : null;
      alerts = (j.alerts ?? []).map((x: any) => ({
        id: String(x.id ?? x.alert_id),
        event: x.event_de ?? x.event_en ?? 'Warnung',
        headline: x.headline_de ?? x.headline_en ?? '',
        description: x.description_de ?? x.description_en ?? '',
        instruction: x.instruction_de ?? x.instruction_en ?? '',
        severity: x.severity ?? 'minor',
        onset: x.onset,
        expires: x.expires ?? null,
      }));
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
  }

  const result: TourWeather = { fetchedAt: Date.now(), places, alerts, alertRegion };
  try {
    localStorage.setItem(cacheKey(locs), JSON.stringify(result));
  } catch { /* Speicher voll – egal */ }
  return result;
}

// ---------- Wettercodes (WMO) ----------

const CODES: Record<number, [string, string]> = {
  0: ['☀️', 'Klar'], 1: ['🌤️', 'Überwiegend klar'], 2: ['⛅', 'Teilweise bewölkt'], 3: ['☁️', 'Bedeckt'],
  45: ['🌫️', 'Nebel'], 48: ['🌫️', 'Nebel mit Reif'],
  51: ['🌦️', 'Leichter Niesel'], 53: ['🌦️', 'Niesel'], 55: ['🌧️', 'Starker Niesel'],
  56: ['🌧️', 'Gefrierender Niesel'], 57: ['🌧️', 'Gefrierender Niesel'],
  61: ['🌦️', 'Leichter Regen'], 63: ['🌧️', 'Regen'], 65: ['🌧️', 'Starker Regen'],
  66: ['🌧️', 'Gefrierender Regen'], 67: ['🌧️', 'Gefrierender Regen'],
  71: ['🌨️', 'Leichter Schneefall'], 73: ['🌨️', 'Schneefall'], 75: ['❄️', 'Starker Schneefall'], 77: ['🌨️', 'Schneegriesel'],
  80: ['🌦️', 'Regenschauer'], 81: ['🌧️', 'Regenschauer'], 82: ['⛈️', 'Heftige Schauer'],
  85: ['🌨️', 'Schneeschauer'], 86: ['❄️', 'Starke Schneeschauer'],
  95: ['⛈️', 'Gewitter'], 96: ['⛈️', 'Gewitter mit Hagel'], 99: ['⛈️', 'Schweres Gewitter mit Hagel'],
};

export function wxIcon(code: number) { return CODES[code]?.[0] ?? '❔'; }
export function wxText(code: number) { return CODES[code]?.[1] ?? 'Unbekannt'; }

// ---------- Hinweise aus der Vorhersage (keine amtlichen Warnungen) ----------

export type Hint = { level: 'info' | 'warn' | 'danger'; text: string };

type RawHint = { key: string; level: Hint['level']; value: number; text: (v: number) => string };
const RANK = { info: 0, warn: 1, danger: 2 } as const;

/**
 * Hinweise für einen Tag (Werte zwischen 6 und 20 Uhr). Start und Gipfel werden zusammengefasst:
 * pro Art bleibt nur der stärkste Wert; steht er nur oben am Gipfel, wird das dazugeschrieben.
 */
export function dayHints(places: PlaceForecast[], date: string): Hint[] {
  const found = new Map<string, { hint: RawHint; where: Set<string> }>();
  const add = (h: RawHint, label: string) => {
    const prev = found.get(h.key);
    if (!prev) { found.set(h.key, { hint: h, where: new Set([label]) }); return; }
    prev.where.add(label);
    if (RANK[h.level] > RANK[prev.hint.level] || (h.level === prev.hint.level && Math.abs(h.value) > Math.abs(prev.hint.value))) prev.hint = h;
  };

  for (const p of places) {
    const day = p.days.find((d) => d.date === date);
    if (!day) continue;
    const hours = p.hours.filter((h) => h.time.startsWith(date) && +h.time.slice(11, 13) >= 6 && +h.time.slice(11, 13) <= 20);
    const L = p.label;

    const storm = hours.filter((h) => h.code >= 95);
    if (storm.length) add({ key: 'storm', level: 'danger', value: +storm[0].time.slice(11, 13), text: (v) => `Gewitter möglich, ca. ${v} Uhr – exponierte Grate und Gipfel meiden` }, L);
    if (day.gusts >= 75) add({ key: 'wind', level: 'danger', value: day.gusts, text: (v) => `Sturmböen bis ${Math.round(v)} km/h – Gefahr durch umstürzende Bäume` }, L);
    else if (day.gusts >= 55) add({ key: 'wind', level: 'warn', value: day.gusts, text: (v) => `Starke Böen bis ${Math.round(v)} km/h` }, L);
    if (day.precip >= 25) add({ key: 'rain', level: 'danger', value: day.precip, text: (v) => `Starkregen, ${Math.round(v)} mm – Wege können rutschig oder überflutet sein` }, L);
    else if (day.precip >= 10) add({ key: 'rain', level: 'warn', value: day.precip, text: (v) => `Viel Regen, ${Math.round(v)} mm` }, L);
    if ([71, 73, 75, 77, 85, 86].includes(day.code) || hours.some((h) => (h.code >= 71 && h.code <= 77) || h.code === 85 || h.code === 86))
      add({ key: 'snow', level: 'warn', value: 1, text: () => 'Schneefall möglich' }, L);
    if (hours.some((h) => [56, 57, 66, 67].includes(h.code)) || (day.tMin <= 0 && day.precip > 0.5))
      add({ key: 'ice', level: 'warn', value: day.tMin, text: () => 'Glättegefahr – rutschige, vereiste Wege möglich' }, L);
    else if (day.tMin <= 0) add({ key: 'ice', level: 'info', value: day.tMin, text: (v) => `Frost am Morgen (bis ${Math.round(v)} °C) – Wege können vereist sein` }, L);
    if (day.tMax >= 30) add({ key: 'heat', level: 'warn', value: day.tMax, text: (v) => `Hitze bis ${Math.round(v)} °C – genug Wasser mitnehmen, früh starten` }, L);
    if (hours.length && hours.every((h) => h.code === 45 || h.code === 48)) add({ key: 'fog', level: 'info', value: 1, text: () => 'Ganztägig Nebel – Orientierung schwierig' }, L);
  }

  return [...found.values()]
    .map(({ hint, where }) => ({
      level: hint.level,
      text: hint.text(hint.value) + (places.length > 1 && where.size === 1 ? ` (nur ${[...where][0]})` : ''),
    }))
    .sort((a, b) => RANK[b.level] - RANK[a.level]);
}

export function severityLabel(s: string) {
  return ({ minor: 'Wetterwarnung', moderate: 'Markante Wetterwarnung', severe: 'Unwetterwarnung', extreme: 'Extreme Unwetterwarnung' } as Record<string, string>)[s] ?? 'Warnung';
}
