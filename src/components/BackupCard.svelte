<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  import { createBackup, restoreBackup, lastBackup } from '../lib/backup';
  import { toast } from '../lib/ui.svelte';

  let last = $state(lastBackup());
  let busy = $state(false);
  let fileInput: HTMLInputElement;

  const daysAgo = $derived(last ? Math.floor((Date.now() - last) / 86400000) : null);
  const summary = $derived(
    daysAgo === null ? 'Noch nie gesichert' : daysAgo === 0 ? 'Zuletzt heute gesichert' : `Zuletzt vor ${daysAgo} Tag${daysAgo === 1 ? '' : 'en'} gesichert`,
  );

  async function backup() {
    busy = true;
    try {
      const n = await createBackup();
      last = lastBackup();
      toast(`Sicherung mit ${n} Touren erstellt`);
    } catch (e) {
      if ((e as Error).name !== 'AbortError') alert(`Sicherung fehlgeschlagen: ${(e as Error).message}`);
    } finally { busy = false; }
  }

  async function restore(f: File) {
    busy = true;
    try {
      const r = await restoreBackup(f);
      toast(r.tours ? `${r.tours} Touren wiederhergestellt` : 'Alles war schon da – nichts geändert');
    } catch (e) {
      alert((e as Error).message);
    } finally { busy = false; }
  }
</script>

<Disclosure id="backup" icon="save" tint="#0a84ff" title="Datensicherung" {summary} badge={daysAgo === null || daysAgo > 30 ? 'Empfohlen' : ''}>
  <p class="txt">Deine Touren liegen nur auf diesem Gerät. Sichere sie regelmäßig als Datei – z. B. in iCloud Drive („In Dateien sichern“) oder auf dem PC. Damit bringst du auch alle Touren auf einmal auf ein anderes Gerät.</p>
  <div class="row">
    <button class="btn" onclick={backup} disabled={busy}>Jetzt sichern</button>
    <button class="btn secondary" onclick={() => fileInput.click()} disabled={busy}>Wiederherstellen</button>
  </div>
  <input bind:this={fileInput} type="file" hidden onchange={(e) => { const f = e.currentTarget.files?.[0]; if (f) restore(f); e.currentTarget.value = ''; }} />
  <p class="note">Gesichert werden Touren, Aufzeichnungen, Packlisten, Lieblingsorte und Einstellungen. Offline-Karten nicht (die einfach neu herunterladen). Beim Wiederherstellen gehen vorhandene Touren nicht verloren.</p>
</Disclosure>

<style>
  .txt { font-size: .88rem; color: var(--text2); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin: 10px 0; }
  .note { font-size: .74rem; color: var(--muted); margin: 0; }
</style>
