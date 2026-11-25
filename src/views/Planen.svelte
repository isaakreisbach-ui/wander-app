<script lang="ts">
  import { planner } from '../lib/planner.svelte';
  import { formatDistance, formatDuration } from '../lib/geo';
  import ElevationProfile from '../components/ElevationProfile.svelte';

  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const s = $derived(planner.stats);
  const n = $derived(planner.waypoints.length);

  function confirmClear() {
    if (confirm('Alle Punkte dieser Tour löschen? (Lässt sich mit „Rückgängig“ zurückholen.)')) planner.clear();
  }
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
  </div>
{:else}
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

  {#if planner.route.length > 1}
    <div class="card profile-card">
      <ElevationProfile route={planner.route} cum={planner.cum} bind:hover={planner.hover} height={coarse ? 120 : 160} />
    </div>
  {/if}

  <div class="tools">
    <button class="tool" onclick={() => planner.undo()} disabled={!planner.canUndo} title="Rückgängig (Strg+Z)">↶<span>Zurück</span></button>
    <button class="tool" onclick={() => planner.redo()} disabled={!planner.canRedo} title="Wiederholen (Strg+Y)">↷<span>Vor</span></button>
    <button class="tool" onclick={() => planner.reverse()} disabled={n < 2} title="Richtung umkehren">⇄<span>Umkehren</span></button>
    <button class="tool danger" onclick={confirmClear} title="Alle Punkte löschen">🗑<span>Löschen</span></button>
  </div>

  <label class="switch">
    <input type="checkbox" checked={planner.followTrails} onchange={(e) => planner.setFollowTrails(e.currentTarget.checked)} />
    <span><b>Wanderwegen folgen</b><small>Aus = gerade Linie zwischen den Punkten (z. B. weglos)</small></span>
  </label>

  <p class="muted small">Gehzeit nach DAV-Formel (4 km/h, 300 Hm/h bergauf, 500 Hm/h bergab), ohne Pausen.
    Routing: BRouter · Speichern unter Namen kommt im nächsten Schritt – der Entwurf bleibt bis dahin erhalten.</p>
{/if}

<style>
  .intro ol { padding-left: 1.3em; margin: 0 0 .75em; }
  .intro li + li { margin-top: 6px; }
  kbd { font: 600 .8rem system-ui; background: #eef1ee; border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }

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
  .error { color: var(--warn); background: #fff4e0; border-radius: 10px; padding: 8px 10px; font-size: .9rem; }

  .profile-card { padding: 8px 6px 4px; }

  .tools { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-bottom: 12px; }
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
  }
</style>
