<script lang="ts">
  // Notfall: eigener Standort groß zum Vorlesen, Notrufnummern je Land, Standort per SMS/Teilen.
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import { ui, toast } from '../lib/ui.svelte';

  let pos = $state<GeolocationPosition | null>(null);
  let err = $state<string | null>(null);

  onMount(() => {
    if (!('geolocation' in navigator)) { err = 'Kein GPS verfügbar.'; return; }
    const id = navigator.geolocation.watchPosition(
      (p) => { pos = p; err = null; },
      () => (err = 'Standort wird gesucht … (Ortung erlauben, unter freiem Himmel klappt es besser)'),
      { enableHighAccuracy: true, timeout: 30000, maximumAge: 10000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  });

  const lat = $derived(pos?.coords.latitude ?? null);
  const lng = $derived(pos?.coords.longitude ?? null);
  const dms = (v: number, pos: string, neg: string) => {
    const a = Math.abs(v), d = Math.floor(a), m = Math.floor((a - d) * 60), s = ((a - d - m / 60) * 3600).toFixed(1);
    return `${d}° ${m}′ ${s}″ ${v >= 0 ? pos : neg}`;
  };

  // Land grob aus der Position – für die passenden Nummern
  const country = $derived.by(() => {
    if (lat === null || lng === null) return 'de';
    if (lat > 46.2 && lat < 47.1 && lng > 10.3 && lng < 12.5) return 'it';
    if (lat > 45.8 && lat < 47.85 && lng > 5.9 && lng < 10.5) return 'ch';
    if (lat > 46.35 && lat < 49.05 && lng > 9.5 && lng < 17.2 && !(lat > 47.6 && lng < 13)) return 'at';
    return 'de';
  });
  const NUMBERS: Record<string, { label: string; nr: string }[]> = {
    de: [{ label: 'Notruf (Rettung, Bergwacht)', nr: '112' }, { label: 'Polizei', nr: '110' }],
    at: [{ label: 'Bergrettung', nr: '140' }, { label: 'Euro-Notruf', nr: '112' }],
    ch: [{ label: 'Rega (Luftrettung)', nr: '1414' }, { label: 'Euro-Notruf', nr: '112' }],
    it: [{ label: 'Notruf (Bergrettung über 112)', nr: '112' }],
  };

  const text = $derived(lat !== null && lng !== null
    ? `NOTFALL – mein Standort: ${lat.toFixed(5)}, ${lng.toFixed(5)}${pos?.coords.altitude ? ` (Höhe ca. ${Math.round(pos.coords.altitude)} m)` : ''} – https://maps.google.com/?q=${lat.toFixed(5)},${lng.toFixed(5)}`
    : '');

  async function copy() {
    try { await navigator.clipboard.writeText(text); toast('Koordinaten kopiert'); } catch { prompt('Kopieren:', text); }
  }
  async function share() {
    try { await navigator.share({ text }); } catch { /* abgebrochen */ }
  }
  const close = () => (ui.emergency = false);
</script>

<Modal title="🆘 Notfall" onclose={close}>
  <div class="nums">
    {#each NUMBERS[country] as n}
      <a class="call" href="tel:{n.nr}"><span class="nr">{n.nr}</span><span>{n.label}</span></a>
    {/each}
  </div>

  <h4>Mein Standort zum Durchgeben</h4>
  {#if lat !== null && lng !== null}
    <div class="coords">
      <div class="big">{lat.toFixed(5)}, {lng.toFixed(5)}</div>
      <div class="small">{dms(lat, 'N', 'S')} · {dms(lng, 'O', 'W')}</div>
      <div class="small">
        {#if pos?.coords.altitude}Höhe ca. {Math.round(pos.coords.altitude)} m · {/if}Genauigkeit ± {Math.round(pos!.coords.accuracy)} m
      </div>
    </div>
    <div class="row">
      <a class="btn" href={'sms:&body=' + encodeURIComponent(text)}>Per SMS senden</a>
      <button class="btn secondary" onclick={typeof navigator.share === 'function' ? share : copy}>Teilen / Kopieren</button>
    </div>
  {:else}
    <p class="wait">{err ?? 'Standort wird gesucht …'}</p>
  {/if}

  <ul class="tips">
    <li>Ruhe bewahren, sich und andere vor weiteren Gefahren schützen.</li>
    <li>Beim Anruf: <b>Wo</b> (Koordinaten oben), <b>Was</b> ist passiert, <b>Wie viele</b> Verletzte, auf Rückfragen warten.</li>
    <li>Warm halten (Rettungsdecke), nicht vom Fleck gehen, wenn Hilfe unterwegs ist.</li>
    <li>Alpines Notsignal ohne Netz: 6× pro Minute rufen, pfeifen oder mit Licht blinken, dann 1 Minute Pause.</li>
  </ul>
</Modal>

<style>
  .nums { display: grid; gap: 8px; margin-bottom: 12px; }
  .call {
    display: flex; align-items: center; gap: 14px; text-decoration: none; color: #fff;
    background: #d70015; border-radius: 14px; padding: 12px 16px; font-weight: 650;
  }
  .nr { font-size: 1.7rem; font-weight: 800; min-width: 70px; }
  h4 { margin: 8px 2px 6px; font-size: .78rem; text-transform: uppercase; color: var(--muted); }
  .coords { background: var(--surface2); border-radius: 14px; padding: 12px; text-align: center; }
  .big { font-size: 1.45rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .small { font-size: .85rem; color: var(--text2); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
  .row a { text-decoration: none; }
  .wait { color: var(--warn); }
  .tips { font-size: .85rem; color: var(--text2); padding-left: 1.1em; margin: 10px 0 0; }
  .tips li { margin-bottom: 5px; }
</style>
