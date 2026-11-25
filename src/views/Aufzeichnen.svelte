<script lang="ts">
  import { liveQuery } from 'dexie';
  import { db, type Tour } from '../lib/db';
  import { recorder, formatClock } from '../lib/recorder.svelte';
  import { recUi } from '../lib/recui.svelte';
  import { planner } from '../lib/planner.svelte';
  import { fitRoute, openTour, confirmDiscard } from '../lib/tours';
  import { distance, formatDistance } from '../lib/geo';
  import { detectPlatform, isStandalone } from '../lib/status.svelte';
  import { toast, ui } from '../lib/ui.svelte';

  const ios = detectPlatform() === 'ios';
  let stopping = $state(false);
  let recName = $state('');
  let saving = $state(false);
  let plans = $state<Tour[]>([]);
  let pick = $state('');

  $effect(() => {
    const sub = liveQuery(() => db.tours.orderBy('updatedAt').reverse().toArray()).subscribe({
      next: (v) => (plans = v.filter((t) => t.kind === 'plan')),
    });
    return () => sub.unsubscribe();
  });

  // ---------- Führung durch die geöffnete Tour ----------
  const hasGuide = $derived(planner.route.length > 1);
  const guide = $derived.by(() => {
    const pos = recorder.position;
    const r = planner.route;
    if (!pos || r.length < 2) return null;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < r.length; i++) {
      const d = distance(pos, r[i]);
      if (d < bestD) { bestD = d; best = i; }
    }
    const cum = planner.cum;
    return { off: bestD, remaining: cum[cum.length - 1] - cum[best] };
  });

  function chooseGuide() {
    const t = plans.find((p) => p.id === pick);
    pick = '';
    if (!t) return;
    if (planner.tourId !== t.id && !confirmDiscard()) return;
    planner.open(t);
    fitRoute(t.route);
  }

  // ---------- Steuerung ----------
  async function start() {
    recUi.follow = true;
    await recorder.start();
  }

  function askStop() {
    const date = new Date(recorder.startedAt ?? Date.now()).toLocaleDateString('de-DE');
    recName = planner.name && hasGuide ? `${planner.name} – gelaufen am ${date}` : `Wanderung am ${date}`;
    stopping = true;
    if (recorder.status === 'recording') recorder.pause();
  }

  async function save() {
    saving = true;
    try {
      const t = await recorder.stop(recName.trim() || 'Wanderung');
      stopping = false;
      if (t) {
        toast(`„${t.name}“ gespeichert`);
        openTour(t);
      } else {
        toast('Zu wenige GPS-Punkte – nichts gespeichert');
      }
    } finally {
      saving = false;
    }
  }

  async function discard() {
    if (!confirm('Aufzeichnung wirklich verwerfen? Sie kann nicht wiederhergestellt werden.')) return;
    await recorder.discard();
    stopping = false;
  }

  const kmh = $derived(recorder.elapsedMs > 60000 ? recorder.distance / 1000 / (recorder.elapsedMs / 3600000) : null);
</script>

{#if recorder.status === 'idle'}
  <div class="card">
    <h2>Tour aufzeichnen</h2>
    <button class="btn big start" onclick={start}>● Aufzeichnung starten</button>

    <div class="guide-pick">
      {#if hasGuide}
        <p>🧭 <b>Führung:</b> {planner.name || 'aktuelle Planung'} <span class="muted">({formatDistance(planner.stats?.meters ?? 0)})</span></p>
      {:else}
        <p class="muted">Optional: Eine geplante Tour als Führung auf der Karte einblenden.</p>
      {/if}
      {#if plans.length}
        <select bind:value={pick} onchange={chooseGuide} aria-label="Geplante Tour als Führung wählen">
          <option value="">{hasGuide ? 'Andere Tour wählen …' : 'Geplante Tour wählen …'}</option>
          {#each plans as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
        </select>
      {/if}
    </div>
  </div>

  <div class="card tips">
    <h3>{ios ? 'Wichtig auf dem iPhone' : 'Gut zu wissen'}</h3>
    <ul>
      <li><b>Bildschirm nicht sperren und die App nicht verlassen.</b> {ios ? 'iOS' : 'Der Browser'} hält das GPS von Web-Apps an, sobald sie im Hintergrund sind.</li>
      <li>Die App hält den Bildschirm während der Aufzeichnung automatisch an{recorder.wakeLock === 'unsupported' ? ' – das wird auf diesem Gerät aber leider nicht unterstützt. Bitte Auto-Sperre in den Einstellungen ausschalten.' : '.'}</li>
      <li>Das kostet Akku: Helligkeit herunterdrehen, Powerbank mitnehmen.</li>
      <li>Jeder Punkt wird sofort gespeichert – stürzt die App ab, geht nichts verloren.</li>
      {#if ios && !isStandalone()}<li class="warn">Du bist gerade in Safari. Zeichne besser in der installierten App auf (Symbol auf dem Homescreen).</li>{/if}
    </ul>
  </div>
{:else}
  {#if recorder.restored}
    <div class="banner info">Eine unterbrochene Aufzeichnung wurde wiederhergestellt. Tippe auf „Fortsetzen“ oder beende sie.</div>
  {/if}
  {#if recorder.gapWarning}
    <div class="banner warn">
      {recorder.gapWarning}
      <button class="x" onclick={() => (recorder.gapWarning = null)} aria-label="Hinweis schließen">✕</button>
    </div>
  {/if}
  {#if recorder.gpsError}<div class="banner warn">{recorder.gpsError}</div>{/if}

  <div class="clock" class:paused={recorder.status === 'paused'}>
    <span class="state">{recorder.status === 'recording' ? '● Aufnahme läuft' : '❚❚ Pausiert'}</span>
    <span class="time">{formatClock(recorder.elapsedMs)}</span>
  </div>

  <div class="tiles">
    <div class="tile"><span class="v">{formatDistance(recorder.distance)}</span><span class="l">Strecke</span></div>
    <div class="tile"><span class="v">↗ {Math.round(recorder.up)} m</span><span class="l">Aufstieg</span></div>
    <div class="tile"><span class="v">↘ {Math.round(recorder.down)} m</span><span class="l">Abstieg</span></div>
    <div class="tile"><span class="v">{recorder.altitude !== null ? `${recorder.altitude} m` : '–'}</span><span class="l">Höhe</span></div>
  </div>

  {#if guide}
    <div class="guide" class:off={guide.off > 60}>
      {#if guide.off > 60}
        ⚠️ Du bist <b>{formatDistance(guide.off)}</b> von der geplanten Route entfernt.
      {:else}
        🧭 Auf der Route · noch ca. <b>{formatDistance(guide.remaining)}</b> bis zum Ziel
      {/if}
    </div>
  {/if}

  {#if !stopping}
    <div class="controls">
      {#if recorder.status === 'recording'}
        <button class="btn big secondary" onclick={() => recorder.pause()}>❚❚ Pause</button>
      {:else}
        <button class="btn big" onclick={() => recorder.resume()}>▶ Fortsetzen</button>
      {/if}
      <button class="btn big stop" onclick={askStop}>■ Beenden</button>
    </div>
  {:else}
    <div class="card stopform">
      <h3>Aufzeichnung beenden</h3>
      <input type="text" bind:value={recName} aria-label="Name der Aufzeichnung" />
      <div class="controls">
        <button class="btn" onclick={save} disabled={saving}>{saving ? 'Speichere …' : 'Speichern'}</button>
        <button class="btn secondary" onclick={() => { stopping = false; recorder.resume(); }} disabled={saving}>Weiter aufzeichnen</button>
      </div>
      <button class="link danger" onclick={discard} disabled={saving}>Aufzeichnung verwerfen</button>
      {#if navigator.onLine}<p class="muted small">Beim Speichern werden die Höhen mit einem Geländemodell korrigiert (genauer als GPS).</p>{/if}
    </div>
  {/if}

  <div class="status-row">
    <span>GPS: {recorder.accuracy !== null ? `± ${Math.round(recorder.accuracy)} m` : 'wird gesucht …'}</span>
    <span>Bildschirm: {recorder.wakeLock === 'on' ? 'bleibt an ✓' : recorder.wakeLock === 'unsupported' ? 'nicht steuerbar' : 'aus'}</span>
    {#if kmh}<span>Ø {kmh.toFixed(1).replace('.', ',')} km/h</span>{/if}
    <span>{recorder.points.length} Punkte</span>
  </div>

  {#if !recUi.follow && recorder.status === 'recording'}
    <button class="btn secondary follow" onclick={() => (recUi.follow = true)}>📍 Karte wieder mitführen</button>
  {/if}
  <button class="link" onclick={() => (ui.view = 'karte')}>Nur Karte zeigen</button>
{/if}

<style>
  h3 { margin: 0 0 6px; font-size: 1rem; }
  .big { width: 100%; min-height: 64px; font-size: 1.15rem; }
  .start { background: #c62828; border-color: #c62828; margin-bottom: 12px; }
  .guide-pick p { margin: 0 0 6px; }
  select { width: 100%; min-height: 48px; font: inherit; font-size: 16px; border-radius: 10px; border: 1px solid var(--line); padding: 0 10px; background: #fff; }
  .tips ul { padding-left: 1.1em; margin: 0; }
  .tips li { margin-bottom: 6px; font-size: .92rem; }
  .tips .warn { color: var(--warn); font-weight: 650; }

  .banner { position: relative; border-radius: 12px; padding: 10px 36px 10px 12px; margin-bottom: 10px; font-size: .9rem; }
  .banner.info { background: #e7f0fb; }
  .banner.warn { background: #fff1d6; }
  .banner .x { position: absolute; top: 4px; right: 4px; width: 32px; height: 32px; border: 0; background: none; }

  .clock {
    display: flex; flex-direction: column; align-items: center;
    background: #1b1f1c; color: #fff; border-radius: 16px; padding: 10px; margin-bottom: 8px;
  }
  .clock .state { font-size: .85rem; font-weight: 700; color: #ff5252; letter-spacing: .03em; }
  .clock.paused .state { color: #ffd54f; }
  .clock .time { font-size: 2.6rem; font-weight: 800; font-variant-numeric: tabular-nums; line-height: 1.1; }

  .tiles { display: grid; grid-template-columns: repeat(2, 1fr); gap: 6px; margin-bottom: 8px; }
  .tile { background: var(--surface); border: 1px solid var(--line); border-radius: 12px; padding: 8px; text-align: center; display: flex; flex-direction: column; }
  .tile .v { font-size: 1.45rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .tile .l { font-size: .78rem; color: var(--muted); font-weight: 600; }

  .guide { background: var(--green-soft); border-radius: 12px; padding: 10px 12px; margin-bottom: 8px; font-size: .95rem; }
  .guide.off { background: #fde2e1; }

  .controls { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px; }
  .stop { background: #1b1f1c; border-color: #1b1f1c; }
  .stopform input { width: 100%; height: 48px; padding: 0 12px; font: inherit; font-size: 16px; border-radius: 10px; border: 1px solid var(--line); margin-bottom: 8px; }
  .status-row { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: .8rem; color: var(--muted); margin: 4px 0 10px; }
  .follow { width: 100%; margin-bottom: 8px; }
  .link { border: 0; background: none; color: var(--green); font-weight: 650; text-decoration: underline; padding: 6px 0; font-size: .9rem; }
  .link.danger { color: var(--bad); }
  .small { font-size: .78rem; }
  @media (min-width: 900px) {
    .tiles { grid-template-columns: repeat(4, 1fr); }
    .tile .v { font-size: 1.15rem; }
  }
</style>
