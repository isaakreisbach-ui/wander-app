<script lang="ts">
  import { offline, cancelDownload, formatMB } from '../lib/offline.svelte';
  const job = $derived(offline.job);
  const pct = $derived(job && job.total ? Math.round((job.done / job.total) * 100) : 0);
</script>

{#if job && job.status !== 'done' || job?.message}
  <div class="dl" class:err={job?.status === 'error'} role="status">
    {#if job!.status === 'running'}
      <div class="line">
        <span>📥 „{job!.name}“: {job!.done} / {job!.total} · {formatMB(job!.bytes)}</span>
        <button onclick={cancelDownload}>Abbrechen</button>
      </div>
      <div class="bar"><div style:width="{pct}%"></div></div>
    {:else}
      <div class="line">
        <span>
          {#if job!.status === 'error'}⚠️ Download fehlgeschlagen: {job!.message}
          {:else if job!.status === 'cancelled'}Download abgebrochen.
          {:else}{job!.message}{/if}
        </span>
        <button onclick={() => (offline.job = null)}>OK</button>
      </div>
    {/if}
  </div>
{/if}

<style>
  .dl {
    position: fixed; z-index: 45; left: 50%; transform: translateX(-50%);
    bottom: calc(var(--tabbar) + 12px + var(--safe-bottom));
    width: min(460px, calc(100% - 24px));
    background: #1f2a22; color: #fff; border-radius: 12px; padding: 10px 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, .3); font-size: .9rem;
  }
  .dl.err { background: #6d1b16; }
  .line { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
  button { border: 1px solid rgba(255, 255, 255, .5); background: none; color: #fff; border-radius: 8px; padding: 6px 10px; font-weight: 650; }
  .bar { margin-top: 8px; height: 6px; background: rgba(255, 255, 255, .2); border-radius: 3px; overflow: hidden; }
  .bar div { height: 100%; background: #7fd18b; transition: width .2s; }
  @media (min-width: 900px) { .dl { bottom: 20px; } }
</style>
