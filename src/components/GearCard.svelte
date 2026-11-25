<script lang="ts">
  import Disclosure from './Disclosure.svelte';
  import { recommendGear, GROUPS, type GearItem } from '../lib/gear';
  import { wxShared } from '../lib/wxshared.svelte';
  import type { TourStats } from '../lib/db';

  let { stats, tourKey }: { stats: TourStats; tourKey: string } = $props();

  const items = $derived(recommendGear(stats, wxShared.current));
  const wxDay = $derived(wxShared.current?.day.date ?? null);

  // Abgehakte Dinge pro Tour merken (Packliste)
  const storeKey = $derived(`wander.gear.${tourKey}`);
  let packed = $state<Set<string>>(new Set());
  $effect(() => {
    try { packed = new Set(JSON.parse(localStorage.getItem(storeKey) || '[]')); } catch { packed = new Set(); }
  });
  function toggle(id: string) {
    const next = new Set(packed);
    next.has(id) ? next.delete(id) : next.add(id);
    packed = next;
    localStorage.setItem(storeKey, JSON.stringify([...next]));
  }
  function reset() {
    packed = new Set();
    localStorage.removeItem(storeKey);
  }

  const done = $derived(items.filter((i) => packed.has(i.id)).length);
  const mustOpen = $derived(items.filter((i) => i.level === 'must' && !packed.has(i.id)).length);
  const summary = $derived(
    `${done} von ${items.length} eingepackt` +
    (wxDay ? ` · Wetter ${new Date(wxDay + 'T12:00').toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'numeric' })}` : ''),
  );
  const byGroup = (g: string) => items.filter((i) => i.group === g);
  const LEVEL: Record<GearItem['level'], string> = { must: 'Wichtig', recommended: 'Empfohlen', optional: 'Optional' };
</script>

<Disclosure id="gear" icon="🎒" tint="#ff9500" title="Ausrüstung" {summary} badge={mustOpen ? `${mustOpen} wichtig` : ''}>
  {#each GROUPS as g}
    {@const list = byGroup(g)}
    {#if list.length}
      <h4>{g}</h4>
      <ul class="group">
        {#each list as it (it.id)}
          <li>
            <button class="row" class:packed={packed.has(it.id)} onclick={() => toggle(it.id)} aria-pressed={packed.has(it.id)}>
              <span class="check" aria-hidden="true">
                {#if packed.has(it.id)}<svg viewBox="0 0 16 16" width="12" height="12"><path d="M3 8.5l3 3 7-7" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>{/if}
              </span>
              <span class="emoji" aria-hidden="true">{it.icon}</span>
              <span class="txt">
                <span class="name">{it.name}</span>
                <span class="why">{it.why}</span>
              </span>
              <span class="lvl {it.level}">{LEVEL[it.level]}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  {/each}
  <div class="foot">
    <span>{wxShared.current ? 'Berücksichtigt das Wetter am gewählten Tag (Wetter-Box).' : 'Wetter-Box öffnen, um das Wetter einzubeziehen.'} Faustregeln – im Zweifel lieber mehr mitnehmen.</span>
    {#if done}<button class="reset" onclick={reset}>Zurücksetzen</button>{/if}
  </div>
</Disclosure>

<style>
  h4 {
    margin: 12px 4px 6px; font-size: .78rem; font-weight: 600; letter-spacing: .02em;
    text-transform: uppercase; color: #8e8e93;
  }
  .group { list-style: none; margin: 0; padding: 0; background: #f2f2f7; border-radius: 12px; overflow: hidden; }
  li + li .row { border-top: 0.5px solid #d1d1d6; }
  .row {
    width: 100%; display: flex; align-items: center; gap: 10px; text-align: left;
    padding: 10px 12px; border: 0; background: none; min-height: 52px;
    -webkit-tap-highlight-color: transparent;
  }
  .row:active { background: #e5e5ea; }
  .check {
    flex: none; width: 22px; height: 22px; border-radius: 50%;
    border: 1.5px solid #c7c7cc; display: grid; place-items: center; transition: all .15s;
  }
  .packed .check { background: #34c759; border-color: #34c759; }
  .emoji { flex: none; font-size: 1.2rem; width: 24px; text-align: center; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .name { font-size: .95rem; font-weight: 500; color: #1c1c1e; }
  .why { font-size: .8rem; color: #8e8e93; }
  .packed .name { color: #8e8e93; text-decoration: line-through; }
  .lvl { flex: none; font-size: .68rem; font-weight: 600; padding: 2px 7px; border-radius: 999px; }
  .lvl.must { background: #fff2e0; color: #c96a00; }
  .lvl.recommended { background: #e8f1ff; color: #0a66d1; }
  .lvl.optional { background: #f2f2f7; color: #8e8e93; }
  .foot { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; margin-top: 10px; font-size: .75rem; color: #8e8e93; }
  .reset { flex: none; border: 0; background: none; color: #007aff; font-size: .85rem; font-weight: 500; padding: 0; }
</style>
