<script lang="ts">
  // Unterwegs-Modus: während der Aufzeichnung große, gut ablesbare Zahlen –
  // oder die Karte. Umschalten jederzeit per Knopf.
  import { recorder, formatClock } from '../lib/recorder.svelte';
  import { recUi } from '../lib/recui.svelte';
  import { planner } from '../lib/planner.svelte';
  import { distance, formatDistance } from '../lib/geo';
  import { ui } from '../lib/ui.svelte';

  const km = (m: number) => (m / 1000).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const guide = $derived.by(() => {
    const pos = recorder.position, r = planner.route;
    if (!pos || r.length < 2) return null;
    let best = 0, bd = Infinity;
    for (let i = 0; i < r.length; i++) { const d = distance(pos, r[i]); if (d < bd) { bd = d; best = i; } }
    return { off: bd, remaining: planner.cum[planner.cum.length - 1] - planner.cum[best] };
  });
</script>

{#if recorder.status !== 'idle'}
  {#if recUi.mode === 'zahlen'}
    <div class="hud" role="region" aria-label="Unterwegs-Anzeige">
      <div class="state" class:paused={recorder.status === 'paused'}>
        {recorder.status === 'recording' ? '● Aufnahme' : '❚❚ Pausiert'}
      </div>
      <div class="time">{formatClock(recorder.elapsedMs)}</div>
      <div class="grid">
        <div><span class="v">{km(recorder.distance)}</span><span class="l">km</span></div>
        <div><span class="v">{Math.round(recorder.up)}</span><span class="l">m ↗ Aufstieg</span></div>
        <div><span class="v">{recorder.altitude ?? '–'}</span><span class="l">m Höhe</span></div>
        <div><span class="v">{Math.round(recorder.down)}</span><span class="l">m ↘ Abstieg</span></div>
      </div>
      {#if guide}
        <div class="guide" class:off={guide.off > 60}>
          {#if guide.off > 60}⚠️ {formatDistance(guide.off)} neben der Route
          {:else}🧭 noch {formatDistance(guide.remaining)} bis zum Ziel{/if}
        </div>
      {/if}
      <div class="actions">
        {#if recorder.status === 'recording'}
          <button class="b" onclick={() => recorder.pause()}>❚❚ Pause</button>
        {:else}
          <button class="b go" onclick={() => recorder.resume()}>▶ Weiter</button>
        {/if}
        <button class="b map" onclick={() => (recUi.mode = 'karte')}>🗺️ Karte</button>
      </div>
      <button class="end" onclick={() => { recUi.mode = 'karte'; ui.view = 'aufzeichnen'; }}>■ Beenden …</button>
      <p class="gps">GPS ± {recorder.accuracy !== null ? Math.round(recorder.accuracy) : '–'} m</p>
    </div>
  {:else}
    <button class="pill" onclick={() => (recUi.mode = 'zahlen')}>
      <span class="dot" class:paused={recorder.status === 'paused'}></span>
      {formatClock(recorder.elapsedMs)} · {km(recorder.distance)} km · 🔢 Zahlen
    </button>
  {/if}
{/if}

<style>
  .hud {
    position: fixed; z-index: 35; left: 0; right: 0;
    top: calc(52px + var(--safe-top)); bottom: calc(var(--tabbar) + var(--safe-bottom));
    background: #0b0b0c; color: #fff; display: flex; flex-direction: column; align-items: center;
    padding: 18px 16px; gap: 14px; overflow-y: auto;
  }
  .state { font-weight: 700; color: #ff453a; letter-spacing: .04em; }
  .state.paused { color: #ffd60a; }
  .time { font-size: clamp(3.5rem, 18vw, 6rem); font-weight: 700; font-variant-numeric: tabular-nums; letter-spacing: -0.03em; line-height: 1; }
  .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 520px; }
  .grid > div { background: #1c1c1e; border-radius: 18px; padding: 14px 10px; text-align: center; display: flex; flex-direction: column; }
  .v { font-size: clamp(2.2rem, 11vw, 3.4rem); font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1.05; }
  .l { color: #98989d; font-size: .9rem; font-weight: 600; }
  .guide { background: rgba(48, 209, 88, .18); color: #7ee0a6; border-radius: 14px; padding: 10px 14px; font-weight: 650; font-size: 1.05rem; }
  .guide.off { background: rgba(255, 69, 58, .2); color: #ff6961; }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 520px; }
  .b { min-height: 60px; border-radius: 16px; border: 0; font-size: 1.1rem; font-weight: 700; background: #2c2c2e; color: #fff; }
  .b.go { background: #30d158; color: #000; }
  .b.map { background: #0a84ff; }
  .gps { color: #636366; font-size: .8rem; margin: 0; }
  .end { border: 0; background: none; color: #ff453a; font-weight: 700; font-size: 1rem; padding: 6px 12px; }
  .pill {
    position: fixed; z-index: 30; left: 50%; transform: translateX(-50%);
    top: calc(64px + var(--safe-top) + 56px);
    border: 0; border-radius: 999px; padding: 10px 16px; font-weight: 700; font-size: .95rem;
    background: rgba(20, 20, 22, .9); color: #fff; box-shadow: 0 4px 16px rgba(0, 0, 0, .4);
    display: flex; align-items: center; gap: 8px; font-variant-numeric: tabular-nums;
  }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #ff453a; }
  .dot.paused { background: #ffd60a; }
  @media (min-width: 900px) { .hud { left: var(--sidebar); top: 52px; bottom: 0; } }
</style>
