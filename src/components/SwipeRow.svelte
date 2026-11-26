<script lang="ts">
  // Zeile, die man (wie in iOS-Mail) nach links wischen kann, um Aktionen anzuzeigen.
  import type { Snippet } from 'svelte';
  let { children, onShare, onDelete }: { children: Snippet; onShare: () => void; onDelete: () => void } = $props();

  const OPEN = -152;
  let x = $state(0);
  let dragging = $state(false);
  let startX = 0, startY = 0, base = 0, horizontal: boolean | null = null;

  function start(e: TouchEvent) {
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY; base = x; horizontal = null; dragging = true;
  }
  function move(e: TouchEvent) {
    if (!dragging) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    if (horizontal === null && Math.hypot(dx, dy) > 8) horizontal = Math.abs(dx) > Math.abs(dy);
    if (!horizontal) return;
    e.preventDefault();
    x = Math.min(0, Math.max(OPEN - 40, base + dx));
  }
  function end() {
    dragging = false;
    if (horizontal) x = x < OPEN / 2 ? OPEN : 0;
  }
  const act = (fn: () => void) => { x = 0; fn(); };
</script>

<div class="swipe">
  <div class="actions" aria-hidden={x === 0}>
    <button class="share" onclick={() => act(onShare)}>Teilen</button>
    <button class="del" onclick={() => act(onDelete)}>Löschen</button>
  </div>
  <div class="content" role="group" class:anim={!dragging} style:transform="translateX({x}px)"
    ontouchstart={start} ontouchmove={move} ontouchend={end} ontouchcancel={end}>
    {@render children()}
  </div>
</div>

<style>
  .swipe { position: relative; overflow: hidden; border-radius: var(--radius); }
  .actions { position: absolute; inset: 0 0 0 auto; display: flex; width: 152px; }
  .actions button { flex: 1; border: 0; color: #fff; font-weight: 700; font-size: .9rem; }
  .share { background: #0a84ff; }
  .del { background: #ff453a; }
  .content { position: relative; background: var(--surface); touch-action: pan-y; }
  .content.anim { transition: transform .22s ease; }
</style>
