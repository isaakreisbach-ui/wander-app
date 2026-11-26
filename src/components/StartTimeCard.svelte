<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  import { recommendStart, hm, type StartRec } from '../lib/starttime';
  import { wxShared } from '../lib/wxshared.svelte';
  import { planner } from '../lib/planner.svelte';
  import { alpineState } from '../lib/alpine.svelte';
  import type { TourStats } from '../lib/db';

  let { stats }: { stats: TourStats } = $props();
  let rec = $state<StartRec | null>(null);

  $effect(() => {
    const s = stats, wx = wxShared.current, start = planner.route[0];
    const glacier = alpineState.status === 'done' && alpineState.sections.some((x) => x.kind === 'glacier');
    if (!start) return;
    let cancelled = false;
    recommendStart(s, wx, start[1], start[0], glacier).then((r) => { if (!cancelled) rec = r; });
    return () => { cancelled = true; };
  });

  const CROWD = ['ruhig', 'mittel', 'voll'];
  const CROWD_COLOR = ['#34c759', '#ff9500', '#ff3b30'];
  const HOURS = Array.from({ length: 15 }, (_, i) => 6 + i); // 6–20 Uhr
  const summary = $derived(rec ? `${hm(rec.best)} Uhr · zurück ca. ${hm(rec.end)} · ${CROWD[rec.crowdBest]}` : '');
</script>

{#if rec}
  <Disclosure id="start" icon="🕗" tint="#5856d6" title="Beste Startzeit" {summary}>
    <div class="hero">
      <div class="big">{hm(rec.best)}<span> Uhr</span></div>
      <div class="meta">
        <div>zurück ca. <b>{hm(rec.end)} Uhr</b></div>
        <div>spätestens los: <b>{hm(rec.latest)} Uhr</b></div>
        <div class="day">{rec.dayLabel} · {rec.dayType}</div>
      </div>
    </div>

    {#each rec.warnings as w}<p class="warn">⚠️ {w}</p>{/each}

    <h4>Andrang (geschätzt)</h4>
    <div class="timeline" aria-label="Geschätzter Andrang nach Uhrzeit">
      {#each HOURS as h}
        {@const c = rec.crowdAt(h + 0.5)}
        {@const onTour = h + 1 > rec.best && h < rec.end}
        <div class="slot" class:tour={onTour} title="{h}–{h + 1} Uhr: {CROWD[c]}">
          <div class="bar" style:height="{8 + c * 10}px" style:background={CROWD_COLOR[c]}></div>
          <span>{h % 2 === 0 ? h : ''}</span>
        </div>
      {/each}
    </div>
    <p class="legend"><i style="background:#34c759"></i>ruhig <i style="background:#ff9500"></i>mittel <i style="background:#ff3b30"></i>voll · umrandet = deine Zeit unterwegs</p>

    <ul class="reasons">
      {#each rec.reasons as r}<li>{r}</li>{/each}
    </ul>
    <p class="note">Die Auslastung ist eine Schätzung aus Wochentag, Feiertag, Uhrzeit, Jahreszeit und Wetter – echte Besucherzahlen gibt es nicht frei. Schulferien sind nicht berücksichtigt. Den Tag wählst du in der Wetter-Box.</p>
  </Disclosure>
{/if}

<style>
  .hero { display: flex; align-items: center; gap: 16px; margin: 2px 0 8px; }
  .big { font-size: 2.6rem; font-weight: 700; letter-spacing: -0.03em; color: var(--text); font-variant-numeric: tabular-nums; }
  .big span { font-size: 1rem; font-weight: 500; color: #8e8e93; }
  .meta { font-size: .85rem; color: var(--text2); display: flex; flex-direction: column; gap: 2px; }
  .day { color: #8e8e93; font-size: .78rem; }
  .warn { background: rgba(255, 69, 58, .16); color: #ff6961; border-radius: 12px; padding: 8px 12px; font-size: .86rem; font-weight: 600; margin: 0 0 8px; }
  h4 { margin: 10px 2px 6px; font-size: .78rem; font-weight: 600; text-transform: uppercase; color: #8e8e93; }
  .timeline { display: grid; grid-template-columns: repeat(15, 1fr); gap: 3px; align-items: end; height: 44px; }
  .slot { display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; border-radius: 6px; }
  .slot.tour { background: rgba(94, 92, 230, .22); box-shadow: inset 0 0 0 1.5px #5856d6; }
  .bar { width: 70%; border-radius: 3px; }
  .slot span { font-size: .6rem; color: #8e8e93; height: 12px; }
  .legend { font-size: .72rem; color: #8e8e93; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin: 6px 2px; }
  .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; }
  .reasons { margin: 6px 0 0; padding-left: 1.1em; font-size: .85rem; color: var(--text2); }
  .reasons li { margin-bottom: 4px; }
  .note { font-size: .72rem; color: #8e8e93; margin: 8px 2px 0; }
</style>
