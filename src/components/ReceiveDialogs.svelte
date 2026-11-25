<script lang="ts">
  // Empfangen von Touren: Bestätigen, Link einfügen, Hinweis für iPhone-Safari.
  import Modal from './Modal.svelte';
  import { ui, toast } from '../lib/ui.svelte';
  import { acceptIncoming, receiveShareText } from '../lib/tours';
  import { formatDistance, formatDuration, cumulative, climb, walkingTimeHours } from '../lib/geo';

  let pasted = $state('');

  const info = $derived.by(() => {
    const p = ui.incoming;
    if (!p || p.route.length < 2) return null;
    const cum = cumulative(p.route);
    const m = cum[cum.length - 1];
    const { up, down } = climb(p.route);
    return { m, up, h: walkingTimeHours(m, up, down) };
  });

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      pasted = text;
      submitPaste();
    } catch {
      toast('Bitte den Link ins Feld einfügen (lange tippen → Einfügen).');
    }
  }

  function submitPaste() {
    const text = pasted.trim();
    if (!text) return;
    if (receiveShareText(text)) {
      ui.pasteLink = false;
      pasted = '';
    } else {
      alert('In diesem Text steckt kein Tour-Link aus der Wanderapp.');
    }
  }

  async function copyHandoff() {
    if (!ui.handoff) return;
    try {
      await navigator.clipboard.writeText(ui.handoff);
      toast('Link kopiert – jetzt die Wanderapp öffnen');
    } catch {
      prompt('Link kopieren:', ui.handoff);
    }
  }
</script>

{#if ui.incoming}
  {@const p = ui.incoming}
  <Modal title={p.kind === 'track' ? 'Aufzeichnung empfangen' : 'Tour empfangen'} onclose={() => (ui.incoming = null)}>
    <p class="big">„{p.name}“</p>
    {#if info}
      <p class="facts">{formatDistance(info.m)} · ↗ {Math.round(info.up)} m · ⏱ {formatDuration(info.h)}</p>
    {/if}
    <p class="muted">Die Tour wird unter „Touren“ gespeichert und zum Ansehen geöffnet.</p>
    <div class="row">
      <button class="btn" onclick={acceptIncoming}>Übernehmen</button>
      <button class="btn secondary" onclick={() => (ui.incoming = null)}>Abbrechen</button>
    </div>
  </Modal>
{/if}

{#if ui.pasteLink}
  <Modal title="Link einfügen" onclose={() => (ui.pasteLink = false)}>
    <p>Füge hier einen Tour-Link ein, den du dir z. B. per WhatsApp oder Mail geschickt hast.</p>
    <button class="btn" onclick={pasteFromClipboard}>📋 Aus Zwischenablage einfügen</button>
    <p class="muted or">oder von Hand:</p>
    <textarea bind:value={pasted} rows="3" placeholder="https://…#t=…" aria-label="Tour-Link"></textarea>
    <div class="row">
      <button class="btn secondary" onclick={submitPaste} disabled={!pasted.trim()}>Übernehmen</button>
    </div>
  </Modal>
{/if}

{#if ui.handoff}
  <Modal title="In der Wanderapp öffnen" onclose={() => (ui.handoff = null)}>
    <p>Dieser Link wurde in <b>Safari</b> geöffnet. Deine Touren liegen aber in der <b>Wanderapp auf dem Homescreen</b>
      – die beiden haben auf dem iPhone getrennte Speicher.</p>
    <ol>
      <li><button class="btn" onclick={copyHandoff}>Link kopieren</button></li>
      <li>Die <b>Wanderapp</b> über das Symbol auf dem Homescreen öffnen.</li>
      <li><b>Touren</b> → <b>Link einfügen</b> → „Aus Zwischenablage einfügen“.</li>
    </ol>
    <p class="muted">Noch nicht installiert? Unter „Info“ steht, wie es geht. Oder:
      <button class="link" onclick={() => { const u = ui.handoff; ui.handoff = null; if (u) receiveShareText(u); }}>hier in Safari ansehen</button>.
    </p>
  </Modal>
{/if}

<style>
  .big { font-size: 1.15rem; font-weight: 750; margin-bottom: 4px; }
  .facts { font-variant-numeric: tabular-nums; font-weight: 600; }
  .row { display: flex; gap: 8px; margin-top: 12px; }
  .row .btn { flex: 1; }
  textarea {
    width: 100%; font: inherit; font-size: 16px; padding: 10px; border-radius: 10px;
    border: 1px solid var(--line); resize: vertical;
  }
  .or { margin: 10px 0 6px; }
  ol { padding-left: 1.3em; }
  li { margin-bottom: 10px; }
  .link { border: 0; background: none; padding: 0; color: var(--green); font-weight: 650; text-decoration: underline; font: inherit; }
</style>
