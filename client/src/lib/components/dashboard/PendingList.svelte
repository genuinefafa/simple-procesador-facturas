<script lang="ts">
  /**
   * Actionable pending items for the dashboard. The unprocessed files link
   * carries no counter on purpose: the old one relied on a stale status (#123).
   */
  import { formatCurrency } from '$lib/formatters';
  import { Info, Inbox } from '$lib/components/icons';
  import type { StatsSummaryResponse } from '$lib/services/StatsService';

  interface Props {
    pending: StatsSummaryResponse['pendingExpected'];
    onexpectedclick: () => void;
    onfilesclick: () => void;
  }

  let { pending, onexpectedclick, onfilesclick }: Props = $props();

  const intFormatter = new Intl.NumberFormat('es-AR');
</script>

<div class="items">
  {#if pending.count > 0}
    <button type="button" class="item" onclick={onexpectedclick}>
      <Info size={14} />
      <span>
        {intFormatter.format(pending.count)}
        {pending.count === 1 ? 'comprobante informado' : 'comprobantes informados'} por ARCA sin validar,
        por {formatCurrency(pending.total)}
      </span>
    </button>
  {:else}
    <p class="none">No hay comprobantes informados por ARCA pendientes de validar.</p>
  {/if}
  <button type="button" class="item" onclick={onfilesclick}>
    <Inbox size={14} />
    <span>Ver archivos sin procesar</span>
  </button>
</div>

<style>
  .items {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--spacing-2);
  }

  .item {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }

  .item:hover {
    border-color: var(--color-primary-300);
  }

  .none {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }
</style>
