<script lang="ts">
  import Modal from './Modal.svelte';
  import BackupCard from './BackupCard.svelte';
  import { ui } from '../lib/ui.svelte';
  import { mapSettings, saveMapSettings, mapState, BASES, styleFor, type BaseId } from '../lib/map.svelte';
  import { favs, removeFav } from '../lib/favorites.svelte';

  function setBase(id: BaseId) {
    if (mapSettings.base === id) return;
    mapSettings.base = id;
    saveMapSettings();
    mapState.map?.setStyle(styleFor(id), { diff: false });
  }
  function toggle(k: 'trails' | 'pois' | 'diffColors') {
    mapSettings[k] = !mapSettings[k];
    saveMapSettings();
  }
  function goto(lng: number, lat: number) {
    ui.settings = false;
    ui.view = 'karte';
    mapState.map?.flyTo({ center: [lng, lat], zoom: 15 });
  }
  const close = () => (ui.settings = false);
</script>

<Modal title="Einstellungen" onclose={close} wide>
  <h4>Karte</h4>
  <div class="seg">
    {#each BASES as b}
      <button class:sel={mapSettings.base === b.id} onclick={() => setBase(b.id)}>{b.label}</button>
    {/each}
  </div>
  <div class="group">
    <label class="row"><span>Markierte Wanderrouten (rot gestrichelt)</span><input type="checkbox" class="ios-switch" checked={mapSettings.trails} onchange={() => toggle('trails')} /></label>
    <label class="row"><span>Wasser, Hütten, Aussicht, Bänke</span><input type="checkbox" class="ios-switch" checked={mapSettings.pois} onchange={() => toggle('pois')} /></label>
    <label class="row"><span>Steilheit farbig</span><input type="checkbox" class="ios-switch" checked={mapSettings.diffColors} onchange={() => toggle('diffColors')} /></label>
  </div>

  <h4>Lieblingsorte</h4>
  {#if favs.list.length}
    <div class="group">
      {#each favs.list as f (f.id)}
        <div class="row">
          <button class="link" onclick={() => goto(f.lng, f.lat)}>⭐ {f.name}</button>
          <button class="del" onclick={() => removeFav(f.id)} aria-label="Entfernen">✕</button>
        </div>
      {/each}
    </div>
  {:else}
    <p class="note">Noch keine. Karte lange drücken (PC: Rechtsklick) → „Als Lieblingsort merken“.</p>
  {/if}

  <h4>Daten</h4>
  <BackupCard />

  <h4>Hilfe</h4>
  <button class="btn secondary wide" onclick={() => { ui.settings = false; ui.intro = true; }}>Einführung noch einmal ansehen</button>
</Modal>

<style>
  h4 { margin: 14px 2px 6px; font-size: .78rem; text-transform: uppercase; color: var(--muted); }
  .seg { display: grid; grid-template-columns: repeat(3, 1fr); gap: 2px; background: var(--surface3); padding: 2px; border-radius: 10px; }
  .seg button { border: 0; background: none; color: var(--text); min-height: 38px; border-radius: 8px; font-weight: 600; }
  .seg button.sel { background: var(--surface); box-shadow: 0 1px 3px rgba(0, 0, 0, .3); }
  .group { background: var(--surface); border-radius: 14px; overflow: hidden; margin-top: 8px; }
  .row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; min-height: 48px; }
  .row + .row { border-top: 0.5px solid var(--line); }
  .ios-switch { appearance: none; -webkit-appearance: none; flex: none; position: relative; width: 51px; height: 31px; border-radius: 999px; background: var(--surface3); margin: 0; cursor: pointer; }
  .ios-switch::after { content: ''; position: absolute; top: 2px; left: 2px; width: 27px; height: 27px; border-radius: 50%; background: #fff; transition: transform .2s; }
  .ios-switch:checked { background: #30d158; }
  .ios-switch:checked::after { transform: translateX(20px); }
  .link { border: 0; background: none; color: var(--text); text-align: left; font-size: .95rem; flex: 1; }
  .del { border: 0; background: none; color: var(--muted); width: 36px; height: 36px; }
  .note { font-size: .82rem; color: var(--muted); }
  .wide { width: 100%; }
</style>
