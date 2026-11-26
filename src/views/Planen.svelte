<script lang="ts">
  import { planner, defaultTourName } from '../lib/planner.svelte';
  import { formatDistance, formatDuration } from '../lib/geo';
  import { exportTour, confirmDiscard } from '../lib/tours';
  import { toast, ui } from '../lib/ui.svelte';

  function share() {
    ui.share = {
      name: planner.name.trim() || defaultTourName(),
      kind: planner.kind,
      route: planner.route,
      segStart: planner.segStart,
      followTrails: planner.followTrails,
      waypoints: planner.waypoints,
    };
  }
  import ElevationProfile from '../components/ElevationProfile.svelte';
  import WeatherCard from '../components/WeatherCard.svelte';
  import OfflineTourCard from '../components/OfflineTourCard.svelte';
  import GearCard from '../components/GearCard.svelte';
  import AlpineCard from '../components/AlpineCard.svelte';
  import StartTimeCard from '../components/StartTimeCard.svelte';
  import RoutePoisCard from '../components/RoutePoisCard.svelte';
  import { flyover } from '../lib/flyover.svelte';
  import { mapSettings, saveMapSettings, mapState } from '../lib/map.svelte';
  import { favs } from '../lib/favorites.svelte';
  import RoundTripCard from '../components/RoundTripCard.svelte';
  let showRound = $state(false);

  // Anteil der Strecke je Steilheit (in km)
  const gradeShare = $derived.by(() => {
    const g = planner.grades, c = planner.cum;
    const m = { easy: 0, medium: 0, hard: 0 };
    for (let i = 0; i < g.length - 1; i++) { const k = g[i]; if (k) m[k] += c[i + 1] - c[i]; }
    const f = (v: number) => `${(v / 1000).toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} km`;
    return { easy: f(m.easy), medium: f(m.medium), hard: f(m.hard) };
  });

  function start3d() {
    if (!navigator.onLine) {
      alert('Für den 3D-Flug wird Internet benötigt (Geländedaten).');
      return;
    }
    // Auf dem Handy die ganze Karte zeigen
    if (!window.matchMedia('(min-width: 900px)').matches) ui.view = 'karte';
    flyover.start();
  }

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const s = $derived(planner.stats);
  const n = $derived(planner.waypoints.length);
  let saving = $state(false);

  function confirmClear() {
    if (confirm('Alle Punkte dieser Tour löschen? (Lässt sich mit „Rückgängig“ zurückholen.)')) planner.clear();
  }

  async function save(asNew = false) {
    if (n < 2 || saving) return;
    saving = true;
    try {
      const t = await planner.save(asNew);
      toast(asNew ? `Als neue Tour „${t.name}“ gespeichert` : `„${t.name}“ gespeichert`);
    } catch (e) {
      alert(`Speichern fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      saving = false;
    }
  }

  function newTour() {
    if (!confirmDiscard()) return;
    planner.newTour();
  }

  // Strg+S speichert
  $effect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
</script>

{#if n === 0}
  <div class="card intro">
    <h2>Tour planen</h2>
    <ol>
      <li><b>{coarse ? 'Tippe' : 'Klicke'} auf die Karte</b>, um den Startpunkt zu setzen.</li>
      <li>Weitere {coarse ? 'Tipps' : 'Klicks'} setzen die nächsten Punkte – die Route folgt automatisch den Wanderwegen.</li>
      <li>Punkte lassen sich <b>verschieben</b> (ziehen) und per {coarse ? 'Antippen' : 'Klick'} <b>löschen</b>.</li>
      <li>{coarse ? 'Tippe' : 'Klicke'} auf die Linie, um dort einen <b>Zwischenpunkt</b> einzufügen.</li>
    </ol>
    {#if !coarse}
      <p class="muted">Rechtsklick auf die Karte öffnet ein Menü. Rückgängig: <kbd>Strg+Z</kbd>, Wiederholen: <kbd>Strg+Y</kbd>.</p>
    {/if}
    <p class="muted">Tipp: Mit der Suche oben springst du schnell zum Startort.</p>
    {#if favs.list.length}
      <div class="favs">
        {#each favs.list as f (f.id)}
          <button class="fav" onclick={() => { planner.add(f.lng, f.lat); mapState.map?.flyTo({ center: [f.lng, f.lat], zoom: 14 }); }}>⭐ Start bei {f.name}</button>
        {/each}
      </div>
    {/if}
    <button class="btn round" onclick={() => (showRound = !showRound)}>🔄 Rundtour vorschlagen</button>
    {#if showRound}<RoundTripCard />{/if}
  </div>
{:else}
  <div class="savebar">
    <input
      class="name"
      type="text"
      value={planner.name}
      oninput={(e) => planner.setName(e.currentTarget.value)}
      placeholder={defaultTourName()}
      aria-label="Name der Tour"
      enterkeyhint="done"
    />
    <button class="btn save" onclick={() => save()} disabled={n < 2 || saving || (!planner.dirty && !!planner.tourId)}>
      {saving ? '…' : !planner.dirty && planner.tourId ? '✓ Gespeichert' : 'Speichern'}
    </button>
  </div>
  <div class="savemeta">
    {#if planner.tourId}
      {planner.dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert unter „Touren“'}
      · <button class="link" onclick={() => save(true)} disabled={n < 2}>Als Kopie speichern</button>
    {:else}
      Neue Tour – noch nicht gespeichert
    {/if}
    · <button class="link" onclick={newTour}>Neue Tour</button>
  </div>

  <div class="stats" aria-live="polite">
    <div class="stat"><span class="v">{s ? formatDistance(s.meters) : '–'}</span><span class="l">Strecke</span></div>
    <div class="stat"><span class="v">{s ? `${Math.round(s.up)} m` : '–'}</span><span class="l">Aufstieg</span></div>
    <div class="stat"><span class="v">{s ? `${Math.round(s.down)} m` : '–'}</span><span class="l">Abstieg</span></div>
    <div class="stat"><span class="v">{s ? formatDuration(s.hours) : '–'}</span><span class="l">Gehzeit</span></div>
  </div>

  {#if s}
    <div class="meta">
      <span class="diff {s.difficulty}">{s.difficulty}</span>
      {#if s.minEle !== null && s.maxEle !== null}
        <span class="muted">Höhe {Math.round(s.minEle)}–{Math.round(s.maxEle)} m</span>
      {/if}
      {#if planner.routing}<span class="busy">Route wird berechnet …</span>{/if}
    </div>
  {:else}
    <p class="muted">{planner.routing ? 'Route wird berechnet …' : 'Setze einen zweiten Punkt.'}</p>
  {/if}

  {#if planner.error}<p class="error" role="alert">{planner.error}</p>{/if}
  {#if planner.straight.some(Boolean)}
    <p class="legend">
      <span class="dash" aria-hidden="true"></span>
      <span><b>Gestrichelt = Luftlinie</b> – dort gibt es laut Karte keinen Weg
        ({planner.straight.filter(Boolean).length} von {planner.straight.length} Abschnitten).
        Durchgezogen = folgt einem echten Weg.</span>
    </p>
  {/if}

  {#if planner.route.length > 1}
    <div class="card profile-card">
      <ElevationProfile route={planner.route} cum={planner.cum} bind:hover={planner.hover} height={coarse ? 120 : 160} />
    </div>
    <div class="steep">
      <label class="ios-row">
        <span class="lbl"><b>Steilheit farbig</b><small>Route nach Steigung einfärben</small></span>
        <input type="checkbox" class="ios-switch" checked={mapSettings.diffColors}
          onchange={(e) => { mapSettings.diffColors = e.currentTarget.checked; saveMapSettings(); }} />
      </label>
      {#if mapSettings.diffColors}
        <div class="legend3">
          <span><i style="background:#34c759"></i>leicht &lt; 10 % <b>{gradeShare.easy}</b></span>
          <span><i style="background:#ff9500"></i>mittel 10–20 % <b>{gradeShare.medium}</b></span>
          <span><i style="background:#ff3b30"></i>steil &gt; 20 % <b>{gradeShare.hard}</b></span>
        </div>
        <p class="tiny">Berechnet aus Steigung bzw. Gefälle (über 100 m gemittelt). Wegbeschaffenheit wie Geröll oder Kletterstellen ist nicht enthalten.</p>
      {/if}
    </div>
    <button class="btn secondary fly" onclick={start3d} disabled={planner.routing || flyover.active}>
      🎥 {flyover.active ? '3D-Flug läuft …' : '3D-Flug über die Tour'}
    </button>
  {/if}

  <div class="tools">
    <button class="tool" onclick={() => planner.undo()} disabled={!planner.canUndo} title="Rückgängig (Strg+Z)">↶<span>Zurück</span></button>
    <button class="tool" onclick={() => planner.redo()} disabled={!planner.canRedo} title="Wiederholen (Strg+Y)">↷<span>Vor</span></button>
    <button class="tool" onclick={() => planner.reverse()} disabled={n < 2} title="Richtung umkehren">⇄<span>Umkehren</span></button>
    <button class="tool share" onclick={share} disabled={n < 2 || planner.routing} title="Per Link oder QR-Code aufs Handy schicken">📲<span>Teilen</span></button>
    <button class="tool" onclick={() => exportTour({ name: planner.name || defaultTourName(), route: planner.route, waypoints: planner.waypoints })} disabled={n < 2} title="Als GPX-Datei exportieren">⤓<span>GPX</span></button>
    <button class="tool danger" onclick={confirmClear} title="Alle Punkte löschen">🗑<span>Leeren</span></button>
  </div>

  {#if planner.route.length > 1 && !planner.routing}
    <AlpineCard />
    <WeatherCard route={planner.route} />
    {#if planner.stats}<StartTimeCard stats={planner.stats} />{/if}
    {#if planner.stats}<GearCard stats={planner.stats} tourKey={planner.tourId ?? 'entwurf'} />{/if}
    <RoutePoisCard />
    <OfflineTourCard route={planner.route} tourId={planner.tourId} name={planner.name || defaultTourName()} />
  {/if}

  <label class="switch">
    <input type="checkbox" checked={planner.followTrails} onchange={(e) => planner.setFollowTrails(e.currentTarget.checked)} />
    <span><b>Wanderwegen folgen</b><small>Aus = gerade Linie zwischen den Punkten (z. B. weglos)</small></span>
  </label>

  <p class="muted small">Gehzeit nach DAV-Formel (4 km/h, 300 Hm/h bergauf, 500 Hm/h bergab), ohne Pausen.
    Routing: BRouter.{#if !coarse}{' '}Speichern: <kbd>Strg+S</kbd>.{/if}</p>
{/if}

<style>
  .intro ol { padding-left: 1.3em; margin: 0 0 .75em; }
  .intro li + li { margin-top: 6px; }
  kbd { font: 600 .8rem system-ui; background: var(--surface2); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }

  .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 8px; }
  .stat {
    background: var(--surface); border: 1px solid var(--line); border-radius: 12px;
    padding: 8px 4px; text-align: center; display: flex; flex-direction: column;
  }
  .v { font-size: 1.15rem; font-weight: 800; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .l { font-size: .75rem; color: var(--muted); font-weight: 600; }

  .meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
  .diff { font-weight: 800; text-transform: capitalize; padding: 2px 12px; border-radius: 999px; color: #fff; }
  .diff.leicht { background: #1d7a3e; }
  .diff.mittel { background: #c77700; }
  .diff.schwer { background: #b3261e; }
  .busy { color: var(--green); font-weight: 600; font-size: .9rem; }
  .error { color: var(--warn); background: rgba(255, 159, 10, .16); border-radius: 10px; padding: 8px 10px; font-size: .9rem; }

  .profile-card { padding: 8px 6px 4px; }
  .fly { width: 100%; margin: 0 0 12px; }
  .favs { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0 10px; }
  .fav { border: 0; border-radius: 999px; background: var(--surface2); color: var(--text); padding: 8px 12px; font-weight: 600; font-size: .85rem; }
  .round { width: 100%; margin-top: 6px; }
  .steep { background: var(--surface); border-radius: 16px; padding: 4px 14px; margin: -4px 0 10px; box-shadow: 0 1px 2px rgba(0, 0, 0, .05), 0 6px 20px rgba(0, 0, 0, .05); }
  .ios-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; cursor: pointer; }
  .lbl { display: flex; flex-direction: column; }
  .lbl b { font-weight: 600; font-size: .98rem; }
  .lbl small { color: #8e8e93; font-size: .8rem; }
  .ios-switch {
    appearance: none; -webkit-appearance: none; flex: none; position: relative;
    width: 51px; height: 31px; border-radius: 999px; background: var(--surface3); transition: background .2s; cursor: pointer; margin: 0;
  }
  .ios-switch::after {
    content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%;
    background: var(--surface); box-shadow: 0 2px 4px rgba(0, 0, 0, .2); transition: transform .2s;
  }
  .ios-switch:checked { background: #34c759; }
  .ios-switch:checked::after { transform: translateX(20px); }
  .legend3 { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; padding: 2px 0 6px; }
  .legend3 span { display: inline-flex; align-items: center; gap: 6px; }
  .legend3 i { width: 18px; height: 5px; border-radius: 3px; display: inline-block; }
  .legend3 b { font-weight: 600; color: var(--text2); }
  .tiny { font-size: .72rem; color: #8e8e93; margin: 0 0 8px; }
  .legend { display: flex; gap: 10px; align-items: flex-start; font-size: .85rem; background: rgba(255, 159, 10, .16); border-radius: 10px; padding: 8px 10px; }
  .dash {
    flex: none; width: 34px; height: 5px; margin-top: 7px;
    background: repeating-linear-gradient(90deg, #e5246b 0 7px, transparent 7px 12px);
  }

  .savebar { display: flex; gap: 8px; margin-bottom: 4px; }
  .name {
    flex: 1; min-width: 0; height: 48px; padding: 0 12px;
    border: 1px solid var(--line); border-radius: 12px; background: var(--surface);
    font: inherit; font-size: 16px; font-weight: 650;
  }
  .name:focus { outline: 2px solid var(--green); border-color: transparent; }
  .save { min-height: 48px; padding: 0 16px; white-space: nowrap; }
  .save:disabled { opacity: .55; cursor: default; }
  .savemeta { font-size: .8rem; color: var(--muted); margin-bottom: 10px; }
  .link { border: 0; background: none; padding: 0; color: var(--green); font-weight: 650; text-decoration: underline; font-size: inherit; }
  .link:disabled { color: #aaa; }

  .tools { display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; margin-bottom: 12px; }
  .tool.share span { color: var(--green); }
  .tool {
    min-height: 56px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface);
    display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 1.3rem; line-height: 1;
  }
  .tool span { font-size: .75rem; font-weight: 600; margin-top: 4px; color: var(--muted); }
  .tool:disabled { opacity: .4; cursor: default; }
  .tool.danger span { color: var(--bad); }

  .switch { display: flex; gap: 12px; align-items: center; margin-bottom: 12px; cursor: pointer; }
  .switch input { width: 24px; height: 24px; accent-color: var(--green); flex: none; }
  .switch small { display: block; color: var(--muted); font-size: .8rem; }
  .small { font-size: .78rem; }

  @media (pointer: fine) {
    .tool { min-height: 46px; }
    .name, .save { height: 40px; min-height: 40px; }
  }
</style>
