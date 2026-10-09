<script lang="ts">
  /**
   * Compact table comparing an invoice's tax breakdown with the one informed by
   * ARCA. Rows that do not match are highlighted. When the invoice has no
   * breakdown, the "Factura" column shows a dash and the ARCA lines are listed.
   */
  import { formatCurrency } from '$lib/formatters';
  import {
    bucketLabel,
    type TaxReconciliationItem,
  } from '$lib/services/ReconciliationService.types';

  interface Props {
    item: Pick<TaxReconciliationItem, 'buckets' | 'arcaLines'>;
  }

  let { item }: Props = $props();

  function signed(value: number): string {
    if (value === 0) return formatCurrency(0);
    return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
  }

  const arcaOnly = $derived(item.buckets.length === 0 ? (item.arcaLines ?? []) : []);
</script>

{#if item.buckets.length > 0 || arcaOnly.length > 0}
  <table>
    <thead>
      <tr>
        <th>Concepto</th>
        <th class="num">Factura</th>
        <th class="num">ARCA</th>
        <th class="num">Diferencia</th>
      </tr>
    </thead>
    <tbody>
      {#each item.buckets as bucket (bucket.key)}
        <tr class:mismatch={!bucket.matches}>
          <td>{bucketLabel(bucket.concept, bucket.rate)}</td>
          <td class="num">{formatCurrency(bucket.invoice)}</td>
          <td class="num">{formatCurrency(bucket.arca)}</td>
          <td class="num">{bucket.matches ? '—' : signed(bucket.diff)}</td>
        </tr>
      {/each}
      {#each arcaOnly as line, i (i)}
        <tr>
          <td>{bucketLabel(line.concept, line.rate)}</td>
          <td class="num">—</td>
          <td class="num">{formatCurrency(line.amount)}</td>
          <td class="num">—</td>
        </tr>
      {/each}
    </tbody>
  </table>
{/if}

<style>
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th {
    text-align: left;
    padding: var(--spacing-1) var(--spacing-2);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: var(--spacing-1) var(--spacing-2);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  tr.mismatch td {
    background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
    font-weight: var(--font-weight-medium);
  }
</style>
