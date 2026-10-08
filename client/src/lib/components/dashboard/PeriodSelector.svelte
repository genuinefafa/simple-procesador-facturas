<script lang="ts">
  /**
   * Period picker: kind (year / quarter / month) plus the matching value.
   * Stateless: reports the new period key through `onchange`.
   */
  import Button from '$lib/components/ui/Button.svelte';
  import {
    buildPeriodKey,
    changePeriodKind,
    monthName,
    parsePeriod,
    type ParsedPeriod,
    type PeriodKind,
  } from '$lib/utils/dashboard';

  interface Props {
    period: string;
    onchange: (key: string) => void;
    /** Overridable for tests */
    now?: Date;
  }

  let { period, onchange, now = new Date() }: Props = $props();

  const parsed = $derived(
    parsePeriod(period) ?? { kind: 'year' as PeriodKind, year: now.getFullYear() }
  );

  const KINDS: { kind: PeriodKind; label: string }[] = [
    { kind: 'year', label: 'Año' },
    { kind: 'quarter', label: 'Trimestre' },
    { kind: 'month', label: 'Mes' },
  ];

  // Current year back five years, always including the selected one
  const years = $derived.by(() => {
    const current = now.getFullYear();
    const list = Array.from({ length: 6 }, (_, i) => current - i);
    if (!list.includes(parsed.year)) list.push(parsed.year);
    return list.sort((a, b) => b - a);
  });

  function update(next: ParsedPeriod) {
    onchange(buildPeriodKey(next));
  }
</script>

<div class="selector">
  <div class="kinds" role="group" aria-label="Tipo de período">
    {#each KINDS as item (item.kind)}
      <Button
        size="sm"
        variant={parsed.kind === item.kind ? 'primary' : 'secondary'}
        onclick={() => update(changePeriodKind(parsed, item.kind, now))}
      >
        {item.label}
      </Button>
    {/each}
  </div>

  <div class="values">
    {#if parsed.kind === 'quarter'}
      <label class="field">
        <span class="field-label">Trimestre</span>
        <select
          value={parsed.quarter}
          onchange={(e) =>
            update({ ...parsed, quarter: Number((e.currentTarget as HTMLSelectElement).value) })}
        >
          {#each [1, 2, 3, 4] as q (q)}
            <option value={q}>{q}.º trimestre</option>
          {/each}
        </select>
      </label>
    {:else if parsed.kind === 'month'}
      <label class="field">
        <span class="field-label">Mes</span>
        <select
          value={parsed.month}
          onchange={(e) =>
            update({ ...parsed, month: Number((e.currentTarget as HTMLSelectElement).value) })}
        >
          {#each Array.from({ length: 12 }, (_, i) => i + 1) as m (m)}
            <option value={m}>{monthName(m)}</option>
          {/each}
        </select>
      </label>
    {/if}

    <label class="field">
      <span class="field-label">Año</span>
      <select
        value={parsed.year}
        onchange={(e) =>
          update({ ...parsed, year: Number((e.currentTarget as HTMLSelectElement).value) })}
      >
        {#each years as y (y)}
          <option value={y}>{y}</option>
        {/each}
      </select>
    </label>
  </div>
</div>

<style>
  .selector {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--spacing-4);
  }

  .kinds {
    display: flex;
    gap: var(--spacing-2);
  }

  .values {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-3);
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  select {
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    padding: var(--spacing-1) var(--spacing-3);
    min-height: var(--spacing-8);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    text-transform: capitalize;
  }

  select:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 1px;
  }
</style>
