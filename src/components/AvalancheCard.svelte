<script lang="ts">
  // Lawinenlagebericht der Euregio Tirol – Südtirol – Trentino (offene Daten, avalanche.report).
  // Wird nur bei Touren in diesem Gebiet gezeigt. Außerhalb der Saison: Hinweis, dass kein aktueller Bericht vorliegt.
  import Disclosure from './Disclosure.svelte';
  import { planner } from '../lib/planner.svelte';

  type Rating = { mainValue: string; elevation?: { lowerBound?: string; upperBound?: string } };
  type Bulletin = { validTime: { startTime: string; endTime: string }; regions: { name: string }[]; dangerRatings: Rating[];
    avalancheProblems?: { problemType: string }[]; highlights?: string };

  const LEVEL: Record<string, { n: number; label: string; color: string }> = {
    low: { n: 1, label: 'gering', color: '#34c759' },
    moderate: { n: 2, label: 'mäßig', color: '#ffd60a' },
    considerable: { n: 3, label: 'erheblich', color: '#ff9500' },
    high: { n: 4, label: 'groß', color: '#ff3b30' },
    very_high: { n: 5, label: 'sehr groß', color: '#8b0000' },
  };
  const PROBLEM: Record<string, string> = {
    new_snow: 'Neuschnee', wind_slab: 'Triebschnee', persistent_weak_layers: 'Altschnee', wet_snow: 'Nassschnee', gliding_snow: 'Gleitschnee',
  };

  const start = $derived(planner.route[0]);
  const inEuregio = $derived(!!start && start[1] > 45.6 && start[1] < 47.75 && start[0] > 10.1 && start[0] < 12.97);
  let bulletins = $state<Bulletin[] | null>(null);
  let error = $state(false);

  $effect(() => {
    if (!inEuregio || bulletins || !navigator.onLine) return;
    fetch('https://static.avalanche.report/bulletins/latest/EUREGIO_de_CAAMLv6.json')
      .then((r) => r.json()).then((j) => (bulletins = j.bulletins ?? [])).catch(() => (error = true));
  });

  const current = $derived(bulletins?.filter((b) => Date.parse(b.validTime.endTime) > Date.now() - 24 * 3600e3) ?? []);
  const maxOf = (b: Bulletin) => Math.max(...b.dangerRatings.map((r) => LEVEL[r.mainValue]?.n ?? 0));
  const overall = $derived(current.length ? Math.max(...current.map(maxOf)) : 0);
  const lvl = (n: number) => Object.values(LEVEL).find((l) => l.n === n);
  const summary = $derived(
    error ? 'Bericht nicht erreichbar' : !bulletins ? 'Wird geladen …'
      : current.length ? `Höchste Stufe heute: ${overall} – ${lvl(overall)?.label}` : 'Derzeit kein aktueller Bericht (Saison ca. Dez–Mai)',
  );
</script>

{#if inEuregio}
  <Disclosure id="avalanche" icon="snow" tint="#5ac8fa" title="Lawinenlagebericht" {summary} badge={overall >= 3 ? `Stufe ${overall}` : ''}>
    {#if current.length}
      <p class="txt">Gefahrenstufen je Gebiet (Euregio Tirol – Südtirol – Trentino). Suche das Gebiet deiner Tour:</p>
      <ul class="list">
        {#each current as b}
          {@const m = maxOf(b)}
          <li>
            <span class="lv" style:background={lvl(m)?.color}>{m}</span>
            <span class="t">
              <b>{b.regions.slice(0, 3).map((r) => r.name).join(', ')}{b.regions.length > 3 ? ` +${b.regions.length - 3}` : ''}</b>
              <small>
                {b.dangerRatings.map((r) => `${LEVEL[r.mainValue]?.label ?? r.mainValue}${r.elevation?.lowerBound ? ` über ${r.elevation.lowerBound} m` : r.elevation?.upperBound ? ` unter ${r.elevation.upperBound} m` : ''}`).join(' · ')}
                {#if b.avalancheProblems?.length} · {b.avalancheProblems.map((p) => PROBLEM[p.problemType] ?? p.problemType).join(', ')}{/if}
              </small>
            </span>
          </li>
        {/each}
      </ul>
    {:else if bulletins}
      <p class="txt">Außerhalb der Wintersaison gibt es keinen täglichen Bericht. Ab etwa Dezember erscheint er hier automatisch.</p>
    {/if}
    <p class="note">Quelle: <a href="https://avalanche.report" target="_blank" rel="noopener">avalanche.report</a> (Lawinenwarndienste Tirol, Südtirol, Trentino). Vor Skitouren und Winterwanderungen immer den vollständigen Bericht lesen.</p>
  </Disclosure>
{/if}

<style>
  .txt { font-size: .86rem; color: var(--text2); }
  .list { list-style: none; padding: 0; margin: 8px 0; background: var(--surface2); border-radius: 12px; overflow: hidden; max-height: 320px; overflow-y: auto; }
  li { display: flex; gap: 10px; align-items: center; padding: 9px 12px; }
  li + li { border-top: 0.5px solid var(--line); }
  .lv { flex: none; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center; font-weight: 800; color: #000; }
  .t { display: flex; flex-direction: column; font-size: .88rem; }
  .t small { color: var(--muted); font-size: .76rem; }
  .note { font-size: .72rem; color: var(--muted); }
  .note a { color: #0a84ff; }
</style>
