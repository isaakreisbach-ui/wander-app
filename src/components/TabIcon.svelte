<script lang="ts">
  // Schlichte Linien-Symbole im Stil der iPhone-Symbole (statt Emojis)
  let { name, size = 26 }: { name: string; size?: number } = $props();
</script>

<svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if name === 'karte'}
    <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" /><path d="M9 4v14M15 6v14" />
  {:else if name === 'planen'}
    <circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="6" r="2.2" /><path d="M8 17c4-1 2-6 6-7.5 1.5-.6 2.4-1.3 2.6-2.4" stroke-dasharray="2.2 2.2" />
  {:else if name === 'touren'}
    <path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1.2" /><circle cx="4.5" cy="12" r="1.2" /><circle cx="4.5" cy="18" r="1.2" />
  {:else if name === 'aufzeichnen'}
    <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
  {:else if name === 'info'}
    <circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".9" fill="currentColor" stroke="none" />
  {/if}
</svg>
