<script lang="ts">
  // Wasserstellen und Einkehr entlang der geöffneten Route – je eine aufklappbare Box.
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';
  import { poiState, poisAlongRoute, openingInfo, POI_STYLE, type RoutePoi, type OpenInfo } from '../lib/pois.svelte';
  import { showPoiPopup } from '../lib/poiPopup';
  import { wxShared } from '../lib/wxshared.svelte';
  import { ui } from '../lib/ui.svelte';

  const along = $derived(poisAlongRoute(planner.route, planner.cum, poiState.pois));
  const water = $derived(along.filter((p) => p.kind === 'water'));
  const eat = $derived(along.filter((p) => p.kind === 'hut' || p.kind === 'food' || p.kind === 'shelter'));
  const drinkable = $derived(water.filter((p) => p.drink === 'yes'));
  const views = $derived(along.filter((p) => p.kind === 'view'));
  const benches = $derived(along.filter((p) => p.kind === 'bench' && p.off < 60));
  const restSummary = $derived(
    `${views.length} Aussichtspunkt${views.length === 1 ? '' : 'e'} · ${benches.length} Bänke am Weg`,
  );

  // Öffnungszeiten: jetzt und – falls in der Wetter-Box ein anderer Tag gewählt ist – am Tourtag
  let open = $state<Record<string, { now: OpenInfo | null; day: OpenInfo | null }>>({});
  $effect(() => {
    const list = eat.filter((p) => p.openingHours).slice(0, 20);
    const d = wxShared.current?.day.date;
    const today = new Date().toISOString().slice(0, 10);
    let cancelled = false;
    (async () => {
      const res: typeof open = {};
      for (const p of list) {
        res[p.id] = {
          now: await openingInfo(p),
          day: d && d !== today ? await openingInfo(p, new Date(d + 'T12:00')) : null,
        };
      }
      if (!cancelled) open = res;
    })();
    return () => { cancelled = true; };
  });

  const km = (p: RoutePoi) => `km ${p.km.toLocaleString('de-DE', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}`;
  const off = (p: RoutePoi) => (p.off < 30 ? 'direkt am Weg' : `${p.off} m abseits`);

  function show(p: RoutePoi) {
    if (!window.matchMedia('(min-width: 900px)').matches) ui.view = 'karte';
    showPoiPopup(p, true);
  }

  const waterSummary = $derived(
    poiState.loading && !water.length ? 'Wird gesucht …'
      : water.length ? `${water.length} Stelle${water.length > 1 ? 'n' : ''}${drinkable.length ? ` · ${drinkable.length}× Trinkwasser, erste bei ${km(drinkable[0])}` : ' · Trinkbarkeit unklar'}`
      : 'Keine eingetragen (bis 300 m neben der Route)',
  );
  const eatSummary = $derived(
    poiState.loading && !eat.length ? 'Wird gesucht …'
      : eat.length ? `${eat.length} Möglichkeit${eat.length > 1 ? 'en' : ''} · ${eat.slice(0, 2).map((p) => p.name).join(', ')}${eat.length > 2 ? ' …' : ''}`
      : 'Keine eingetragen (bis 200 m neben der Route)',
  );
</script>

<Disclosure id="water" icon="drop" tint="#0a84ff" title="Wasserstellen" summary={waterSummary}>
  {#if water.length}
    <ul class="list">
      {#each water as p (p.id)}
        <li>
          <button class="row" onclick={() => show(p)}>
            <span class="km">{km(p)}</span>
            <span class="txt">
              <span class="name">{p.name}</span>
              <span class="sub">{p.label} · {off(p)}{p.seasonal ? ' · saisonal' : ''}</span>
            </span>
            <span class="tag {p.drink === 'yes' ? 'ok' : p.drink === 'no' ? 'bad' : 'warn'}">
              {p.drink === 'yes' ? 'Trinkwasser' : p.drink === 'no' ? 'nicht trinkbar' : 'unklar'}
            </span>
          </button>
        </li>
      {/each}
    </ul>
    <p class="note">„Unklar“ heißt: In OpenStreetMap steht nicht, ob man es trinken kann – Quellen im Zweifel filtern oder abkochen. Brunnen können im Winter abgestellt sein.</p>
  {:else}
    <p class="note">Entlang dieser Route sind in OpenStreetMap keine Wasserstellen eingetragen. Genug Wasser mitnehmen!</p>
  {/if}
</Disclosure>

<Disclosure id="eat" icon="hut" tint="#a2541c" title="Einkehr & Hütten" summary={eatSummary}>
  {#if eat.length}
    <ul class="list">
      {#each eat as p (p.id)}
        {@const o = open[p.id]}
        <li>
          <button class="row" onclick={() => show(p)}>
            <span class="km">{km(p)}</span>
            <span class="emoji" aria-hidden="true">{POI_STYLE[p.kind].emoji}</span>
            <span class="txt">
              <span class="name">{p.name}</span>
              <span class="sub">{p.label} · {off(p)}</span>
              {#if o?.now}<span class="oh {o.now.open ? 'ok' : o.now.open === false ? 'bad' : ''}">{o.now.text}</span>{/if}
              {#if o?.day}<span class="oh {o.day.open ? 'ok' : 'bad'}">{o.day.text} (Tourtag)</span>{/if}
              {#if !p.openingHours && p.kind !== 'shelter'}<span class="oh">Öffnungszeiten nicht eingetragen</span>{/if}
            </span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
          {#if p.menu || p.website}
            <div class="links">
              {#if p.menu}<a href={/^https?:/.test(p.menu) ? p.menu : `https://${p.menu}`} target="_blank" rel="noopener">Speisekarte</a>{/if}
              {#if p.website}<a href={/^https?:/.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noopener">Webseite</a>{/if}
              {#if p.phone}<a href="tel:{p.phone.replace(/\s/g, '')}">Anrufen</a>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <p class="note">Öffnungszeiten aus OpenStreetMap – von Freiwilligen gepflegt, nicht immer aktuell. Speisekarten und Preise gibt es dort nicht; wenn vorhanden, führt „Speisekarte“ bzw. „Webseite“ zur Hütte. Im Zweifel vorher anrufen.</p>
  {:else}
    <p class="note">Entlang dieser Route ist in OpenStreetMap keine Einkehr eingetragen – Proviant einplanen.</p>
  {/if}
</Disclosure>

<Disclosure id="rest" icon="eye" tint="#af52de" title="Aussicht & Rast" summary={restSummary}>
  {#if views.length || benches.length}
    <ul class="list">
      {#each views as p (p.id)}
        <li>
          <button class="row" onclick={() => show(p)}>
            <span class="km">{km(p)}</span>
            <span class="emoji" aria-hidden="true">👀</span>
            <span class="txt"><span class="name">{p.name}</span><span class="sub">{p.label} · {off(p)}</span></span>
            <span class="chev" aria-hidden="true">›</span>
          </button>
        </li>
      {/each}
      {#if benches.length}
        <li>
          <div class="row">
            <span class="km">{benches.length}×</span>
            <span class="emoji" aria-hidden="true">🪑</span>
            <span class="txt">
              <span class="name">Bänke direkt am Weg</span>
              <span class="sub">bei km {benches.slice(0, 8).map((b) => b.km.toLocaleString('de-DE', { maximumFractionDigits: 1 })).join(', ')}{benches.length > 8 ? ' …' : ''}</span>
            </span>
          </div>
        </li>
      {/if}
    </ul>
    <p class="note">Bänke erscheinen auf der Karte ab starkem Zoom (Stufe 15).</p>
  {:else}
    <p class="note">Entlang dieser Route sind keine Aussichtspunkte oder Bänke eingetragen.</p>
  {/if}
</Disclosure>

<style>
  .list { list-style: none; margin: 0; padding: 0; background: var(--surface2); border-radius: 12px; overflow: hidden; }
  li + li { border-top: 0.5px solid var(--line); }
  .row {
    width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
    padding: 10px 12px; border: 0; background: none; min-height: 52px;
    -webkit-tap-highlight-color: transparent;
  }
  .row:active { background: var(--surface3); }
  .km { flex: none; width: 52px; font-size: .78rem; font-weight: 600; color: #0a84ff; font-variant-numeric: tabular-nums; }
  .emoji { flex: none; font-size: 1.1rem; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: .95rem; font-weight: 500; color: var(--text); }
  .sub { font-size: .78rem; color: #8e8e93; }
  .oh { font-size: .78rem; color: #8e8e93; }
  .oh.ok { color: #30d158; font-weight: 600; }
  .oh.bad { color: #ff453a; font-weight: 600; }
  .tag { flex: none; font-size: .68rem; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
  .tag.ok { background: rgba(48, 209, 88, .16); color: #30d158; }
  .tag.bad { background: rgba(255, 69, 58, .16); color: #ff453a; }
  .tag.warn { background: rgba(255, 159, 10, .16); color: #ff9f0a; }
  .chev { flex: none; color: #c7c7cc; font-size: 1.4rem; }
  .links { display: flex; gap: 14px; padding: 0 12px 10px 74px; font-size: .85rem; }
  .links a { color: #0a84ff; font-weight: 500; text-decoration: none; }
  .note { font-size: .75rem; color: #8e8e93; margin: 8px 2px 0; }
</style>
