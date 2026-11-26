<script lang="ts">
  import Modal from './Modal.svelte';
  import { ui } from '../lib/ui.svelte';

  const touch = window.matchMedia('(pointer: coarse)').matches;
  const SLIDES = [
    { icon: '🗺️', title: 'Touren planen', text: `${touch ? 'Tippe' : 'Klicke'} unter „Planen“ auf die Karte – die Route folgt den Wanderwegen. Punkte ziehen zum Verschieben, auf die Linie ${touch ? 'tippen' : 'klicken'} für Zwischenpunkte.` },
    { icon: '🔍', title: 'Ideen finden', text: `${touch ? 'Karte lange drücken' : 'Rechtsklick auf die Karte'}: „Was geht von hier aus?“ zeigt Gipfel und Rundwege, „Wie komme ich dahin?“ Routen zum Punkt. Gipfel in der Suche zeigen Aufstiege mit Anreise.` },
    { icon: '⏺️', title: 'Aufzeichnen', text: 'Unter „Aufzeichnen“ starten. Bildschirm anlassen – das iPhone stoppt GPS sonst. Unterwegs zwischen großen Zahlen und Karte umschalten.' },
    { icon: '📥', title: 'Offline & Sicherheit', text: 'Tour öffnen → „Offline-Karte“ speichern, dann klappt die Karte ohne Netz. Oben rechts: SOS für den Notfall, ⚙︎ für Einstellungen und Datensicherung.' },
  ];
  let i = $state(0);
  function done() {
    localStorage.setItem('wander.intro.done', '1');
    ui.intro = false;
  }
</script>

<Modal title="Willkommen" onclose={done}>
  <div class="slide">
    <div class="icon">{SLIDES[i].icon}</div>
    <h3>{SLIDES[i].title}</h3>
    <p>{SLIDES[i].text}</p>
  </div>
  <div class="dots">{#each SLIDES as _, j}<span class:on={j === i}></span>{/each}</div>
  <div class="row">
    <button class="btn secondary" onclick={done}>Überspringen</button>
    {#if i < SLIDES.length - 1}
      <button class="btn" onclick={() => i++}>Weiter</button>
    {:else}
      <button class="btn" onclick={done}>Los geht's</button>
    {/if}
  </div>
</Modal>

<style>
  .slide { text-align: center; padding: 8px 4px; min-height: 210px; }
  .icon { font-size: 3.2rem; }
  h3 { margin: 6px 0; font-size: 1.25rem; }
  p { color: var(--text2); font-size: .95rem; }
  .dots { display: flex; justify-content: center; gap: 6px; margin: 6px 0 14px; }
  .dots span { width: 7px; height: 7px; border-radius: 50%; background: var(--surface3); }
  .dots span.on { background: var(--text); }
  .row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
</style>
