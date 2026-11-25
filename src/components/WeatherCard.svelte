<script lang="ts">
  import type { Pt } from '../lib/geo';
  import {
    loadWeather, cachedWeather, isFresh, wxIcon, wxText, dayHints, severityLabel,
    type TourWeather,
  } from '../lib/weather';
  import Disclosure from './Disclosure.svelte';
  import { wxShared } from '../lib/wxshared.svelte';

  let { route }: { route: Pt[] } = $props();

  // Start und höchster Punkt der Tour (Gipfel nur, wenn deutlich höher als der Start)
  const locs = $derived.by(() => {
    if (route.length < 2) return [];
    const s = route[0];
    let hi = 0;
    route.forEach((p, i) => { if ((p[2] ?? -1e9) > (route[hi][2] ?? -1e9)) hi = i; });
    const out = [{ label: 'Start', lng: s[0], lat: s[1], ele: s[2] ?? null }];
    const h = route[hi];
    if (h[2] !== undefined && s[2] !== undefined && h[2] - s[2] >= 150) {
      out.push({ label: 'Höchster Punkt', lng: h[0], lat: h[1], ele: h[2] });
    }
    return out;
  });
  const key = $derived(locs.map((l) => `${l.lat.toFixed(2)},${l.lng.toFixed(2)},${Math.round((l.ele ?? 0) / 50)}`).join(';'));

  let weather = $state<TourWeather | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selected = $state<string | null>(null);
  let openAlert = $state<string | null>(null);
  let ctrl: AbortController | undefined;

  async function refresh(force = false) {
    const l = locs;
    if (!l.length) return;
    const cached = cachedWeather(l);
    if (cached) weather = cached;
    if (!force && isFresh(cached)) return;
    if (!navigator.onLine) {
      error = cached ? null : 'Für das Wetter wird Internet benötigt.';
      return;
    }
    ctrl?.abort();
    ctrl = new AbortController();
    loading = true;
    error = null;
    try {
      weather = await loadWeather(l, ctrl.signal);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') error = cached ? 'Aktualisieren fehlgeschlagen – zeige gespeicherte Vorhersage.' : 'Wetter konnte nicht geladen werden.';
    } finally {
      loading = false;
    }
  }

  // Neu laden, wenn sich Start oder Gipfel spürbar ändern
  $effect(() => {
    key;
    const t = setTimeout(() => refresh(), 600);
    return () => clearTimeout(t);
  });

  const days = $derived(weather?.places[0]?.days ?? []);
  const day = $derived(selected && days.some((d) => d.date === selected) ? selected : days[0]?.date ?? null);
  const hints = $derived(weather && day ? dayHints(weather.places, day) : []);
  const hintsByDay = $derived(new Map(days.map((d) => [d.date, weather ? dayHints(weather.places, d.date) : []])));

  const weekday = (date: string, i: number) =>
    i === 0 ? 'Heute' : i === 1 ? 'Morgen' : new Date(date + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short' });
  const dm = (date: string) => new Date(date + 'T12:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric' });
  const hhmm = (iso: string) => iso.slice(11, 16);
  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric', hour: '2-digit', minute: '2-digit' });
  const ago = (ms: number) => {
    const min = Math.round((Date.now() - ms) / 60000);
    return min < 2 ? 'gerade eben' : min < 60 ? `vor ${min} min` : min < 60 * 24 ? `vor ${Math.round(min / 60)} h` : `vor ${Math.round(min / 1440)} Tagen`;
  };

  const HOURS = [6, 8, 10, 12, 14, 16, 18, 20];
  function hourRow(placeIdx: number, h: number) {
    return weather?.places[placeIdx]?.hours.find((x) => x.time === `${day}T${String(h).padStart(2, '0')}:00`);
  }
  const worst = (list: { level: string }[]) =>
    list.some((h) => h.level === 'danger') ? 'danger' : list.some((h) => h.level === 'warn') ? 'warn' : null;

  // Wetter des gewählten Tages für die Ausrüstungs-Box bereitstellen (kältester/windigster Wert von Start und Gipfel)
  $effect(() => {
    const w = weather, d = day;
    if (!w || !d) { wxShared.current = null; return; }
    const ds = w.places.map((p) => p.days.find((x) => x.date === d)).filter((x): x is NonNullable<typeof x> => !!x);
    if (!ds.length) { wxShared.current = null; return; }
    wxShared.current = {
      day: ds[0],
      tMin: Math.min(...ds.map((x) => x.tMin)),
      tMax: Math.max(...ds.map((x) => x.tMax)),
      gusts: Math.max(...ds.map((x) => x.gusts)),
      precip: Math.max(...ds.map((x) => x.precip)),
      precipProb: Math.max(...ds.map((x) => x.precipProb ?? 0)),
      hints,
    };
  });
  $effect(() => () => { wxShared.current = null; });

  // Kurzinfo in der Kopfzeile der Box
  const summary = $derived.by(() => {
    if (!weather || !day) return loading ? 'Wird geladen …' : error ?? '';
    const i = days.findIndex((d) => d.date === day);
    const d0 = days[i];
    let s = `${weekday(day, i)} ${wxIcon(d0.code)} ${Math.round(d0.tMax)}° / ${Math.round(d0.tMin)}°`;
    if (weather.alerts.length) s += ` · ⚠️ ${weather.alerts[0].event.charAt(0) + weather.alerts[0].event.slice(1).toLowerCase()}`;
    else if (hints.length) s += ` · ${hints[0].text.split(' – ')[0]}`;
    return s;
  });
  const alertBadge = $derived(weather?.alerts.length ? `${weather.alerts.length} Warnung${weather.alerts.length > 1 ? 'en' : ''}` : '');
</script>

<Disclosure id="weather" icon="⛅" tint="#007aff" title="Wetter" {summary} badge={alertBadge}>
  <div class="head">
    <span class="muted small">Start{weather && weather.places.length > 1 ? ' und höchster Punkt' : ''}</span>
    <button class="refresh" onclick={() => refresh(true)} disabled={loading} title="Aktualisieren" aria-label="Wetter aktualisieren">
      <span class:spin={loading}>⟳</span>
    </button>
  </div>

  {#if error}<p class="err">{error}</p>{/if}

  {#if weather}
    <!-- Amtliche Warnungen -->
    {#each weather.alerts as a (a.id)}
      <div class="alert {a.severity}">
        <button class="alert-head" onclick={() => (openAlert = openAlert === a.id ? null : a.id)} aria-expanded={openAlert === a.id}>
          <span class="sev">⚠️ {severityLabel(a.severity)}</span>
          <b>{a.event.charAt(0) + a.event.slice(1).toLowerCase()}</b>
          <span class="when">{fmtTime(a.onset)}{a.expires ? ` – ${fmtTime(a.expires)}` : ''}</span>
        </button>
        {#if openAlert === a.id}
          <p>{a.description}</p>
          {#if a.instruction}<p><i>{a.instruction}</i></p>{/if}
        {/if}
      </div>
    {/each}

    <!-- 7 Tage -->
    <div class="days" role="tablist" aria-label="Tage">
      {#each days as d, i (d.date)}
        {@const w = worst(hintsByDay.get(d.date) ?? [])}
        <button class="day" class:sel={d.date === day} role="tab" aria-selected={d.date === day} onclick={() => (selected = d.date)}>
          <span class="wd">{weekday(d.date, i)}</span>
          <span class="dt">{dm(d.date)}</span>
          <span class="ic" title={wxText(d.code)}>{wxIcon(d.code)}</span>
          <span class="tt"><b>{Math.round(d.tMax)}°</b> {Math.round(d.tMin)}°</span>
          <span class="rp">💧{d.precipProb ?? '–'}%</span>
          {#if w}<span class="dot {w}" aria-label="Hinweis"></span>{/if}
        </button>
      {/each}
    </div>

    {#if day}
      {@const d0 = days.find((d) => d.date === day)!}
      <p class="summary">
        <b>{wxText(d0.code)}</b> · {Math.round(d0.precip * 10) / 10} mm · Böen {Math.round(d0.gusts)} km/h ·
        🌅 {hhmm(d0.sunrise)} · 🌇 {hhmm(d0.sunset)}
      </p>

      {#if hints.length}
        <ul class="hints">
          {#each hints as h}<li class={h.level}>{h.text}</li>{/each}
        </ul>
      {/if}

      <div class="hours-wrap">
        <table class="hours">
          <thead>
            <tr><th></th>{#each HOURS as h}<th>{h}</th>{/each}</tr>
          </thead>
          <tbody>
            {#each weather.places as p, pi}
              <tr class="place"><th colspan={HOURS.length + 1}>{p.label} · {p.ele} m</th></tr>
              <tr>
                <th class="rl">Wetter</th>
                {#each HOURS as h}{@const r = hourRow(pi, h)}<td title={r ? wxText(r.code) : ''}>{r ? wxIcon(r.code) : ''}</td>{/each}
              </tr>
              <tr>
                <th class="rl">°C</th>
                {#each HOURS as h}{@const r = hourRow(pi, h)}<td class:cold={r && r.temp <= 0}>{r ? Math.round(r.temp) : ''}</td>{/each}
              </tr>
              <tr>
                <th class="rl">Regen</th>
                {#each HOURS as h}{@const r = hourRow(pi, h)}<td class="small">{r?.precipProb ?? ''}{r?.precipProb !== null && r ? '%' : ''}</td>{/each}
              </tr>
              <tr>
                <th class="rl">Böen</th>
                {#each HOURS as h}{@const r = hourRow(pi, h)}<td class="small" class:windy={r && r.gusts >= 50}>{r ? Math.round(r.gusts) : ''}</td>{/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <p class="foot">
      Stand: {ago(weather.fetchedAt)} · Vorhersage: Open-Meteo.
      {#if weather.alertRegion}Amtliche Warnungen: DWD für {weather.alertRegion}{weather.alerts.length ? '' : ' – aktuell keine'}.
      {:else}Amtliche Warnungen gibt es hier nur für Deutschland – im Ausland bitte den lokalen Wetterdienst prüfen.{/if}
      Hinweise in Gelb/Rot sind aus der Vorhersage abgeleitet, keine amtliche Warnung.
    </p>
  {:else if loading}
    <p class="muted">Wetter wird geladen …</p>
  {/if}
</Disclosure>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; margin: -4px 0 6px; }
  .small { font-size: .8rem; }
  .refresh { width: 36px; height: 36px; border: 0; background: #f2f2f7; font-size: 1.15rem; border-radius: 50%; color: #007aff; }
  .refresh:active { background: #e5e5ea; }
  .spin { display: inline-block; animation: spin 1s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .err { color: var(--warn); font-size: .9rem; }

  .alert { border-radius: 12px; margin-bottom: 8px; border-left: 4px solid; background: #fff8d6; border-color: #e5c100; overflow: hidden; }
  .alert.moderate { background: #ffedd5; border-color: #f08c00; }
  .alert.severe { background: #fde2e1; border-color: #d00000; }
  .alert.extreme { background: #f3e1f7; border-color: #8a0099; }
  .alert-head { width: 100%; text-align: left; border: 0; background: none; padding: 8px 10px; display: flex; flex-direction: column; gap: 2px; }
  .sev { font-size: .75rem; font-weight: 700; text-transform: uppercase; color: #6b3d00; }
  .when { font-size: .8rem; color: var(--muted); }
  .alert p { margin: 0 10px 8px; font-size: .88rem; }

  .days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; margin-bottom: 10px; }
  .day {
    position: relative; border: 0; border-radius: 12px; background: #f2f2f7; color: #1c1c1e;
    padding: 7px 2px; display: flex; flex-direction: column; align-items: center; gap: 1px; min-width: 0;
    transition: background .15s;
  }
  .day.sel { background: #007aff; color: #fff; }
  .day.sel .dt, .day.sel .rp { color: rgba(255, 255, 255, .85); }
  .wd { font-size: .72rem; font-weight: 600; }
  .dt { font-size: .65rem; color: #8e8e93; }
  .ic { font-size: 1.35rem; line-height: 1.2; }
  .tt { font-size: .75rem; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .rp { font-size: .65rem; color: #007aff; white-space: nowrap; }
  .dot { position: absolute; top: 5px; right: 5px; width: 8px; height: 8px; border-radius: 50%; box-shadow: 0 0 0 1.5px #fff; }
  .dot.warn { background: #ff9500; }
  .dot.danger { background: #ff3b30; }

  .summary { font-size: .88rem; margin: 4px 0 8px; color: #3a3a3c; }
  .hints { list-style: none; padding: 0; margin: 0 0 10px; display: flex; flex-direction: column; gap: 6px; }
  .hints li { font-size: .86rem; padding: 8px 12px; border-radius: 12px; }
  .hints .info { background: #eaf3ff; color: #0a3d75; }
  .hints .warn { background: #fff4e5; color: #7a4100; }
  .hints .danger { background: #ffebea; color: #8a1a13; font-weight: 600; }

  .hours-wrap { overflow-x: auto; margin: 0 -4px; }
  .hours { border-collapse: collapse; width: 100%; font-size: .82rem; font-variant-numeric: tabular-nums; }
  .hours th, .hours td { text-align: center; padding: 3px 2px; }
  .hours thead th { color: var(--muted); font-weight: 600; font-size: .75rem; }
  .hours .place th { text-align: left; font-size: .78rem; color: var(--green-dark); padding-top: 8px; border-bottom: 1px solid var(--line); }
  .rl { text-align: left !important; font-weight: 600; color: var(--muted); font-size: .72rem; white-space: nowrap; }
  .small { font-size: .74rem; }
  .cold { color: #1c5fa8; font-weight: 700; }
  .windy { color: #c25e00; font-weight: 700; }
  .foot { font-size: .72rem; color: var(--muted); margin: 8px 0 0; }
</style>
