<script lang="ts">
  /**
   * Content of a chart tooltip: optional title plus rows of
   * color swatch, label, amount and percentage.
   */
  import { formatCurrency } from '$lib/formatters';
  import { formatPercent } from '$lib/utils/dashboard';

  interface TooltipRow {
    label: string;
    color?: string;
    amount: number;
    percent?: number | null;
  }

  interface Props {
    title?: string;
    rows: TooltipRow[];
    /** Optional total line shown below the rows */
    total?: number | null;
  }

  let { title, rows, total = null }: Props = $props();
</script>

<div class="tooltip-body">
  {#if title}
    <p class="tooltip-title">{title}</p>
  {/if}
  <ul class="tooltip-rows">
    {#each rows as row, i (i)}
      <li class="tooltip-row">
        {#if row.color}
          <span class="swatch" style:background={row.color}></span>
        {/if}
        <span class="tooltip-label">{row.label}</span>
        <span class="tooltip-amount">{formatCurrency(row.amount)}</span>
        {#if row.percent !== undefined}
          <span class="tooltip-percent">{formatPercent(row.percent)}</span>
        {/if}
      </li>
    {/each}
  </ul>
  {#if total !== null}
    <p class="tooltip-total">
      <span>Total</span>
      <span>{formatCurrency(total)}</span>
    </p>
  {/if}
</div>

<style>
  .tooltip-body {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    min-width: 12rem;
    font-size: var(--font-size-sm);
  }

  .tooltip-title {
    margin: 0;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .tooltip-rows {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .tooltip-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto;
    align-items: center;
    gap: var(--spacing-2);
  }

  .tooltip-row:not(:has(.swatch)) {
    grid-template-columns: minmax(0, 1fr) auto auto;
  }

  .swatch {
    width: var(--spacing-3);
    height: var(--spacing-3);
    border-radius: var(--radius-sm);
  }

  .tooltip-amount {
    font-weight: var(--font-weight-semibold);
    text-align: right;
  }

  .tooltip-percent {
    color: var(--color-text-tertiary);
    min-width: 3.5rem;
    text-align: right;
  }

  .tooltip-total {
    display: flex;
    justify-content: space-between;
    margin: var(--spacing-1) 0 0;
    padding-top: var(--spacing-1);
    border-top: 1px solid var(--color-border);
    font-weight: var(--font-weight-semibold);
  }
</style>
