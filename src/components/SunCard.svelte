<script lang="ts">
  // Sonne und Schatten am Weg – für den in der Wetter-Box gewählten Tag und eine Startzeit.
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';
  import { wxShared } from '../lib/wxshared.svelte';
  import { routeBbox } from '../lib/offline.svelte';
  import { loadDem, inSun, sunPosition, sampleRoute, type Dem } from '../lib/sunshade';
  import { walkingTimeHours } from '../lib/geo';

  let dem = $state.raw<Dem | null>(null);
  let status = $state<'idle' | 'loading' | 'error'>('idle');
  let open = $state(localStorage.getItem('wander.disclosure.sun') === '1');
  let demKey = '';
  let startH = $state(9);

  const day = $derived(wxShared.current?.day.date ?? new Date().toISOString().slice(0, 10));
  const dayLabel = $derived(new Date(day + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' }));

  // Erst laden, wenn die Box geöffnet wird (spart Daten)
  $effect(() => {
    if (!open || planner.route.length < 2 || !navigator.onLine) return;
    const b = routeBbox(planner.route);
    const key = b.map((v) => v.toFixed(3)).join(',');
    if (key === demKey) return;
    demKey = key;
    status = 'loading';
    const pad = 0.1;
    loadDem([b[0] - pad, b[1] - pad * 0.7, b[2] + pad, b[3] + pad * 0.7])
      .then((d) => { dem = d; status = 'idle'; })
      .catch(() => { status = 'error'; demKey = ''; });
  });

  const samples = $derived(planner.route.length > 1 ? sampleRoute(planner.route, planner.cum, 200) : []);
  // geschätzte Gehzeit bis zu jedem Abtastpunkt (DAV), auf die Gesamtzeit abgeglichen
  const hoursAt = $derived.by(() => {
    let up = 0, down = 0;
    const out: number[] = [];
    samples.forEach((s, i) => {
      if (i) { const d = (s.p[2] ?? 0) - (samples[i - 1].p[2] ?? 0); if (d > 0) up += d; else down -= d; }
      out.push(walkingTimeHours(s.m, up, down));
    });
    const f = out.at(-1) ? (planner.stats?.hours ?? out.at(-1)!) / out.at(-1)! : 1;
    return out.map((h) => h * f);
  });
  const at = (h: number) => new Date(`${day}T00:00`).getTime() + h * 3600e3;

  // Unterwegs: Sonne/Schatten an jedem Punkt zur Uhrzeit, zu der man dort ist
  const along = $derived.by(() => {
    if (!dem) return null;
    return samples.map((s, i) => {
      const sun = sunPosition(new Date(at(startH + hoursAt[i])), s.p[1], s.p[0]);
      return sun.alt <= 0 ? 'night' : inSun(dem!, s.p, sun) ? 'sun' : 'shade';
    });
  });
  const share = $derived(along ? Math.round((along.filter((x) => x === 'sun').length / along.length) * 100) : 0);
  const nightShare = $derived(along ? along.filter((x) => x === 'night').length / along.length : 0);

  // Überblick: Anteil der Route in der Sonne je Stunde
  const hours = $derived.by(() => {
    if (!dem || !samples.length) return [];
    const step = Math.max(1, Math.floor(samples.length / 40));
    const pick = samples.filter((_, i) => i % step === 0);
    const out: { h: number; pct: number }[] = [];
    for (let h = 6; h <= 19; h++) {
      const n = pick.filter((s) => inSun(dem!, s.p, sunPosition(new Date(at(h)), s.p[1], s.p[0]))).length;
      out.push({ h, pct: Math.round((n / pick.length) * 100) });
    }
    return out.filter((x, i, a) => x.pct > 0 || (a[i - 1]?.pct ?? 0) > 0 || (a[i + 1]?.pct ?? 0) > 0);
  });

  const COLORS = { sun: '#ffd60a', shade: '#5e5ce6', night: '#1c1c1e' };
  const summary = $derived(
    status === 'loading' ? 'Berechne aus dem Gelände …'
      : along ? `Start ${startH}:00 · ca. ${share} % in der Sonne` : 'Wo scheint die Sonne, wo ist Schatten?',
  );
</script>

{#if planner.route.length > 1}
  <div onfocusin={() => (open = true)} onpointerdown={() => (open = true)} role="presentation">
    <Disclosure id="sun" icon="sun" tint="#ff9f0a" title="Sonne & Schatten" {summary}>
      {#if status === 'error'}
        <p class="txt">Die Geländedaten konnten nicht geladen werden (Tour zu groß oder kein Internet).</p>
      {:else if !along}
        <p class="txt">Berechne aus dem Gelände …</p>
      {:else}
        <label class="slider">
          <span>Start um <b>{startH}:00</b> · {dayLabel}</span>
          <input type="range" min="5" max="15" step="1" bind:value={startH} />
        </label>
        <div class="bar" aria-label="Sonne und Schatten entlang der Route">
          {#each along as s}<div style:background={COLORS[s]}></div>{/each}
        </div>
        <div class="ends"><span>Start</span><span>Ziel</span></div>
        <div class="legend">
          <span><i style:background={COLORS.sun}></i>Sonne</span>
          <span><i style:background={COLORS.shade}></i>Schatten (Berg davor)</span>
          {#if nightShare > 0}<span><i style:background={COLORS.night} class="n"></i>nach Sonnenuntergang</span>{/if}
        </div>
        {#if hours.length}
          <h5>Anteil der Strecke in der Sonne je Uhrzeit</h5>
          <div class="hours">
            {#each hours as x}
              <div class="hc" title="{x.h}:00 – {x.pct} %">
                <div class="hb"><div style:height="{x.pct}%"></div></div>
                <span>{x.h}</span>
              </div>
            {/each}
          </div>
        {/if}
        <p class="note">Berechnet aus Sonnenstand und Geländemodell (ca. 50–70 m genau). Wald, Gebäude und Wolken sind nicht berücksichtigt – den Tag wählst du in der Wetter-Box.</p>
      {/if}
    </Disclosure>
  </div>
{/if}

<style>
  .txt { font-size: .86rem; color: var(--text2); }
  .slider { display: flex; flex-direction: column; gap: 4px; font-size: .88rem; color: var(--text2); margin-bottom: 10px; }
  .slider input { width: 100%; accent-color: #ff9f0a; }
  .bar { display: flex; height: 14px; border-radius: 7px; overflow: hidden; }
  .bar div { flex: 1; }
  .ends { display: flex; justify-content: space-between; font-size: .7rem; color: var(--muted); margin-top: 3px; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .78rem; color: var(--text2); margin-top: 6px; }
  .legend span { display: inline-flex; align-items: center; gap: 5px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }
  .legend i.n { outline: 1px solid var(--muted); }
  h5 { margin: 14px 0 6px; font-size: .74rem; text-transform: uppercase; color: var(--muted); font-weight: 600; }
  .hours { display: flex; gap: 3px; height: 64px; }
  .hc { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .hb { flex: 1; width: 100%; background: var(--surface2); border-radius: 4px; display: flex; align-items: flex-end; overflow: hidden; }
  .hb div { width: 100%; background: #ffd60a; }
  .hc span { font-size: .62rem; color: var(--muted); }
  .note { font-size: .72rem; color: var(--muted); }
</style>
