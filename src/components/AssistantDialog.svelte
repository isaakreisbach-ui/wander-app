<script lang="ts">
  import Modal from './Modal.svelte';
  import { ui } from '../lib/ui.svelte';
  import { ai, ask, setKey, resetChat, showToursOnMap } from '../lib/assistant.svelte';
  import { tick } from 'svelte';

  let q = $state('');
  let keyInput = $state('');
  let editKey = $state(!ai.key);
  let list: HTMLDivElement | undefined = $state();

  const EXAMPLES = [
    'Leichte Rundtour mit Einkehr im Taunus, höchstens 3 Stunden',
    'Welche Gipfel kann ich vom Feldberg aus machen?',
    'Wie wird das Wetter am Wochenende in Garmisch?',
    'Welche meiner gespeicherten Touren ist die längste?',
  ];

  async function send(text = q) {
    text = text.trim();
    if (!text) return;
    q = '';
    const p = ask(text);
    await tick(); list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
    await p;
    await tick(); list?.scrollTo({ top: list.scrollHeight, behavior: 'smooth' });
  }
  function saveKey() { setKey(keyInput); keyInput = ''; editKey = !ai.key; }
</script>

<Modal title="KI-Assistent" onclose={() => (ui.ai = false)} wide>
  {#if editKey}
    <div class="setup">
      <p><b>Einmalig einrichten (kostenlos):</b></p>
      <ol>
        <li>Öffne <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> und melde dich mit einem Google-Konto an.</li>
        <li>Tippe auf <b>„API-Schlüssel erstellen“</b> und kopiere den Schlüssel.</li>
        <li>Füge ihn hier ein und tippe auf „Speichern“.</li>
      </ol>
      <input type="password" bind:value={keyInput} placeholder="Schlüssel einfügen" autocomplete="off" />
      <div class="row">
        <button class="btn" onclick={saveKey} disabled={!keyInput.trim()}>Speichern</button>
        {#if ai.key}<button class="btn secondary" onclick={() => (editKey = false)}>Abbrechen</button>{/if}
      </div>
      <p class="note">Der Schlüssel bleibt nur auf diesem Gerät. Deine Fragen werden an Google (Gemini) geschickt – bei der kostenlosen Stufe darf Google sie zur Verbesserung nutzen. Gib also nichts Privates ein. Auf jedem Gerät (iPhone, PC) muss der Schlüssel einmal eingetragen werden.</p>
    </div>
  {:else}
    <div class="chat" bind:this={list}>
      {#if !ai.msgs.length}
        <p class="hello">Frag mich nach Touren, Gipfeln oder dem Wetter. Zum Beispiel:</p>
        {#each EXAMPLES as e}<button class="ex" onclick={() => send(e)}>{e}</button>{/each}
      {/if}
      {#each ai.msgs as m}
        <div class="msg {m.from}">{m.text}</div>
        {#if m.showTours}<button class="btn tours" onclick={showToursOnMap}>Auf der Karte ansehen</button>{/if}
      {/each}
      {#if ai.busy}<div class="msg ai busy"><span class="spin"></span>{ai.busy}</div>{/if}
    </div>
    <form class="input" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <input bind:value={q} placeholder="Frage stellen …" enterkeyhint="send" disabled={!!ai.busy} />
      <button class="btn" type="submit" disabled={!q.trim() || !!ai.busy} aria-label="Senden">↑</button>
    </form>
    <div class="foot">
      <button class="link" onclick={resetChat}>Neues Gespräch</button>
      <button class="link" onclick={() => (editKey = true)}>Schlüssel ändern</button>
    </div>
    <p class="note">Die KI kann sich irren. Vorschläge stammen aus OpenStreetMap und Waymarked Trails – vor der Tour selbst prüfen.</p>
  {/if}
</Modal>

<style>
  .setup ol { padding-left: 20px; font-size: .9rem; color: var(--text2); }
  .setup li { margin-bottom: 6px; }
  .setup a { color: #0a84ff; }
  .setup input, .input input {
    width: 100%; box-sizing: border-box; border: 1px solid var(--line); background: var(--surface2); color: var(--text);
    border-radius: 12px; padding: 11px 13px; font-size: 16px;
  }
  .row { display: flex; gap: 8px; margin: 10px 0; }
  .note { font-size: .74rem; color: var(--muted); }
  .chat { display: flex; flex-direction: column; gap: 8px; max-height: min(55vh, 520px); min-height: 200px; overflow-y: auto; padding: 4px 2px 8px; }
  .hello { color: var(--text2); font-size: .9rem; margin: 0 0 4px; }
  .ex { text-align: left; border: 1px solid var(--line); background: var(--surface); color: var(--text); border-radius: 12px; padding: 9px 12px; font-size: .86rem; }
  .ex:hover { background: var(--surface2); }
  .msg { max-width: 86%; padding: 9px 13px; border-radius: 18px; font-size: .92rem; line-height: 1.4; white-space: pre-wrap; }
  .msg.me { align-self: flex-end; background: #0a84ff; color: #fff; border-bottom-right-radius: 5px; }
  .msg.ai { align-self: flex-start; background: var(--surface2); color: var(--text); border-bottom-left-radius: 5px; }
  .msg.busy { display: flex; gap: 8px; align-items: center; color: var(--muted); }
  .tours { align-self: flex-start; border-radius: 12px; }
  .spin { width: 14px; height: 14px; border-radius: 50%; border: 2.5px solid var(--line); border-top-color: #0a84ff; animation: spin .8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .input { display: flex; gap: 8px; margin-top: 6px; }
  .input .btn { flex: none; width: 46px; border-radius: 50%; font-size: 1.2rem; padding: 0; }
  .foot { display: flex; justify-content: space-between; margin-top: 6px; }
  .link { border: 0; background: none; color: #0a84ff; font-size: .82rem; padding: 4px 2px; }
</style>
