<script lang="ts">
  import { Marker } from 'maplibre-gl';
  import { mapState } from '../lib/map.svelte';
  import { search, parseCoordinates, type SearchResult } from '../lib/search';

  let query = $state('');
  let results = $state<SearchResult[]>([]);
  let active = $state(0);
  let open = $state(false);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let input: HTMLInputElement;

  let timer: ReturnType<typeof setTimeout> | undefined;
  let ctrl: AbortController | undefined;
  let marker: Marker | undefined;

  function onInput() {
    clearTimeout(timer);
    ctrl?.abort();
    error = null;
    const q = query.trim();
    const coord = parseCoordinates(q);
    if (coord) {
      results = [coord]; active = 0; open = true; loading = false;
      return;
    }
    if (q.length < 3) {
      results = []; open = false; loading = false;
      return;
    }
    loading = true;
    timer = setTimeout(() => run(q), 450);
  }

  async function run(q: string) {
    const map = mapState.map;
    if (!map) return;
    ctrl = new AbortController();
    try {
      const c = map.getCenter();
      results = await search(q, { lng: c.lng, lat: c.lat }, ctrl.signal);
      active = 0;
      open = true;
      if (!results.length) error = 'Nichts gefunden';
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      error = navigator.onLine ? 'Suche gerade nicht erreichbar' : 'Suche braucht Internet';
      open = true;
      results = [];
    } finally {
      loading = false;
    }
  }

  function choose(r: SearchResult) {
    const map = mapState.map;
    if (!map) return;
    open = false;
    query = r.name;
    input.blur();
    if (r.bbox && r.bbox[2] - r.bbox[0] > 0.005) {
      map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 60, maxZoom: 15, duration: 900 });
    } else {
      map.flyTo({ center: [r.lng, r.lat], zoom: Math.max(map.getZoom(), 14), duration: 900 });
    }
    marker?.remove();
    marker = new Marker({ color: '#d9480f' }).setLngLat([r.lng, r.lat]).addTo(map);
  }

  function clear() {
    query = ''; results = []; open = false; error = null;
    marker?.remove(); marker = undefined;
    input.focus();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' && results.length) { e.preventDefault(); active = (active + 1) % results.length; open = true; }
    else if (e.key === 'ArrowUp' && results.length) { e.preventDefault(); active = (active - 1 + results.length) % results.length; }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (results[active]) choose(results[active]);
      else if (query.trim().length >= 2) { clearTimeout(timer); loading = true; run(query.trim()); }
    } else if (e.key === 'Escape') { open = false; input.blur(); }
  }

  // Tastenkürzel am PC: "/" oder Strg+F springt in die Suche
  $effect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable;
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f')) {
        e.preventDefault();
        input.focus();
        input.select();
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
</script>

<div class="search" role="search">
  <div class="field">
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" />
      <path d="m20 20-4-4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    </svg>
    <input
      bind:this={input}
      bind:value={query}
      oninput={onInput}
      onkeydown={onKey}
      onfocus={() => { if (results.length || error) open = true; }}
      onblur={() => setTimeout(() => (open = false), 150)}
      type="search"
      enterkeyhint="search"
      autocomplete="off"
      placeholder="Ort, Gipfel, Hütte suchen …"
      aria-label="Ort suchen"
      aria-expanded={open}
      aria-controls="search-results"
      role="combobox"
    />
    {#if loading}<span class="spin" aria-label="Sucht …"></span>
    {:else if query}<button class="clear" onclick={clear} aria-label="Suche leeren">✕</button>{/if}
  </div>

  {#if open && (results.length || error)}
    <ul id="search-results" class="results" role="listbox">
      {#each results as r, i (r.id + i)}
        <li role="option" aria-selected={i === active}>
          <button class:active={i === active} onmousedown={(e) => e.preventDefault()} onclick={() => choose(r)}>
            <span class="name">{r.name}{#if r.kind}<span class="kind">{r.kind}</span>{/if}</span>
            {#if r.detail}<span class="detail">{r.detail}</span>{/if}
          </button>
        </li>
      {/each}
      {#if error}<li class="err">{error}</li>{/if}
      <li class="credit">Suche: Photon / © OpenStreetMap</li>
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; }
  .field {
    display: flex; align-items: center; gap: 8px;
    height: 48px; padding: 0 6px 0 12px;
    background: #fff; border-radius: 12px; color: var(--muted);
    box-shadow: 0 1px 4px rgba(0, 0, 0, .3);
  }
  input {
    flex: 1; min-width: 0; height: 100%;
    border: 0; outline: 0; background: none;
    font: inherit; font-size: 17px; /* ≥16px verhindert Auto-Zoom auf dem iPhone */
    color: var(--text);
  }
  input::-webkit-search-cancel-button { display: none; }
  .clear { width: 40px; height: 40px; border: 0; background: none; border-radius: 8px; font-size: 1rem; color: var(--muted); }
  .spin {
    width: 18px; height: 18px; margin-right: 10px; border-radius: 50%;
    border: 3px solid var(--line); border-top-color: var(--green);
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .results {
    list-style: none; margin: 6px 0 0; padding: 6px;
    background: #fff; border-radius: 12px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, .25);
    max-height: 60vh; overflow-y: auto;
  }
  .results button {
    width: 100%; text-align: left; border: 0; background: none;
    padding: 10px; border-radius: 8px; min-height: 52px;
    display: flex; flex-direction: column; justify-content: center;
  }
  .results button.active, .results button:hover { background: var(--green-soft); }
  .name { font-weight: 650; display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
  .kind { font-size: .75rem; font-weight: 600; color: var(--green); background: var(--green-soft); padding: 1px 7px; border-radius: 999px; }
  .detail { font-size: .85rem; color: var(--muted); }
  .err { padding: 10px; color: var(--warn); }
  .credit { padding: 4px 10px 2px; font-size: .7rem; color: var(--muted); }

  @media (pointer: fine) {
    .field { height: 40px; }
    input { font-size: 15px; }
    .results button { min-height: 44px; padding: 7px 10px; }
  }
</style>
