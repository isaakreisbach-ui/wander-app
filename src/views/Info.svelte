<script lang="ts">
  import {
    swState, detectPlatform, isStandalone, requestPersistentStorage, storageEstimate, formatBytes,
  } from '../lib/status.svelte';

  const platform = detectPlatform();
  const standalone = isStandalone();
  const hasGps = 'geolocation' in navigator;
  const hasWakeLock = 'wakeLock' in navigator;

  let persisted = $state<boolean | null | undefined>(undefined);
  let usage = $state<string>('…');

  async function refresh() {
    persisted = await requestPersistentStorage();
    const e = await storageEstimate();
    usage = e ? `${formatBytes(e.usage)} von ${formatBytes(e.quota)}` : 'unbekannt';
  }
  refresh();

  const built = new Date(__BUILD_TIME__).toLocaleString('de-DE', {
    dateStyle: 'medium', timeStyle: 'short',
  });

  type Row = { label: string; ok: boolean | null; text: string };
  const rows = $derived<Row[]>([
    {
      label: 'Als App installiert',
      ok: standalone,
      text: standalone ? 'Ja' : 'Nein – läuft im Browser',
    },
    {
      label: 'Offline nutzbar',
      ok: swState.offlineReady,
      text: swState.offlineReady ? 'Ja' : swState.registered ? 'Wird vorbereitet …' : 'Noch nicht',
    },
    {
      label: 'Dauerhafter Speicher',
      ok: persisted ?? null,
      text:
        persisted === undefined ? '…' :
        persisted === true ? 'Ja – Daten werden nicht gelöscht' :
        persisted === false ? 'Nein – Browser darf Daten löschen' : 'Nicht unterstützt',
    },
    { label: 'Speicher belegt', ok: null, text: usage },
    { label: 'GPS verfügbar', ok: hasGps, text: hasGps ? 'Ja' : 'Nein' },
    {
      label: 'Bildschirm wach halten',
      ok: hasWakeLock,
      text: hasWakeLock ? 'Ja' : 'Nein – iOS aktualisieren',
    },
  ]);
</script>

<div class="card">
  <h2>Status</h2>
  <ul class="status">
    {#each rows as r}
      <li>
        <span class="dot" class:ok={r.ok === true} class:bad={r.ok === false} aria-hidden="true"></span>
        <span class="l">{r.label}</span>
        <span class="v">{r.text}</span>
      </li>
    {/each}
  </ul>
  <button class="btn secondary" onclick={refresh}>Neu prüfen</button>
</div>

{#if !standalone}
  <div class="card hint">
    <h2>App installieren</h2>
    {#if platform === 'ios'}
      <ol>
        <li>Diese Seite in <b>Safari</b> öffnen.</li>
        <li>Unten auf <b>Teilen</b> tippen (Quadrat mit Pfeil nach oben).</li>
        <li><b>Zum Home-Bildschirm</b> wählen, dann <b>Hinzufügen</b>.</li>
        <li>Die App ab jetzt immer über das neue Symbol starten.</li>
      </ol>
      <p class="note">Wichtig: Die Homescreen-App hat einen eigenen Speicher, getrennt von Safari.</p>
    {:else}
      <ol>
        <li>In der Adresszeile rechts auf das Symbol <b>App installieren</b> klicken
          (Bildschirm mit Pfeil) – oder im Menü <b>⋯</b> → <b>Apps</b> → <b>Diese Website als App installieren</b>.</li>
        <li><b>Installieren</b> bestätigen.</li>
      </ol>
    {/if}
  </div>
{/if}

<div class="card">
  <h2>Version</h2>
  <p>0.21 – Gipfelkreuze, Wege auf Satellit<br /><span class="muted">Stand: {built}</span></p>
</div>

<style>
  .status { list-style: none; padding: 0; margin: 0 0 14px; }
  .status li {
    display: grid; grid-template-columns: 14px 1fr; column-gap: 10px;
    padding: 10px 0; border-bottom: 1px solid var(--line);
  }
  .status li:last-child { border-bottom: 0; }
  .dot { width: 14px; height: 14px; border-radius: 50%; background: var(--line); margin-top: 4px; grid-row: span 2; }
  .dot.ok { background: var(--ok); }
  .dot.bad { background: var(--bad); }
  .l { font-weight: 650; }
  .v { color: var(--muted); }
  .hint { border-color: var(--amber); background: #fff8e8; }
  ol { padding-left: 1.3em; margin: 0 0 .75em; }
  li + li { margin-top: 6px; }
  .note { font-size: .9rem; color: var(--warn); }
  .muted { color: var(--muted); font-size: .9rem; }
</style>
