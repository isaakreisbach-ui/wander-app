<script lang="ts">
  // Aufklappbare Box im Stil von iOS: Symbol, Titel, Kurzinfo, Pfeil. Merkt sich, ob sie offen ist.
  import type { Snippet } from 'svelte';
  import { slide } from 'svelte/transition';

  let { id, icon, tint = '#34c759', title, summary = '', badge = '', children, defaultOpen = false }: {
    id: string; icon: string; tint?: string; title: string; summary?: string; badge?: string;
    children: Snippet; defaultOpen?: boolean;
  } = $props();

  // Absichtlich nur der Anfangswert – die Box merkt sich danach ihren Zustand selbst
  // svelte-ignore state_referenced_locally
  const KEY = `wander.disclosure.${id}`;
  // svelte-ignore state_referenced_locally
  let open = $state(localStorage.getItem(KEY) === null ? defaultOpen : localStorage.getItem(KEY) === '1');

  function toggle() {
    open = !open;
    localStorage.setItem(KEY, open ? '1' : '0');
  }
</script>

<section class="box">
  <button class="head" onclick={toggle} aria-expanded={open}>
    <span class="icon" style:background={tint} aria-hidden="true">{icon}</span>
    <span class="text">
      <span class="title">{title}</span>
      {#if summary}<span class="summary">{summary}</span>{/if}
    </span>
    {#if badge}<span class="badge">{badge}</span>{/if}
    <svg class="chev" class:open viewBox="0 0 12 20" width="9" height="15" aria-hidden="true">
      <path d="M2 2l8 8-8 8" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </button>
  {#if open}
    <div class="body" transition:slide={{ duration: 220 }}>
      {@render children()}
    </div>
  {/if}
</section>

<style>
  .box {
    background: var(--surface);
    border-radius: 16px;
    margin-bottom: 12px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, .05), 0 6px 20px rgba(0, 0, 0, .05);
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, 'Segoe UI', sans-serif;
  }
  .head {
    width: 100%; display: flex; align-items: center; gap: 12px;
    padding: 12px 14px; border: 0; background: none; text-align: left;
    -webkit-tap-highlight-color: transparent;
  }
  .head:active { background: var(--surface2); }
  .icon {
    flex: none; width: 32px; height: 32px; border-radius: 8px;
    display: grid; place-items: center; font-size: 1.05rem; color: #fff;
  }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .title { font-weight: 600; font-size: 1.02rem; letter-spacing: -0.01em; color: var(--text); }
  .summary { font-size: .84rem; color: #8e8e93; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .badge {
    flex: none; font-size: .75rem; font-weight: 700; color: #fff; background: #ff9500;
    border-radius: 999px; padding: 2px 8px;
  }
  .chev { flex: none; color: #c7c7cc; transition: transform .22s ease; }
  .chev.open { transform: rotate(90deg); }
  .body { padding: 0 14px 14px; }
</style>
