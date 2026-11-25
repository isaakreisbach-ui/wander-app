<script lang="ts">
  // Alles, was die Tourenplanung auf der Karte zeigt und bedient:
  // Route, Wegpunkte (ziehbar), Klick zum Setzen, Rechtsklick-Menü, Markierung aus dem Höhenprofil.
  import { Marker, type MapMouseEvent, type GeoJSONSource, type Map as MlMap } from 'maplibre-gl';
  import type * as GeoJSON from 'geojson';
  import { mapState, onStyleReady } from '../lib/map.svelte';
  import { planner } from '../lib/planner.svelte';

  const ROUTE = 'plan-route';
  const HOVER = 'plan-hover';
  const HIT = 'plan-route-hit';

  type Menu = { x: number; y: number; lng: number; lat: number; onRoute: number | null };
  let menu = $state<Menu | null>(null);
  let wpPopup = $state<{ id: string; x: number; y: number; label: string } | null>(null);

  function routeData(): GeoJSON.FeatureCollection {
    const r = planner.route;
    return {
      type: 'FeatureCollection',
      features: r.length > 1
        ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: r.map((p) => [p[0], p[1]]) } }]
        : [],
    };
  }

  function hoverData(): GeoJSON.FeatureCollection {
    const i = planner.hover;
    const p = i !== null ? planner.route[i] : undefined;
    return {
      type: 'FeatureCollection',
      features: p ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [p[0], p[1]] } }] : [],
    };
  }

  // Ebenen bei jedem Stilwechsel neu anlegen
  onStyleReady((map) => {
    if (!map.getSource(ROUTE)) map.addSource(ROUTE, { type: 'geojson', data: routeData() });
    if (!map.getSource(HOVER)) map.addSource(HOVER, { type: 'geojson', data: hoverData() });
    if (!map.getLayer('plan-route-casing')) {
      map.addLayer({
        id: 'plan-route-casing', type: 'line', source: ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 9, 'line-opacity': 0.9 },
      });
      map.addLayer({
        id: 'plan-route-line', type: 'line', source: ROUTE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#e5246b', 'line-width': 5 },
      });
      map.addLayer({
        id: HIT, type: 'line', source: ROUTE,
        paint: { 'line-color': '#000', 'line-width': 24, 'line-opacity': 0 },
      });
      map.addLayer({
        id: 'plan-hover', type: 'circle', source: HOVER,
        paint: {
          'circle-radius': 8, 'circle-color': '#ffd400',
          'circle-stroke-color': '#111', 'circle-stroke-width': 3,
        },
      });
    }
  });

  // Route und Hover-Punkt aktualisieren
  $effect(() => {
    const data = routeData();
    (mapState.map?.getSource(ROUTE) as GeoJSONSource | undefined)?.setData(data);
  });
  $effect(() => {
    const data = hoverData();
    (mapState.map?.getSource(HOVER) as GeoJSONSource | undefined)?.setData(data);
  });

  // ---------- Wegpunkt-Marker ----------
  const markers = new Map<string, Marker>();

  function labelFor(i: number, n: number) {
    if (i === 0) return 'S';
    if (i === n - 1) return 'Z';
    return String(i);
  }

  $effect(() => {
    const map = mapState.map;
    const wps = planner.waypoints;
    if (!map) return;
    const seen = new Set<string>();
    wps.forEach((w, i) => {
      seen.add(w.id);
      let m = markers.get(w.id);
      if (!m) {
        const el = document.createElement('div');
        el.className = 'wp-marker';
        el.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const pos = map.project([m!.getLngLat().lng, m!.getLngLat().lat]);
          menu = null;
          wpPopup = { id: w.id, x: pos.x, y: pos.y, label: el.dataset.label ?? '' };
        });
        el.addEventListener('contextmenu', (ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          planner.remove(w.id);
        });
        m = new Marker({ element: el, draggable: true }).setLngLat([w.lng, w.lat]).addTo(map);
        m.on('dragstart', () => { wpPopup = null; menu = null; });
        m.on('dragend', () => {
          const ll = m!.getLngLat();
          planner.move(w.id, ll.lng, ll.lat);
        });
        markers.set(w.id, m);
      } else {
        const ll = m.getLngLat();
        if (ll.lng !== w.lng || ll.lat !== w.lat) m.setLngLat([w.lng, w.lat]);
      }
      const el = m.getElement();
      const label = labelFor(i, wps.length);
      el.textContent = label;
      el.dataset.label = i === 0 ? 'Start' : i === wps.length - 1 ? 'Ziel' : `Punkt ${i}`;
      el.classList.toggle('start', i === 0);
      el.classList.toggle('end', i === wps.length - 1 && i > 0);
      el.setAttribute('aria-label', el.dataset.label);
    });
    for (const [id, m] of markers) {
      if (!seen.has(id)) { m.remove(); markers.delete(id); }
    }
    if (wpPopup && !seen.has(wpPopup.id)) wpPopup = null;
  });

  // ---------- Klicks auf die Karte ----------

  function nearestRouteIndex(map: MlMap, lng: number, lat: number): number {
    const r = planner.route;
    const k = Math.cos((lat * Math.PI) / 180);
    let best = 0, bestD = Infinity;
    for (let i = 0; i < r.length; i++) {
      const dx = (r[i][0] - lng) * k, dy = r[i][1] - lat;
      const d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }

  function routeHitAt(map: MlMap, e: MapMouseEvent): number | null {
    if (planner.route.length < 2 || !map.getLayer(HIT)) return null;
    const hits = map.queryRenderedFeatures(e.point, { layers: [HIT] });
    return hits.length ? nearestRouteIndex(map, e.lngLat.lng, e.lngLat.lat) : null;
  }

  const onMarker = (e: MapMouseEvent) => (e.originalEvent.target as HTMLElement | null)?.closest?.('.maplibregl-marker');

  $effect(() => {
    const map = mapState.map;
    if (!map) return;

    const click = (e: MapMouseEvent) => {
      if (menu || wpPopup) { menu = null; wpPopup = null; return; }
      if (!planner.active || onMarker(e)) return;
      const idx = routeHitAt(map, e);
      if (idx !== null) planner.insert(planner.segmentOf(idx), e.lngLat.lng, e.lngLat.lat);
      else planner.add(e.lngLat.lng, e.lngLat.lat);
    };

    const context = (e: MapMouseEvent) => {
      if (!planner.active || onMarker(e)) return;
      e.preventDefault();
      wpPopup = null;
      menu = { x: e.point.x, y: e.point.y, lng: e.lngLat.lng, lat: e.lngLat.lat, onRoute: routeHitAt(map, e) };
    };

    const move = (e: MapMouseEvent) => {
      if (!planner.active || planner.route.length < 2 || !map.getLayer(HIT)) return;
      const hit = map.queryRenderedFeatures(e.point, { layers: [HIT] }).length > 0;
      map.getCanvas().style.cursor = hit ? 'copy' : '';
      planner.hover = hit ? nearestRouteIndex(map, e.lngLat.lng, e.lngLat.lat) : null;
    };

    const closeAll = () => { menu = null; wpPopup = null; };

    map.on('click', click);
    map.on('contextmenu', context);
    map.on('mousemove', move);
    map.on('movestart', closeAll);
    return () => {
      map.off('click', click);
      map.off('contextmenu', context);
      map.off('mousemove', move);
      map.off('movestart', closeAll);
    };
  });

  // Fadenkreuz-Mauszeiger, solange geplant wird
  $effect(() => {
    const c = mapState.map?.getCanvasContainer();
    c?.classList.toggle('planning', planner.active);
  });

  // ---------- Tastenkürzel ----------
  $effect(() => {
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); planner.undo(); }
      else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); planner.redo(); }
      else if (e.key === 'Escape') { menu = null; wpPopup = null; }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  function act(fn: () => void) {
    fn();
    menu = null;
    wpPopup = null;
  }
</script>

{#if menu}
  {@const m = menu}
  <div class="ctx" style:left="{m.x}px" style:top="{m.y}px" role="menu">
    {#if m.onRoute !== null}
      <button role="menuitem" onclick={() => act(() => planner.insert(planner.segmentOf(m.onRoute!), m.lng, m.lat))}>➕ Zwischenpunkt hier einfügen</button>
    {/if}
    <button role="menuitem" onclick={() => act(() => planner.add(m.lng, m.lat))}>📍 {planner.waypoints.length ? 'Als nächsten Punkt anhängen' : 'Start hier setzen'}</button>
    {#if planner.waypoints.length}
      <button role="menuitem" onclick={() => act(() => planner.prepend(m.lng, m.lat))}>🚩 Als neuen Start setzen</button>
    {/if}
    <hr />
    <button role="menuitem" disabled={!planner.canUndo} onclick={() => act(() => planner.undo())}>↶ Rückgängig <kbd>Strg+Z</kbd></button>
    <button role="menuitem" disabled={!planner.canRedo} onclick={() => act(() => planner.redo())}>↷ Wiederholen <kbd>Strg+Y</kbd></button>
    {#if planner.waypoints.length > 1}
      <button role="menuitem" onclick={() => act(() => planner.reverse())}>⇄ Richtung umkehren</button>
    {/if}
    {#if planner.waypoints.length}
      <button role="menuitem" class="danger" onclick={() => act(() => planner.clear())}>🗑 Alle Punkte löschen</button>
    {/if}
  </div>
{/if}

{#if wpPopup}
  {@const p = wpPopup}
  <div class="wp-pop" style:left="{p.x}px" style:top="{p.y}px">
    <div class="wp-title">{p.label}</div>
    <button class="danger" onclick={() => act(() => planner.remove(p.id))}>🗑 Punkt löschen</button>
    <div class="wp-hint">Zum Verschieben den Punkt ziehen</div>
  </div>
{/if}

<style>
  :global(.wp-marker) {
    width: 30px; height: 30px; border-radius: 50%;
    display: grid; place-items: center;
    background: #fff; color: #111; border: 3px solid #e5246b;
    font: 800 13px/1 system-ui, sans-serif;
    box-shadow: 0 1px 4px rgba(0, 0, 0, .4);
    cursor: grab; touch-action: none;
  }
  :global(.wp-marker.start) { background: #1d7a3e; border-color: #fff; color: #fff; }
  :global(.wp-marker.end) { background: #b3261e; border-color: #fff; color: #fff; }
  @media (pointer: coarse) {
    :global(.wp-marker) { width: 36px; height: 36px; font-size: 15px; }
  }
  :global(.maplibregl-canvas-container.planning) { cursor: crosshair; }

  .ctx, .wp-pop {
    position: absolute; z-index: 6;
    background: #fff; border-radius: 12px; padding: 6px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, .3);
  }
  .ctx { min-width: 250px; transform: translate(4px, 4px); }
  .ctx button, .wp-pop button {
    display: flex; justify-content: space-between; align-items: center; gap: 12px;
    width: 100%; text-align: left; border: 0; background: none;
    padding: 9px 10px; border-radius: 8px; font-size: .95rem;
  }
  .ctx button:hover:not(:disabled), .wp-pop button:hover { background: var(--green-soft); }
  .ctx button:disabled { color: #aaa; cursor: default; }
  .ctx hr { border: 0; border-top: 1px solid var(--line); margin: 4px 0; }
  kbd { font: 600 .75rem system-ui; color: var(--muted); }
  .danger { color: var(--bad); }

  .wp-pop { transform: translate(-50%, calc(-100% - 26px)); min-width: 190px; text-align: center; }
  .wp-title { font-weight: 700; padding: 4px 8px 2px; }
  .wp-pop button { justify-content: center; min-height: 48px; font-weight: 650; }
  .wp-hint { font-size: .75rem; color: var(--muted); padding: 0 8px 4px; }
</style>
