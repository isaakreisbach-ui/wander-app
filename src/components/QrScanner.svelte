<script lang="ts">
  // QR-Code mit der Kamera lesen (jsQR – funktioniert auch in der iPhone-Homescreen-App).
  import jsQR from 'jsqr';
  import { onMount } from 'svelte';
  import Modal from './Modal.svelte';
  import { ui } from '../lib/ui.svelte';
  import { receiveShareText } from '../lib/tours';

  let video: HTMLVideoElement;
  let status = $state('Kamera wird gestartet …');
  let failed = $state(false);

  const close = () => (ui.scanner = false);

  onMount(() => {
    let stream: MediaStream | undefined;
    let raf = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

    const tick = () => {
      if (stopped) return;
      if (video.readyState >= 2 && video.videoWidth) {
        const scale = Math.min(1, 720 / Math.max(video.videoWidth, video.videoHeight));
        canvas.width = Math.round(video.videoWidth * scale);
        canvas.height = Math.round(video.videoHeight * scale);
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (code?.data) {
          if (receiveShareText(code.data)) {
            close();
            return;
          }
          status = 'Das ist kein Tour-Code aus der Wanderapp.';
        }
      }
      raf = requestAnimationFrame(tick);
    };

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        video.srcObject = stream;
        await video.play();
        status = 'Halte die Kamera auf den QR-Code am PC-Bildschirm.';
        raf = requestAnimationFrame(tick);
      } catch (e) {
        failed = true;
        const name = (e as Error).name;
        status = name === 'NotAllowedError'
          ? 'Kein Kamerazugriff. iPhone: Einstellungen → Apps → Safari → Kamera → „Fragen“ oder „Erlauben“, dann erneut versuchen.'
          : 'Kamera konnte nicht gestartet werden.';
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  });
</script>

<Modal title="QR-Code scannen" onclose={close}>
  <div class="cam" class:failed>
    <video bind:this={video} playsinline muted></video>
    {#if !failed}<div class="frame" aria-hidden="true"></div>{/if}
  </div>
  <p class="status" role="status">{status}</p>
  {#if failed}
    <button class="btn secondary" onclick={() => { ui.scanner = false; ui.pasteLink = true; }}>Stattdessen Link einfügen</button>
  {/if}
</Modal>

<style>
  .cam { position: relative; background: #000; border-radius: 14px; overflow: hidden; aspect-ratio: 3 / 4; max-height: 60vh; margin: 0 auto; }
  .cam.failed { aspect-ratio: auto; height: 80px; }
  video { width: 100%; height: 100%; object-fit: cover; display: block; }
  .frame {
    position: absolute; inset: 15%; border: 4px solid rgba(255, 255, 255, .9); border-radius: 18px;
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, .25);
  }
  .status { margin: 12px 0; font-weight: 600; }
</style>
