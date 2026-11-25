<script lang="ts">
  import { fromHere, closeFromHere, FH_COLORS, type PeakOption, type HikeOption } from '../lib/fromhere.svelte';
  import { planner, tourFromTrack } from '../lib/planner.svelte';
  import { confirmDiscard, fitRoute, openTour } from '../lib/tours';
  import { correctElevation } from '../lib/recorder.svelte';
  import { db } from '../lib/db';
  import { formatDistance, formatDuration, type Pt } from '../lib/geo';
  import { ui, toast } from '../lib/ui.svelte';

  const DIFF: Record<string, string> = { leicht: 'Leicht', mittel: 'Mittel', schwer: 'Schwer' };
  const GROUP: Record<string, string> = { LOC: 'Lokaler Weg', REG: 'Regionaler Weg', NAT: 'Fernwanderweg', INT: 'Fernwanderweg' };
  let busy = $state(false);

  const isSel = (type: 'peak' | 'hike', id: string | number) => fromHere.selected?.type === type && fromHere.selected.id === id;
  function select(type: 'peak' | 'hike', id: string | number, route: Pt[]) {
    fromHere.selected = isSel(type, id) ? null : { type, id };
    if (fromHere.selected) fitRoute(route);
  }

  function adoptPeak(p: PeakOption) {
    if (!confirmDiscard() || !fromHere.point) return;
    const a: [number, number] = [fromHere.point.lng, fromHere.point.lat];
    const b: [number, number] = [p.lng, p.lat];
    planner.newPlanFrom(`Zum ${p.name}`, [a, b, a], [{ a, b, pts: p.route }, { a: b, b: a, pts: [...p.route].reverse() }]);
    closeFromHere();
    ui.view = 'planen';
    fitRoute(p.route);
  }

  async function adoptHike(h: HikeOption) {
    busy = true;
    try {
      const pts = await correctElevation(h.route).catch(() => h.route);
      const tour = { ...tourFromTrack(h.ref && !h.name.includes(h.ref) ? `${h.name} (${h.ref})` : h.name, pts, 'link'), source: 'link' as const };
      await db.tours.put(tour);
      closeFromHere();
      openTour(tour);
      toast(`„${tour.name}“ gespeichert`);
    } finally {
      busy = false;
    }
  }
</script>

<div class="fh">
  <div class="top">
    <div>
      <div class="kicker">Von hier aus</div>
      <h2>📍 Was geht von hier?</h2>
    </div>
    <button class="x" onclick={closeFromHere} aria-label="Schließen">✕</button>
  </div>

  <h4>⛰️ Gipfel</h4>
  {#if fromHere.peakStatus === 'loading' && !fromHere.peaks.length}
    <p class="status"><span class="spin"></span>{fromHere.peakMsg}</p>
  {:else if fromHere.peakStatus === 'error' && !fromHere.peaks.length}
    <p class="note">{fromHere.peakMsg}</p>
  {/if}
  {#if fromHere.peaks.length}
    <ul class="list">
      {#each fromHere.peaks as p, i (p.id)}
        <li class:sel={isSel('peak', p.id)}>
          <button class="main" onclick={() => select('peak', p.id, p.route)}>
            <span class="dot" style:background={FH_COLORS[i % FH_COLORS.length]}></span>
            <span class="txt">
              <span class="name">{p.name}{p.ele ? ` · ${p.ele} m` : ''}</span>
              <span class="sub">{formatDistance(p.meters)} · ↗ {Math.round(p.up)} m · ⏱ {formatDuration(p.hoursUp)} hoch</span>
              <span class="sub">Hin & zurück: {formatDuration(p.hoursRound)}</span>
            </span>
            <span class="diff {p.difficulty}">{DIFF[p.difficulty]}</span>
          </button>
          {#if isSel('peak', p.id)}
            <div class="detail"><button class="btn" onclick={() => adoptPeak(p)}>Diese Tour übernehmen</button></div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if fromHere.peakStatus === 'loading'}<p class="status small"><span class="spin"></span>{fromHere.peakMsg}</p>{/if}
  {/if}

  <h4>🥾 Markierte Wanderungen in der Nähe</h4>
  {#if fromHere.hikeStatus === 'loading' && !fromHere.hikes.length}
    <p class="status"><span class="spin"></span>{fromHere.hikeMsg}</p>
  {:else if fromHere.hikeStatus === 'error' && !fromHere.hikes.length}
    <p class="note">{fromHere.hikeMsg}</p>
  {/if}
  {#if fromHere.hikes.length}
    <ul class="list">
      {#each fromHere.hikes as h (h.id)}
        <li class:sel={isSel('hike', h.id)}>
          <button class="main" onclick={() => select('hike', h.id, h.route)}>
            <span class="dot hike"></span>
            <span class="txt">
              <span class="name">{h.name}{h.ref && !h.name.includes(h.ref) ? ` (${h.ref})` : ''}</span>
              <span class="sub">{formatDistance(h.length)} · {h.loop ? 'Rundweg' : 'Streckenwanderung'} · {GROUP[h.group] ?? ''}</span>
              <span class="sub">{h.near < 50 ? 'Führt direkt hier vorbei' : `${formatDistance(h.near)} entfernt`}{h.itinerary ? ` · ${h.itinerary}` : ''}</span>
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
          {#if isSel('hike', h.id)}
            <div class="detail">
              <button class="btn" onclick={() => adoptHike(h)} disabled={busy}>{busy ? 'Speichere …' : 'Als Tour übernehmen'}</button>
              <a class="more" href="https://hiking.waymarkedtrails.org/#route?id={h.id}" target="_blank" rel="noopener">Mehr bei Waymarked Trails ↗</a>
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    {#if fromHere.hikeStatus === 'loading'}<p class="status small"><span class="spin"></span>{fromHere.hikeMsg}</p>{/if}
  {/if}

  <p class="note">Gipfel aus OpenStreetMap (Umkreis 7 km), Wege berechnet mit BRouter. Wanderungen: markierte Wege von Waymarked Trails (lokale und regionale Wege).</p>
</div>

<style>
  .fh { font-family: -apple-system, BlinkMacSystemFont, system-ui, sans-serif; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; }
  .kicker { font-size: .72rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; letter-spacing: .04em; }
  h2 { margin: 0; font-size: 1.3rem; letter-spacing: -0.02em; }
  .x { width: 36px; height: 36px; border-radius: 50%; border: 0; background: #e9e9eb; color: #3a3a3c; }
  h4 { margin: 14px 4px 6px; font-size: .78rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; letter-spacing: .02em; }
  .status { display: flex; align-items: center; gap: 10px; color: #3a3a3c; font-size: .92rem; }
  .status.small { font-size: .8rem; color: #8e8e93; margin-top: 6px; }
  .spin { width: 15px; height: 15px; border-radius: 50%; border: 2.5px solid #d1d1d6; border-top-color: #007aff; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .list { list-style: none; margin: 0; padding: 0; background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.05); }
  li + li { border-top: 0.5px solid #d1d1d6; }
  li.sel { background: #f7f9ff; }
  .main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 0; background: none; text-align: left; }
  .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; }
  .dot.hike { background: #1d7a3e; border-radius: 3px; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 600; font-size: .96rem; color: #1c1c1e; }
  .sub { font-size: .79rem; color: #8e8e93; }
  .diff { flex: none; font-size: .72rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: #fff; }
  .diff.leicht { background: #34c759; }
  .diff.mittel { background: #ff9500; }
  .diff.schwer { background: #ff3b30; }
  .chev { flex: none; color: #c7c7cc; font-size: 1.4rem; }
  .detail { padding: 0 12px 12px 34px; display: flex; flex-direction: column; gap: 8px; }
  .detail .btn { width: 100%; background: #007aff; border-color: #007aff; border-radius: 12px; }
  .more { color: #007aff; font-size: .85rem; text-decoration: none; }
  .note { font-size: .75rem; color: #8e8e93; margin: 8px 2px; }
</style>
