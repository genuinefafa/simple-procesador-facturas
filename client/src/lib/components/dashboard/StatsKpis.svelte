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

{#if summary.incomeVsExpenses.coverage.issuedCount > 0}
  {@const t = summary.incomeVsExpenses.totals}
  <div class="kpis-six">
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-label">Ingresos (neto)</div>
        <div class="kpi-value">{formatCurrency(t.income)}</div>
        <p class="kpi-hint">Comprobantes emitidos, sin IVA</p>
      </div>
      <div class="kpi">
        <div class="kpi-label">Gastos (neto)</div>
        <div class="kpi-value">{formatCurrency(t.expenses)}</div>
        <p class="kpi-hint">Facturas con desglose, sin IVA</p>
      </div>
      <div class="kpi">
        <div class="kpi-label">Resultado</div>
        <div class="kpi-value">{formatCurrency(t.result)}</div>
        <p class="kpi-hint">
          {#if summary.incomeVsExpenses.coverage.expectedNotLoaded.count > 0}
            Faltan {formatCurrency(summary.incomeVsExpenses.coverage.expectedNotLoaded.total)} de recibidos
            informados por ARCA sin cargar
          {:else}
            Ingresos menos gastos
          {/if}
        </p>
      </div>
      <div class="kpi">
        <div class="kpi-label">IVA ventas</div>
        <div class="kpi-value">{formatCurrency(t.vatDebit)}</div>
        <p class="kpi-hint">De comprobantes emitidos</p>
      </div>
      <div class="kpi">
        <div class="kpi-label">IVA compras</div>
        <div class="kpi-value">{formatCurrency(t.vatCredit)}</div>
        <p class="kpi-hint">De recibidos A y M cargados; B y C no dan crédito</p>
      </div>
      <div class="kpi">
        <div class="kpi-label">Saldo técnico de IVA</div>
        <div class="kpi-value">{formatCurrency(t.vatBalance)}</div>
        <p class="kpi-hint">
          {t.vatBalance < 0 ? 'A favor (técnico)' : 'A pagar (técnico)'}
          {#if t.vatPerception > 0}
            · Percepciones de IVA cargadas: {formatCurrency(t.vatPerception)} (pago a cuenta, no incluidas)
          {/if}
        </p>
      </div>
    </div>
  </div>
{/if}

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

  /* Six KPIs: 6 columns when there is room, else 3 (never 5+1) */
  .kpis-six {
    container-type: inline-size;
  }

  .kpis-six .kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  @container (min-width: 96rem) {
    .kpis-six .kpis {
      grid-template-columns: repeat(6, minmax(0, 1fr));
    }
  }

  @container (max-width: 40rem) {
    .kpis-six .kpis {
      grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    }
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
