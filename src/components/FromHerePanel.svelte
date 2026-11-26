<script lang="ts">
  import { fromHere, closeFromHere, FH_COLORS, toggleCategory, visible, type PeakOption, type HikeOption } from '../lib/fromhere.svelte';
  import { CATEGORY_STYLE, type RouteCategory } from '../lib/alpine.svelte';

  const CATS: RouteCategory[] = ['wander', 'alpine', 'via_ferrata', 'glacier'];
  const count = (c: RouteCategory) => Object.values(fromHere.cats).filter((x) => x.cat === c).length;
  const hiddenCount = $derived(
    fromHere.peaks.filter((p) => !visible(`p:${p.id}`)).length + fromHere.hikes.filter((h) => !visible(`h:${h.id}`)).length,
  );
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

  <div class="chips" role="group" aria-label="Kategorien ein- und ausblenden">
    {#each CATS as c}
      <button class="chip" class:off={!fromHere.show[c]} style:--c={CATEGORY_STYLE[c].color} aria-pressed={fromHere.show[c]} onclick={() => toggleCategory(c)}>
        {CATEGORY_STYLE[c].icon} {CATEGORY_STYLE[c].label}{fromHere.catStatus === 'done' ? ` (${count(c)})` : ''}
      </button>
    {/each}
  </div>
  {#if fromHere.catStatus === 'loading'}<p class="status small"><span class="spin"></span>Prüfe auf Klettersteige und Gletscher …</p>{/if}
  {#if hiddenCount}<p class="note">{hiddenCount} Vorschläge ausgeblendet.</p>{/if}

  <h4>⛰️ Gipfel</h4>
  {#if fromHere.peakStatus === 'loading' && !fromHere.peaks.length}
    <p class="status"><span class="spin"></span>{fromHere.peakMsg}</p>
  {:else if fromHere.peakStatus === 'error' && !fromHere.peaks.length}
    <p class="note">{fromHere.peakMsg}</p>
  {/if}
  {#if fromHere.peaks.length}
    <ul class="list">
      {#each fromHere.peaks as p, i (p.id)}
        {@const cat = fromHere.cats[`p:${p.id}`]}
        {#if visible(`p:${p.id}`)}
        <li class:sel={isSel('peak', p.id)} onmouseenter={() => (fromHere.hover = { type: 'peak', id: p.id })} onmouseleave={() => (fromHere.hover = null)}>
          <button class="main" onclick={() => select('peak', p.id, p.route)}>
            <span class="dot" style:background={FH_COLORS[i % FH_COLORS.length]}></span>
            <span class="txt">
              <span class="name">{p.name}{p.ele ? ` · ${p.ele} m` : ''}</span>
              <span class="sub">{formatDistance(p.meters)} · ↗ {Math.round(p.up)} m · ⏱ {formatDuration(p.hoursUp)} hoch</span>
              <span class="sub">Hin & zurück: {formatDuration(p.hoursRound)}</span>
              {#if cat}<span class="cat" style:--c={CATEGORY_STYLE[cat.cat].color}>{CATEGORY_STYLE[cat.cat].icon} {CATEGORY_STYLE[cat.cat].label}{cat.grade ? ` ${cat.grade}` : ''}</span>{/if}
            </span>
            <span class="diff {p.difficulty}">{DIFF[p.difficulty]}</span>
          </button>
          {#if isSel('peak', p.id)}
            <div class="detail"><button class="btn" onclick={() => adoptPeak(p)}>Diese Tour übernehmen</button></div>
          {/if}
        </li>
        {/if}
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
        {@const cat = fromHere.cats[`h:${h.id}`]}
        {#if visible(`h:${h.id}`)}
        <li class:sel={isSel('hike', h.id)} onmouseenter={() => (fromHere.hover = { type: 'hike', id: h.id })} onmouseleave={() => (fromHere.hover = null)}>
          <button class="main" onclick={() => select('hike', h.id, h.route)}>
            <span class="dot hike"></span>
            <span class="txt">
              <span class="name">{h.name}{h.ref && !h.name.includes(h.ref) ? ` (${h.ref})` : ''}</span>
              <span class="sub">{formatDistance(h.length)} · {h.loop ? 'Rundweg' : 'Streckenwanderung'} · {GROUP[h.group] ?? ''}</span>
              <span class="sub">{h.near < 50 ? 'Führt direkt hier vorbei' : `${formatDistance(h.near)} entfernt`}{h.itinerary ? ` · ${h.itinerary}` : ''}</span>
              {#if cat}<span class="cat" style:--c={CATEGORY_STYLE[cat.cat].color}>{CATEGORY_STYLE[cat.cat].icon} {CATEGORY_STYLE[cat.cat].label}{cat.grade ? ` ${cat.grade}` : ''}</span>{/if}
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
        {/if}
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
  .x { width: 36px; height: 36px; border-radius: 50%; border: 0; background: var(--surface3); color: var(--text2); }
  h4 { margin: 14px 4px 6px; font-size: .78rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; letter-spacing: .02em; }
  .status { display: flex; align-items: center; gap: 10px; color: var(--text2); font-size: .92rem; }
  .status.small { font-size: .8rem; color: #8e8e93; margin-top: 6px; }
  .spin { width: 15px; height: 15px; border-radius: 50%; border: 2.5px solid var(--line); border-top-color: #0a84ff; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .list { list-style: none; margin: 0; padding: 0; background: var(--surface); border-radius: 16px; overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.05), 0 6px 20px rgba(0,0,0,.05); }
  li + li { border-top: 0.5px solid var(--line); }
  li.sel { background: rgba(10, 132, 255, .10); }
  .main { width: 100%; display: flex; align-items: center; gap: 10px; padding: 11px 12px; border: 0; background: none; text-align: left; }
  .dot { flex: none; width: 12px; height: 12px; border-radius: 50%; }
  .dot.hike { background: #1d7a3e; border-radius: 3px; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-weight: 600; font-size: .96rem; color: var(--text); }
  .sub { font-size: .79rem; color: #8e8e93; }
  .diff { flex: none; font-size: .72rem; font-weight: 600; padding: 2px 9px; border-radius: 999px; color: #fff; }
  .diff.leicht { background: #34c759; }
  .diff.mittel { background: #ff9500; }
  .diff.schwer { background: #ff3b30; }
  .chev { flex: none; color: #c7c7cc; font-size: 1.4rem; }
  .detail { padding: 0 12px 12px 34px; display: flex; flex-direction: column; gap: 8px; }
  .detail .btn { width: 100%; background: #007aff; border-color: #0a84ff; border-radius: 12px; }
  .more { color: #0a84ff; font-size: .85rem; text-decoration: none; }
  .note { font-size: .75rem; color: #8e8e93; margin: 8px 2px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 4px; }
  .chip {
    border: 1.5px solid var(--c); background: color-mix(in srgb, var(--c) 14%, #2c2c2e); color: var(--text);
    border-radius: 999px; padding: 5px 11px; font-size: .8rem; font-weight: 600;
  }
  .chip.off { background: var(--surface); border-color: #d1d1d6; color: #8e8e93; text-decoration: line-through; }
  .cat {
    align-self: flex-start; margin-top: 3px; font-size: .7rem; font-weight: 600; padding: 1px 8px; border-radius: 999px;
    color: var(--c); background: color-mix(in srgb, var(--c) 12%, #2c2c2e);
  }
</style>
