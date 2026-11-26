<script lang="ts">
  import { peakState, closePeak, directionsUrl, START_ICON, SUGGEST_COLORS, type Suggestion } from '../lib/peaks.svelte';
  import { planner } from '../lib/planner.svelte';
  import { confirmDiscard, fitRoute } from '../lib/tours';
  import { formatDistance, formatDuration, type Pt } from '../lib/geo';
  import { ui } from '../lib/ui.svelte';

  const peak = $derived(peakState.peak!);

  const isPoint = $derived(peak.kind === 'point');
  let locating = $state(false);

  /** Route vom aktuellen GPS-Standort zum Ziel planen */
  function fromMyLocation() {
    if (!('geolocation' in navigator)) return alert('Dieses Gerät hat kein GPS.');
    if (!confirmDiscard()) return;
    locating = true;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        locating = false;
        const a: [number, number] = [pos.coords.longitude, pos.coords.latitude];
        planner.newPlanFrom(`Mein Standort → ${peak.name}`, [a, [peak.lng, peak.lat]]);
        closePeak();
        ui.view = 'planen';
      },
      () => { locating = false; alert('Standort konnte nicht ermittelt werden. Bitte Ortung erlauben.'); },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
    );
  }

  function adopt(s: Suggestion, roundTrip = true) {
    if (!confirmDiscard()) return;
    const a: [number, number] = [s.start.lng, s.start.lat];
    const b: [number, number] = [peak.lng, peak.lat];
    const back = [...s.route].reverse() as Pt[];
    planner.newPlanFrom(`${s.start.name} → ${peak.name}`, roundTrip ? [a, b, a] : [a, b], [
      { a, b, pts: s.route },
      { a: b, b: a, pts: back },
    ]);
    closePeak();
    ui.view = 'planen';
    fitRoute(s.route);
  }

  function addAsWaypoint() {
    planner.add(peak.lng, peak.lat);
    closePeak();
    ui.view = 'planen';
  }

  const mapsApp = /iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 0 ? 'Apple Karten' : 'Google Maps';
  const DIFF: Record<string, string> = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
</script>

<div class="peak">
  <div class="top">
    <div>
      <div class="kicker">{isPoint ? 'Wie komme ich dahin?' : 'Gipfel'}</div>
      <h2>{isPoint ? '📍' : '⛰️'} {peak.name}</h2>
      {#if peak.ele}<div class="ele">{peak.ele} m</div>{/if}
    </div>
    <button class="x" onclick={closePeak} aria-label="Schließen">✕</button>
  </div>

  {#if peakState.status === 'searching' || peakState.status === 'routing'}
    <p class="status"><span class="spin"></span>{peakState.message}</p>
  {:else if peakState.status === 'error'}
    <p class="err">{peakState.message}</p>
  {/if}

  {#if peakState.suggestions.length}
    <h4>{isPoint ? 'Wanderungen dorthin' : 'Aufstiege – Hin & zurück'}</h4>
    <ul class="list">
      {#each peakState.suggestions as s, i (s.start.id)}
        <li class:sel={peakState.selected === i} onmouseenter={() => (peakState.hover = i)} onmouseleave={() => (peakState.hover = null)}>
          <button class="main" onclick={() => { peakState.selected = peakState.selected === i ? null : i; if (peakState.selected === i) fitRoute(s.route); }}>
            <span class="dot" style:background={SUGGEST_COLORS[i % SUGGEST_COLORS.length]}></span>
            <span class="txt">
              <span class="name">{START_ICON[s.start.kind]} {s.start.name}</span>
              <span class="sub">von {s.start.dir} · {formatDistance(s.meters)} einfach · ↗ {Math.round(s.up)} m</span>
              <span class="sub strong">⏱ {formatDuration(s.hoursUp)} hoch · {formatDuration(s.hoursRound)} gesamt</span>
            </span>
            <span class="diff {s.difficulty}">{DIFF[s.difficulty]}</span>
          </button>
          {#if peakState.selected === i}
            <div class="detail">
              <button class="btn" onclick={() => adopt(s)}>Übernehmen – hin & zurück</button>
              <button class="btn secondary" onclick={() => adopt(s, false)}>Nur hin</button>
              <div class="travel">
                <a class="pill" href={directionsUrl(s.start.lng, s.start.lat, 'car')} target="_blank" rel="noopener">🚗 Anfahrt Auto</a>
                {#if s.transit}
                  <a class="pill" href={directionsUrl(s.transit.lng, s.transit.lat, 'transit')} target="_blank" rel="noopener">🚌 Mit Öffis</a>
                {:else}
                  <a class="pill" href={directionsUrl(s.start.lng, s.start.lat, 'transit')} target="_blank" rel="noopener">🚌 Öffis prüfen</a>
                {/if}
              </div>
              <p class="note">
                {#if s.transit}Haltestelle: {s.transit.name}{s.transit.dist ? ` (${s.transit.dist} m vom Start)` : ''}.{:else}Keine Haltestelle direkt am Start eingetragen.{/if}
                Die Anreise öffnet {mapsApp} mit deinem aktuellen Standort als Start.
              </p>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="note">Automatisch berechnet aus Parkplätzen, Haltestellen und Orten in OpenStreetMap (je Himmelsrichtung der beste). Bitte vor Ort prüfen, ob Parken erlaubt ist und der Weg markiert ist.</p>
  {/if}

  <button class="btn secondary mine" onclick={fromMyLocation} disabled={locating}>{locating ? 'Suche Standort …' : '🧭 Route von meinem Standort hierher'}</button>
  <button class="link" onclick={addAsWaypoint}>{isPoint ? 'Punkt' : 'Gipfel'} stattdessen in die aktuelle Planung setzen</button>
</div>

<style>
  .peak { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .kicker { font-size: .72rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; letter-spacing: .04em; }
  h2 { margin: 0; font-size: 1.35rem; letter-spacing: -0.02em; }
  .ele { color: #8e8e93; font-size: .9rem; }
  .x { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--surface3); color: var(--text2); font-size: .95rem; }
  .status { display: flex; align-items: center; gap: 10px; color: var(--text2); }
  .spin { width: 16px; height: 16px; border-radius: 50%; border: 2.5px solid var(--line); border-top-color: #0a84ff; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .err { color: #ff9f0a; background: rgba(255, 159, 10, .16); border-radius: 12px; padding: 10px 12px; font-size: .9rem; }
  h4 { margin: 12px 4px 6px; font-size: .78rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; letter-spacing: .02em; }
  .list { list-style: none; margin: 0; padding: 0; background: var(--surface); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.05); }
  li + li { border-top: 0.5px solid var(--line); }
  li.sel { background: rgba(10, 132, 255, .10); }
  .main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 12px; border: 0; background: none; text-align: left; }
  .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 600; font-size: .98rem; color: var(--text); }
  .sub { font-size: .8rem; color: #8e8e93; }
  .sub.strong { color: var(--text2); font-weight: 500; }
  .diff { flex: none; font-size: .72rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: #fff; }
  .diff.leicht { background: #34c759; }
  .diff.mittel { background: #ff9500; }
  .diff.schwer { background: #ff3b30; }
  .detail { padding: 0 12px 12px 34px; }
  .detail .btn { width: 100%; background: #007aff; border-color: #0a84ff; border-radius: 12px; }
  .travel { display: flex; gap: 8px; margin-top: 8px; }
  .pill { flex: 1; text-align: center; padding: 10px; border-radius: 12px; background: var(--surface2); color: #0a84ff; font-weight: 600; text-decoration: none; font-size: .9rem; }
  .note { font-size: .75rem; color: #8e8e93; margin: 8px 2px; }
  .mine { width: 100%; margin-top: 12px; border-radius: 12px; }
  .detail .btn.secondary { background: var(--surface2); color: var(--text); border-color: transparent; }
  .link { border: 0; background: none; color: #0a84ff; font-size: .88rem; padding: 8px 2px; }
</style>
