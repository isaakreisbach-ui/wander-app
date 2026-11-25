<script lang="ts">
  import QRCode from 'qrcode';
  import Modal from './Modal.svelte';
  import { buildShareLink } from '../lib/share';
  import { ui, toast, type ShareSource } from '../lib/ui.svelte';
  import { exportTour } from '../lib/tours';

  let { tour }: { tour: ShareSource } = $props();

  const link = $derived(buildShareLink(tour));
  let qr = $state<string | null>(null);
  let qrError = $state(false);

  $effect(() => {
    const url = link.url;
    QRCode.toDataURL(url, { errorCorrectionLevel: 'L', margin: 2, width: 720, color: { dark: '#000000', light: '#ffffff' } })
      .then((d) => { qr = d; qrError = false; })
      .catch(() => { qr = null; qrError = true; });
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.url);
      toast('Link kopiert');
    } catch {
      prompt('Link kopieren:', link.url);
    }
  }

  async function shareLink() {
    try {
      await navigator.share({ title: tour.name, text: `Wandertour „${tour.name}“`, url: link.url });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') copy();
    }
  }

  const canShare = typeof navigator.share === 'function';
  const close = () => (ui.share = null);
</script>

<Modal title="Tour teilen" onclose={close} wide>
  <p class="name">„{tour.name}“</p>

  <div class="qr">
    {#if qr}
      <img src={qr} alt="QR-Code mit der Tour" />
    {:else if qrError}
      <p class="muted">Die Tour ist zu lang für einen QR-Code – bitte den Link oder GPX verwenden.</p>
    {:else}
      <p class="muted">QR-Code wird erstellt …</p>
    {/if}
  </div>
  <p class="hint">
    <b>Mit dem iPhone:</b> Wanderapp öffnen → <b>Touren</b> → <b>QR scannen</b> und die Kamera auf diesen Code halten.
    <br /><span class="muted">(Nicht mit der normalen Kamera-App scannen – die öffnet Safari statt deiner App.)</span>
  </p>

  <div class="buttons">
    {#if canShare}<button class="btn" onclick={shareLink}>Link teilen …</button>{/if}
    <button class="btn" class:secondary={canShare} onclick={copy}>Link kopieren</button>
    <button class="btn secondary" onclick={() => exportTour({ name: tour.name, route: tour.route, waypoints: tour.waypoints })}>GPX-Datei</button>
  </div>

  <p class="muted small">
    Die Tour steckt komplett im Link – es wird nichts auf einen Server hochgeladen.
    {#if link.simplified}Die Strecke im Link ist leicht vereinfacht; geplante Touren werden beim Empfang mit Internet wieder genau berechnet.{/if}
    Link-Länge: {link.url.length} Zeichen.
  </p>
</Modal>

<style>
  .name { font-weight: 700; margin-bottom: 8px; }
  .qr { background: #fff; border-radius: 14px; border: 1px solid var(--line); display: grid; place-items: center; padding: 8px; min-height: 120px; }
  .qr img { width: 100%; max-width: 360px; height: auto; image-rendering: pixelated; }
  .hint { font-size: .9rem; margin: 12px 0; }
  .buttons { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); margin-bottom: 12px; }
  .small { font-size: .78rem; }
</style>
