<script lang="ts">
  import type { Snippet } from 'svelte';
  let { title, onclose, children, wide = false }: {
    title: string; onclose: () => void; children: Snippet; wide?: boolean;
  } = $props();

  $effect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onclose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });
</script>

<div class="backdrop" role="presentation" onclick={(e) => { if (e.target === e.currentTarget) onclose(); }}>
  <div class="modal" class:wide role="dialog" aria-modal="true" aria-label={title}>
    <header>
      <h2>{title}</h2>
      <button class="x" onclick={onclose} aria-label="Schließen">✕</button>
    </header>
    <div class="body">{@render children()}</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0; z-index: 40;
    background: rgba(0, 0, 0, .45);
    display: grid; place-items: center;
    padding: calc(12px + var(--safe-top)) 12px calc(12px + var(--safe-bottom));
  }
  .modal {
    width: min(440px, 100%); max-height: 100%; overflow: auto;
    background: var(--bg); border-radius: 18px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, .35);
  }
  .modal.wide { width: min(560px, 100%); }
  header {
    position: sticky; top: 0; z-index: 1; background: var(--bg);
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    padding: 14px 10px 6px 18px;
  }
  h2 { margin: 0; font-size: 1.2rem; }
  .x { width: 44px; height: 44px; border: 0; background: none; font-size: 1.2rem; border-radius: 10px; color: var(--muted); }
  .x:hover { background: var(--green-soft); }
  .body { padding: 4px 18px 18px; }
</style>
