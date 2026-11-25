<script lang="ts">
  // Höhenprofil (uPlot). Maus darüber oder Finger darauf → Stelle wird auf der Karte markiert.
  // Umgekehrt zeigt das Profil die Stelle, über der die Maus auf der Karte steht.
  import uPlot from 'uplot';
  import 'uplot/dist/uPlot.min.css';
  import { onMount } from 'svelte';
  import type { Pt } from '../lib/geo';

  let { route, cum, hover = $bindable(null), height = 150 }: {
    route: Pt[]; cum: number[]; hover?: number | null; height?: number;
  } = $props();

  let box: HTMLDivElement;
  let plot: uPlot | undefined;
  let fromPlot = false;

  function data(): uPlot.AlignedData {
    // Für lange Routen ausdünnen: max. ~1500 Punkte im Diagramm, Index bleibt Routenindex
    const step = Math.max(1, Math.ceil(route.length / 1500));
    const xs: number[] = [], ys: (number | null)[] = [], idx: number[] = [];
    for (let i = 0; i < route.length; i += step) {
      xs.push(cum[i] / 1000);
      ys.push(route[i][2] ?? null);
      idx.push(i);
    }
    if (idx[idx.length - 1] !== route.length - 1 && route.length) {
      const i = route.length - 1;
      xs.push(cum[i] / 1000); ys.push(route[i][2] ?? null); idx.push(i);
    }
    indexMap = idx;
    return [xs, ys];
  }
  let indexMap: number[] = [];

  function makeOpts(width: number): uPlot.Options {
    return {
      width, height,
      padding: [8, 8, 0, 0],
      legend: { show: false },
      cursor: {
        y: false,
        points: { size: 10, fill: '#ffd400', stroke: '#111', width: 2 },
        drag: { x: false, y: false, setScale: false },
      },
      scales: { x: { time: false } },
      axes: [
        {
          stroke: '#4b564d', size: 28, font: '12px system-ui',
          grid: { stroke: '#e6ebe6', width: 1 }, ticks: { show: false },
          values: (_u, v) => v.map((x) => `${x.toLocaleString('de-DE', { maximumFractionDigits: 1 })} km`),
        },
        {
          stroke: '#4b564d', size: 46, font: '12px system-ui',
          grid: { stroke: '#e6ebe6', width: 1 }, ticks: { show: false },
          values: (_u, v) => v.map((y) => `${Math.round(y)} m`),
        },
      ],
      series: [
        {},
        {
          stroke: '#e5246b', width: 2,
          fill: 'rgba(229, 36, 107, 0.15)',
          spanGaps: true,
          points: { show: false },
        },
      ],
      hooks: {
        setCursor: [
          (u) => {
            // Cursor wurde von außen (Karte, 3D-Flug) gesetzt → nicht zurückschreiben,
            // sonst schaukeln sich Karte und Profil gegenseitig auf
            if (applying) return;
            const i = u.cursor.idx;
            const v = i === null || i === undefined ? null : indexMap[i] ?? null;
            if (v === hover) return;
            fromPlot = true;
            hover = v;
            queueMicrotask(() => (fromPlot = false));
          },
        ],
      },
    };
  }

  onMount(() => {
    plot = new uPlot(makeOpts(box.clientWidth || 300), data(), box);

    const ro = new ResizeObserver(() => {
      if (plot && box.clientWidth) plot.setSize({ width: box.clientWidth, height });
    });
    ro.observe(box);

    // Touch: Finger auf dem Profil bewegt die Markierung
    const over = plot.over;
    const touch = (e: TouchEvent) => {
      if (!plot) return;
      const t = e.touches[0];
      if (!t) return;
      const r = over.getBoundingClientRect();
      const left = Math.min(Math.max(t.clientX - r.left, 0), r.width);
      plot.setCursor({ left, top: r.height / 2 });
      e.preventDefault();
    };
    over.addEventListener('touchstart', touch, { passive: false });
    over.addEventListener('touchmove', touch, { passive: false });

    return () => {
      ro.disconnect();
      plot?.destroy();
      plot = undefined;
    };
  });

  let applying = false;

  // Neue Route → Daten tauschen
  $effect(() => {
    const d = data();
    applying = true;
    try { plot?.setData(d); } finally { applying = false; }
  });

  // Hover von der Karte → Cursor im Profil setzen
  $effect(() => {
    const h = hover;
    if (!plot || fromPlot) return;
    if (h === null) return;
    // nächsten Profilindex suchen
    let j = 0;
    while (j < indexMap.length - 1 && indexMap[j + 1] <= h) j++;
    const x = plot.valToPos(plot.data[0][j] as number, 'x');
    const y = plot.valToPos((plot.data[1][j] as number) ?? 0, 'y');
    applying = true;
    try { plot.setCursor({ left: x, top: y }, false); } finally { applying = false; }
  });
</script>

<div class="profile" bind:this={box} onmouseleave={() => (hover = null)} role="img" aria-label="Höhenprofil"></div>

<style>
  .profile { width: 100%; touch-action: pan-y; user-select: none; }
  .profile :global(.u-over) { touch-action: none; }
</style>
