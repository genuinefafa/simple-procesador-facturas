<script lang="ts">
  /**
   * Period KPIs. The "pending ARCA" indicator is deliberately separate and
   * visually secondary: it never adds to any total.
   */
  import { formatCurrency } from '$lib/formatters';
  import { Info } from '$lib/components/icons';
  import type { StatsSummaryResponse } from '$lib/services/StatsService';

  interface Props {
    summary: StatsSummaryResponse;
    onpendingclick?: () => void;
    /** Show the ARCA pending indicator under the KPIs (default true) */
    showPending?: boolean;
  }

  let { summary, onpendingclick, showPending = true }: Props = $props();

  const intFormatter = new Intl.NumberFormat('es-AR');
  const pending = $derived(summary.pendingExpected);
  const foreign = $derived(summary.totals.foreignCurrencyCount);
</script>

<div class="kpis">
  <div class="kpi">
    <div class="kpi-label">Total del período</div>
    <div class="kpi-value">{formatCurrency(summary.totals.total)}</div>
    <p class="kpi-hint">En pesos, notas de crédito restadas</p>
  </div>
  <div class="kpi">
    <div class="kpi-label">Facturas</div>
    <div class="kpi-value">{intFormatter.format(summary.totals.count)}</div>
    <p class="kpi-hint">Comprobantes cargados en el período</p>
  </div>
  <div class="kpi">
    <div class="kpi-label">Con IVA computable</div>
    <div class="kpi-value">{formatCurrency(summary.totals.vatRecoverableTotal)}</div>
    <p class="kpi-hint">Facturas A y M</p>
  </div>
</div>

{#if showPending && pending.count > 0}
  <button type="button" class="pending" onclick={() => onpendingclick?.()}>
    <Info size={14} />
    <span>
      {intFormatter.format(pending.count)}
      {pending.count === 1 ? 'comprobante informado' : 'comprobantes informados'} por ARCA sin validar,
      por {formatCurrency(pending.total)}
    </span>
  </button>
{/if}

{#if foreign > 0}
  <p class="foreign">
    <Info size={14} />
    <span>
      {intFormatter.format(foreign)}
      {foreign === 1
        ? 'comprobante en otra moneda no incluido'
        : 'comprobantes en otra moneda no incluidos'}
      en los totales.
    </span>
  </p>
{/if}

<style>
  .kpis {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: var(--spacing-4);
  }

  .kpi {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    box-shadow: var(--shadow-base);
  }

  .kpi-label {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-2);
  }

  .kpi-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary-700);
    margin: 0 0 var(--spacing-1);
  }

  .kpi-hint {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .pending,
  .foreign {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .pending {
    align-self: flex-start;
    padding: var(--spacing-1) var(--spacing-3);
    background: transparent;
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-full);
    font-family: inherit;
    cursor: pointer;
  }

  .pending:hover {
    color: var(--color-text-secondary);
    border-color: var(--color-neutral-400);
    background: var(--color-surface);
  }
</style>
