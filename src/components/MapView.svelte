<script lang="ts">
  import { Map as MlMap, NavigationControl, GeolocateControl, ScaleControl, setWorkerUrl } from 'maplibre-gl';
  import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
  import SearchBox from './SearchBox.svelte';
  import PlanOverlay from './PlanOverlay.svelte';
  import RecordOverlay from './RecordOverlay.svelte';
  import PoiOverlay from './PoiOverlay.svelte';
  import MarkedRoutesOverlay from './MarkedRoutesOverlay.svelte';
  import PathsOverlay from './PathsOverlay.svelte';
  import PeakOverlay from './PeakOverlay.svelte';
  import FromHereOverlay from './FromHereOverlay.svelte';
  import FlyoverBar from './FlyoverBar.svelte';
  import { flyover } from '../lib/flyover.svelte';
  import { onMount } from 'svelte';
  import 'maplibre-gl/dist/maplibre-gl.css';

  setWorkerUrl(workerUrl);
  import {
    BASES, styleFor, addTrailsOverlay, mapSettings, saveMapSettings, adjustStandardStyle,
    mapState, runStyleHooks, type BaseId,
  } from '../lib/map.svelte';

  let container: HTMLDivElement;
  let menuOpen = $state(false);
  let online = $state(navigator.onLine);
  $effect(() => {
    const on = () => (online = true), off = () => (online = false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  });
  let message = $state<string | null>(null);
  let messageTimer: ReturnType<typeof setTimeout> | undefined;

  function showMessage(text: string) {
    message = text;
    clearTimeout(messageTimer);
    messageTimer = setTimeout(() => (message = null), 6000);
  }

  // onMount (nicht $effect): Die Karte wird genau einmal erzeugt, auch wenn sich
  // gespeicherte Einstellungen (Position, Zoom) ändern.
  onMount(() => {
    const map = new MlMap({
      container,
      style: styleFor(mapSettings.base),
      center: mapSettings.center,
      zoom: mapSettings.zoom,
      maxZoom: 18,
      dragRotate: false,
      pitchWithRotate: false,
      attributionControl: { compact: true },
      locale: {
        'NavigationControl.ZoomIn': 'Hineinzoomen',
        'NavigationControl.ZoomOut': 'Herauszoomen',
        'NavigationControl.ResetBearing': 'Nach Norden ausrichten',
        'GeolocateControl.FindMyLocation': 'Meinen Standort anzeigen',
        'GeolocateControl.LocationNotAvailable': 'Standort nicht verfügbar',
        'AttributionControl.ToggleAttribution': 'Quellenangaben',
        'ScrollZoomBlocker.CtrlMessage': 'Strg + Mausrad zum Zoomen',
        'TouchPanBlocker.Message': 'Mit zwei Fingern verschieben',
      },
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();

    map.addControl(new NavigationControl({ showCompass: false }), 'top-right');

    const geo = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
      trackUserLocation: true,
      showAccuracyCircle: true,
    });
    map.addControl(geo, 'top-right');
    geo.on('error', (e: unknown) => {
      if ((e as { code?: number }).code === 1) {
        showMessage('Standort nicht erlaubt. iPhone: Einstellungen → Datenschutz → Ortungsdienste → Safari-Websites → „Beim Verwenden“.');
      } else {
        showMessage('Standort konnte nicht ermittelt werden. Unter freiem Himmel klappt es besser.');
      }
    });

    map.addControl(new ScaleControl({ unit: 'metric' }), 'bottom-left');

    map.on('style.load', () => {
      addTrailsOverlay(map, false); // bunte Bild-Ebene nicht mehr anzeigen – ersetzt durch gestrichelte Routen
      adjustStandardStyle(map); // Gipfel über den Wanderwegen, Straßennamen aus
      runStyleHooks(map);
    });

    map.on('moveend', () => {
      const c = map.getCenter();
      mapSettings.center = [+c.lng.toFixed(5), +c.lat.toFixed(5)];
      mapSettings.zoom = +map.getZoom().toFixed(2);
      saveMapSettings();
    });

    map.on('error', (e: { error?: { message?: string } }) => console.warn('Kartenfehler', e.error?.message));

    mapState.map = map;
    return () => {
      mapState.map = null;
      map.remove();
    };
  });

  function chooseBase(id: BaseId) {
    menuOpen = false;
    if (id === mapSettings.base) return;
    mapSettings.base = id;
    saveMapSettings();
    mapState.map?.setStyle(styleFor(id), { diff: false });
  }

  function toggleTrails() {
    mapSettings.trails = !mapSettings.trails;
    saveMapSettings();

  }
</script>

<div class="wrap">
  <div class="map" bind:this={container}></div>

  <PathsOverlay />
  <MarkedRoutesOverlay />
  <PoiOverlay />
  <PeakOverlay />
  <FromHereOverlay />
  <PlanOverlay />
  <RecordOverlay />
  {#if flyover.active}<FlyoverBar />{/if}

  <div class="search-slot"><SearchBox /></div>

  <div class="layer-ctrl">
    <button class="layer-btn" aria-label="Kartenebenen" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}>
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
        <path d="M12 3 2 8l10 5 10-5-10-5Zm-10 9 10 5 10-5M2 16l10 5 10-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
      </svg>
    </button>
    {#if menuOpen}
      <div class="menu" role="dialog" aria-label="Kartenebenen">
        <div class="menu-title">Grundkarte</div>
        {#each BASES as b}
          <button class="opt" class:sel={mapSettings.base === b.id} onclick={() => chooseBase(b.id)}>
            <span class="radio" aria-hidden="true"></span>
            <span><b>{b.label}</b><small>{b.hint}</small></span>
          </button>
        {/each}
        <div class="menu-title">Zusätzlich</div>
        <button class="opt" class:sel={mapSettings.trails} onclick={toggleTrails}>
          <span class="check" aria-hidden="true">{mapSettings.trails ? '✓' : ''}</span>
          <span><b>Markierte Wanderrouten</b><small>Rot gestrichelt mit Kürzel – ab Zoom 12, nur online</small></span>
        </button>
        <button class="opt" class:sel={mapSettings.pois} onclick={() => { mapSettings.pois = !mapSettings.pois; saveMapSettings(); }}>
          <span class="check" aria-hidden="true">{mapSettings.pois ? '✓' : ''}</span>
          <span><b>💧 Wasser, 🏠 Hütten, 👀 Aussicht, 🪑 Bänke</b><small>OpenStreetMap – ab Zoomstufe 11 (Bänke ab 15)</small></span>
        </button>
      </div>
    {/if}
  </div>

  {#if !online && mapSettings.base !== 'standard'}
    <div class="offline-hint" role="status">
      Ohne Netz ist nur die <b>Standard-Karte</b> verfügbar.
      <button onclick={() => chooseBase('standard')}>Umschalten</button>
    </div>
  {/if}

  {#if message}
    <div class="toast" role="status">{message}</div>
  {/if}
</div>

<style>
  .wrap { position: relative; width: 100%; height: 100%; }
  .map { position: absolute; inset: 0; }

  .layer-ctrl { position: absolute; top: 10px; left: 10px; z-index: 3; }
  .search-slot { position: absolute; top: 10px; left: 66px; right: 68px; z-index: 2; max-width: 440px; }
  .layer-btn {
    width: 48px; height: 48px; border-radius: 12px; border: 0;
    background: var(--surface); color: var(--text);
    box-shadow: 0 1px 4px rgba(0, 0, 0, .3);
    display: grid; place-items: center;
  }
  .menu {
    margin-top: 8px; width: min(300px, calc(100vw - 20px));
    background: var(--surface); border-radius: 14px; padding: 8px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, .25);
  }
  .menu-title { font-size: .8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; padding: 8px 8px 4px; }
  .opt {
    width: 100%; display: flex; gap: 12px; align-items: center; text-align: left;
    min-height: 56px; padding: 6px 8px; border: 0; background: none; border-radius: 10px;
  }
  .opt:hover { background: var(--green-soft); }
  .opt small { display: block; color: var(--muted); font-size: .8rem; }
  .radio, .check {
    flex: none; width: 22px; height: 22px; border: 2px solid var(--muted);
    display: grid; place-items: center; font-weight: 800; color: #fff;
  }
  .radio { border-radius: 50%; }
  .check { border-radius: 5px; }
  .opt.sel .radio { border-color: var(--green); box-shadow: inset 0 0 0 4px #fff; background: var(--green); }
  .opt.sel .check { border-color: var(--green); background: var(--green); }

  .offline-hint {
    position: absolute; z-index: 3; left: 10px; right: 10px; top: 66px; margin: 0 auto; max-width: 420px;
    background: rgba(255, 159, 10, .16); border: 1px solid #f0b44c; border-radius: 12px; padding: 8px 10px;
    display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: .9rem;
  }
  .offline-hint button { border: 0; background: var(--green); color: #fff; border-radius: 8px; padding: 8px 12px; font-weight: 700; }
  .toast {
    position: absolute; left: 50%; bottom: 40px; transform: translateX(-50%); z-index: 3;
    width: min(420px, calc(100% - 24px));
    background: #222; color: #fff; padding: 10px 14px; border-radius: 12px; font-size: .9rem;
  }

  /* Große Kartenknöpfe für Finger */
  .wrap :global(.maplibregl-ctrl-group button) { width: 48px; height: 48px; }
  .wrap :global(.maplibregl-ctrl-group) { border-radius: 12px; }
  .wrap :global(.maplibregl-ctrl-scale) { font-size: 12px; }
  @media (pointer: fine) {
    .wrap :global(.maplibregl-ctrl-group button) { width: 36px; height: 36px; }
    .layer-btn { width: 40px; height: 40px; }
    .search-slot { left: 58px; right: 56px; }
    .opt { min-height: 44px; }
  }
</style>
