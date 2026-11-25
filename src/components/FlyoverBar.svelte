<script lang="ts">
  import { flyover, SPEEDS } from '../lib/flyover.svelte';
  import { planner } from '../lib/planner.svelte';
  import { formatDistance } from '../lib/geo';

  const total = $derived(planner.cum[planner.cum.length - 1] ?? 0);
  const here = $derived(planner.hover !== null ? planner.route[planner.hover] : null);

  // Leertaste = Start/Pause, Esc = beenden, Pfeile = spulen (am PC)
  $effect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' && (t as HTMLInputElement).type !== 'range') return;
      if (e.key === ' ') { e.preventDefault(); flyover.toggle(); }
      else if (e.key === 'Escape') flyover.stop();
      else if (e.key === 'ArrowRight') flyover.seek(flyover.progress + 0.05);
      else if (e.key === 'ArrowLeft') flyover.seek(flyover.progress - 0.05);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
</script>

<div class="bar" role="group" aria-label="3D-Flug">
  <div class="top">
    <button class="play" onclick={() => flyover.toggle()} aria-label={flyover.playing ? 'Pause' : 'Abspielen'}>
      {flyover.playing ? '❚❚' : '▶'}
    </button>
    <div class="info">
      <b>{formatDistance(flyover.progress * total)}</b> von {formatDistance(total)}
      {#if here?.[2] !== undefined}<span class="ele">· {Math.round(here[2])} m</span>{/if}
    </div>
    <div class="speeds" role="radiogroup" aria-label="Tempo">
      {#each SPEEDS as s}
        <button role="radio" aria-checked={flyover.speed === s} class:sel={flyover.speed === s} onclick={() => (flyover.speed = s)}>
          {s === 0.5 ? '½' : s}×
        </button>
      {/each}
    </div>
    <button class="close" onclick={() => flyover.stop()} aria-label="3D-Flug beenden">✕</button>
  </div>
  <input
    type="range" min="0" max="1000" step="1"
    value={Math.round(flyover.progress * 1000)}
    oninput={(e) => { flyover.pause(); flyover.seek(+e.currentTarget.value / 1000); }}
    aria-label="Position auf der Tour"
  />
  <p class="hint">Mit zwei Fingern (bzw. rechter Maustaste) drehen und kippen · Gelände {flyover.exaggeration.toLocaleString('de-DE')}× überhöht</p>
</div>

<style>
  .bar {
    position: absolute; z-index: 4; left: 10px; right: 10px; bottom: 34px; margin: 0 auto; max-width: 560px;
    background: rgba(20, 28, 22, .88); color: #fff; border-radius: 16px; padding: 10px 12px 6px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, .35); backdrop-filter: blur(6px);
  }
  .top { display: flex; align-items: center; gap: 10px; }
  .play {
    flex: none; width: 52px; height: 52px; border-radius: 50%; border: 0;
    background: #fff; color: #111; font-size: 1.3rem; font-weight: 800;
  }
  .info { flex: 1; min-width: 0; font-size: .9rem; font-variant-numeric: tabular-nums; }
  .ele { color: #cfe6d4; }
  .speeds { display: flex; border: 1px solid rgba(255, 255, 255, .35); border-radius: 10px; overflow: hidden; }
  .speeds button { min-width: 38px; height: 38px; border: 0; background: none; color: #fff; font-weight: 700; }
  .speeds button.sel { background: #fff; color: #111; }
  .close { flex: none; width: 40px; height: 40px; border: 0; background: none; color: #fff; font-size: 1.1rem; border-radius: 8px; }
  .close:hover { background: rgba(255, 255, 255, .15); }
  input[type='range'] { width: 100%; margin: 10px 0 2px; accent-color: #ffd400; height: 28px; }
  .hint { margin: 0; font-size: .7rem; color: #c8d3ca; text-align: center; }
  @media (max-width: 420px) {
    .speeds button { min-width: 32px; }
    .hint { display: none; }
  }
</style>
