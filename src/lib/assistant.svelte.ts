// KI-Assistent: beantwortet Fragen nach Touren. Nutzt Google Gemini (kostenloser Schlüssel aus Google AI Studio,
// liegt nur auf diesem Gerät). Die KI darf Werkzeuge der App aufrufen: Touren suchen, Wetter, gespeicherte Touren.

import { fromHere, fhFilter, openFromHere, waitFromHere, passesPeak, passesHike, hikeHours, loadHutsAround } from './fromhere.svelte';
import { mapState } from './map.svelte';
import { planner } from './planner.svelte';
import { db } from './db';
import { ui } from './ui.svelte';

const KEY = 'wander.ai.key';
const MODEL = 'gemini-flash-latest';

type Part = { text?: string; functionCall?: { name: string; args: Record<string, unknown> }; functionResponse?: unknown; thoughtSignature?: string };
type Content = { role: 'user' | 'model'; parts: Part[] };
export type ChatMsg = { from: 'me' | 'ai'; text: string; showTours?: boolean };

export const ai = $state<{ key: string; msgs: ChatMsg[]; busy: string | null }>({
  key: localStorage.getItem(KEY) ?? '', msgs: [], busy: null,
});
let history: Content[] = [];

export function setKey(k: string) {
  ai.key = k.trim();
  if (ai.key) localStorage.setItem(KEY, ai.key); else localStorage.removeItem(KEY);
}
export function resetChat() { history = []; ai.msgs = []; }

const SYSTEM = `Du bist der Wander-Assistent in einer deutschen Wander-App. Antworte auf Deutsch, kurz, freundlich und konkret.
Nutze die Werkzeuge: find_tours für Tourenvorschläge (Gipfel und markierte Wanderwege um einen Ort), get_weather für das Wetter,
saved_tours für die gespeicherten Touren des Nutzers, current_tour für die gerade geplante Tour.
Erfinde keine Touren, Zeiten oder Hütten – nenne nur, was die Werkzeuge liefern. Wenn nichts passt, sag das ehrlich und schlage vor,
den Filter zu lockern oder einen anderen Ort zu nennen. Weise bei alpinen Touren, Klettersteigen oder Gletschern auf Ausrüstung und Erfahrung hin.
Heute ist ${new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.
Wenn find_tours Ergebnisse hatte, erwähne, dass der Nutzer sie mit „Auf der Karte ansehen“ öffnen und übernehmen kann.`;

const TOOLS = [{
  functionDeclarations: [
    {
      name: 'find_tours',
      description: 'Sucht Gipfeltouren (Umkreis 7 km) und markierte Wanderwege (Umkreis ca. 3 km) um einen Ort. Ohne Ort: aktueller Kartenausschnitt.',
      parameters: { type: 'OBJECT', properties: {
        place: { type: 'STRING', description: 'Ort, Berg, Parkplatz oder Region, z. B. "Feldberg Taunus"' },
        max_hours: { type: 'NUMBER', description: 'Höchste Gehzeit in Stunden (hin und zurück)' },
        loop_only: { type: 'BOOLEAN', description: 'Nur Rundwege' },
        with_hut: { type: 'BOOLEAN', description: 'Nur Touren mit Hütte, Gasthaus oder Café am Weg' },
      } },
    },
    {
      name: 'get_weather',
      description: 'Wettervorhersage für die nächsten 7 Tage an einem Ort (ohne Ort: Kartenmitte).',
      parameters: { type: 'OBJECT', properties: { place: { type: 'STRING' } } },
    },
    { name: 'saved_tours', description: 'Liste der gespeicherten Touren des Nutzers mit Länge, Höhenmetern und Gehzeit.', parameters: { type: 'OBJECT', properties: {} } },
    { name: 'current_tour', description: 'Die gerade geplante Tour (Name, Länge, Höhenmeter, Gehzeit, Schwierigkeit).', parameters: { type: 'OBJECT', properties: {} } },
  ],
}];

async function geocode(place?: string): Promise<{ lng: number; lat: number; name: string } | null> {
  const c = mapState.map?.getCenter();
  if (!place) return c ? { lng: c.lng, lat: c.lat, name: 'Kartenmitte' } : null;
  const u = new URL('https://photon.komoot.io/api/');
  u.searchParams.set('q', place); u.searchParams.set('lang', 'de'); u.searchParams.set('limit', '1');
  if (c) { u.searchParams.set('lat', c.lat.toFixed(2)); u.searchParams.set('lon', c.lng.toFixed(2)); }
  const f = (await (await fetch(u)).json()).features?.[0];
  if (!f) return null;
  const p = f.properties;
  return { lng: f.geometry.coordinates[0], lat: f.geometry.coordinates[1], name: [p.name, p.city ?? p.state, p.country].filter(Boolean).join(', ') };
}

const r1 = (x: number) => Math.round(x * 10) / 10;
let toursShown = false;

async function runTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  if (name === 'find_tours') {
    const g = await geocode(args.place as string | undefined);
    if (!g) return { error: 'Ort nicht gefunden' };
    ai.busy = `Suche Touren bei ${g.name} …`;
    fhFilter.maxH = Number(args.max_hours) || 0;
    fhFilter.loop = !!args.loop_only;
    fhFilter.hut = !!args.with_hut;
    openFromHere(g.lng, g.lat);
    mapState.map?.flyTo({ center: [g.lng, g.lat], zoom: 12 });
    await waitFromHere();
    if (fhFilter.hut) { loadHutsAround(); await new Promise((r) => setTimeout(r, 4000)); }
    const cat = (k: string) => fromHere.cats[k]?.cat ?? 'wander';
    const peaks = fromHere.peaks.filter(passesPeak).map((p) => ({
      art: 'Gipfel', name: p.name, hoehe_m: p.ele, km_hin_und_zurueck: r1(p.meters * 2 / 1000), aufstieg_m: Math.round(p.up),
      gehzeit_h_hin_und_zurueck: r1(p.hoursRound), schwierigkeit: p.difficulty, kategorie: cat(`p:${p.id}`),
    }));
    const hikes = fromHere.hikes.filter(passesHike).slice(0, 8).map((h) => ({
      art: 'Markierter Wanderweg', name: h.name, ref: h.ref, km: r1(h.length / 1000), gehzeit_h_ca: r1(hikeHours(h)),
      rundweg: h.loop, entfernung_vom_ort_m: h.near, verlauf: h.itinerary, kategorie: cat(`h:${h.id}`),
    }));
    toursShown = peaks.length + hikes.length > 0;
    return { ort: g.name, gipfeltouren: peaks, wanderwege: hikes, hinweis: fromHere.peakMsg || fromHere.hikeMsg || undefined };
  }
  if (name === 'get_weather') {
    const g = await geocode(args.place as string | undefined);
    if (!g) return { error: 'Ort nicht gefunden' };
    ai.busy = 'Hole Wetter …';
    const u = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat.toFixed(3)}&longitude=${g.lng.toFixed(3)}&timezone=auto` +
      '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_gusts_10m_max,sunrise,sunset';
    const d = (await (await fetch(u)).json()).daily;
    return { ort: g.name, wmo_codes_hinweis: '0 klar, 1-3 bewölkt, 45/48 Nebel, 51-67 Regen, 71-77 Schnee, 80-82 Schauer, 95-99 Gewitter', daily: d };
  }
  if (name === 'saved_tours') {
    const ts = await db.tours.orderBy('updatedAt').reverse().limit(40).toArray();
    return ts.map((t) => ({ name: t.name, art: t.kind, km: t.stats ? r1(t.stats.meters / 1000) : null, aufstieg_m: t.stats ? Math.round(t.stats.up) : null, gehzeit_h: t.stats ? r1(t.stats.hours) : null }));
  }
  if (name === 'current_tour') {
    const s = planner.stats;
    if (!s) return { info: 'Gerade ist keine Tour geplant.' };
    return { name: planner.name || 'Neue Tour', km: r1(s.meters / 1000), aufstieg_m: Math.round(s.up), abstieg_m: Math.round(s.down), gehzeit_h: r1(s.hours), schwierigkeit: s.difficulty, hoechster_punkt_m: s.maxEle };
  }
  return { error: 'unbekanntes Werkzeug' };
}

// Falls Google den Modellnamen ändert: der Reihe nach probieren und den funktionierenden merken
const MODELS = [MODEL, 'gemini-2.5-flash', 'gemini-2.0-flash'];
let modelIdx = 0;

async function call(): Promise<Content> {
  let res: Response;
  for (;;) {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODELS[modelIdx]}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': ai.key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: history, tools: TOOLS }),
    });
    if (res.status === 404 && modelIdx < MODELS.length - 1) { modelIdx++; continue; }
    break;
  }
  if (!res.ok) {
    if (res.status === 400 || res.status === 403) throw new Error('Der KI-Schlüssel wird nicht akzeptiert. Bitte in den KI-Einstellungen prüfen.');
    if (res.status === 429) throw new Error('Das kostenlose KI-Kontingent ist gerade aufgebraucht. Bitte in ein paar Minuten erneut versuchen.');
    throw new Error(`Die KI antwortet gerade nicht (${res.status}).`);
  }
  const j = await res.json();
  const content = j.candidates?.[0]?.content as Content | undefined;
  if (!content?.parts) throw new Error('Die KI hat keine Antwort geliefert.');
  return { role: 'model', parts: content.parts };
}

export async function ask(question: string) {
  if (!ai.key || ai.busy) return;
  if (!navigator.onLine) { ai.msgs = [...ai.msgs, { from: 'ai', text: 'Für den KI-Assistenten wird Internet benötigt.' }]; return; }
  ai.msgs = [...ai.msgs, { from: 'me', text: question }];
  history.push({ role: 'user', parts: [{ text: question }] });
  ai.busy = 'Denke nach …';
  toursShown = false;
  try {
    for (let round = 0; round < 5; round++) {
      const reply = await call();
      history.push(reply);
      const calls = reply.parts.filter((p) => p.functionCall);
      if (!calls.length) {
        const text = reply.parts.map((p) => p.text ?? '').join('').trim();
        ai.msgs = [...ai.msgs, { from: 'ai', text: text || '…', showTours: toursShown }];
        return;
      }
      const responses: Part[] = [];
      for (const c of calls) {
        let out: unknown;
        try { out = await runTool(c.functionCall!.name, c.functionCall!.args ?? {}); } catch (e) { out = { error: (e as Error).message }; }
        responses.push({ functionResponse: { name: c.functionCall!.name, response: { result: out } } });
      }
      history.push({ role: 'user', parts: responses });
      ai.busy = 'Denke nach …';
    }
    ai.msgs = [...ai.msgs, { from: 'ai', text: 'Das wurde mir zu kompliziert – bitte frag etwas einfacher.' }];
  } catch (e) {
    history.pop();
    ai.msgs = [...ai.msgs, { from: 'ai', text: (e as Error).message }];
  } finally {
    ai.busy = null;
  }
}

export function showToursOnMap() {
  ui.ai = false;
  ui.view = 'planen';
}
