<script lang="ts">
  /**
   * Issued vs received charts, grouped bars by month.
   *
   * - `result` mode: net income vs net expenses; the result (income - expenses)
   *   goes in the tooltip.
   * - `vat` mode: VAT debit vs VAT credit (VAT + perception, same criterion as
   *   the fiscal credit KPI); the split and the balance go in the tooltip.
   *
   * Coverage notes explain what is NOT in the numbers; nothing is estimated.
   * The `result` panel carries the breakdown and ARCA-not-loaded notes; the
   * `vat` panel only notes what affects the VAT credit.
   */
  import { BarChart, Tooltip } from 'layerchart';
  import { formatCurrency } from '$lib/formatters';
  import {
    INCOME_EXPENSES_SERIES,
    VAT_SERIES,
    formatCompact,
    formatShortMonthList,
    incompleteMonths,
    monthName,
    shortMonthLabel,
    type MonthlyRow,
  } from '$lib/utils/dashboard';
  import type { IncomeVsExpensesCoverage } from '$lib/services/StatsService.types';
  import ChartTooltip from './ChartTooltip.svelte';
  import ChartLegend from './ChartLegend.svelte';

  interface Props {
    mode: 'result' | 'vat';
    rows: MonthlyRow[];
    coverage: IncomeVsExpensesCoverage;
    /** A/M invoices with a loaded breakdown vs total (feeds the VAT credit) */
    vatCoverage?: { withBreakdown: number; total: number };
  }

  let { mode, rows, coverage, vatCoverage }: Props = $props();

  const intFormatter = new Intl.NumberFormat('es-AR');
  const series = $derived(mode === 'result' ? INCOME_EXPENSES_SERIES : VAT_SERIES);
  const chartSeries = $derived(
    series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.key }))
  );
  const title = $derived(mode === 'result' ? 'Ingresos vs gastos (neto)' : 'IVA débito vs crédito');
  const hasIssued = $derived(coverage.issuedCount > 0);
  const missingMonths = $derived(incompleteMonths(coverage));
  const vatWithoutBreakdown = $derived(
    vatCoverage ? vatCoverage.total - vatCoverage.withBreakdown : 0
  );
  const notLoaded = $derived(coverage.expectedNotLoaded);
  const hasNotes = $derived(
    mode === 'result'
      ? coverage.invoicesWithoutBreakdown > 0 || notLoaded.count > 0 || missingMonths.length > 0
      : vatWithoutBreakdown > 0 || missingMonths.length > 0
  );

  function monthTitle(month: string): string {
    return `${monthName(Number(month.slice(5, 7)))} de ${month.slice(0, 4)}`;
  }

  function num(row: MonthlyRow, key: string): number {
    return Number(row[key]) || 0;
  }

  interface TipRow {
    label: string;
    color?: string;
    amount: number;
    detail?: boolean;
  }

  function tooltipRows(row: MonthlyRow): TipRow[] {
    if (mode === 'result') {
      const list: TipRow[] = [
        { label: 'Ingresos', color: INCOME_EXPENSES_SERIES[0].color, amount: num(row, 'income') },
        { label: 'Gastos', color: INCOME_EXPENSES_SERIES[1].color, amount: num(row, 'expenses') },
      ];
      if (num(row, 'expectedNotLoadedCount') > 0) {
        list.push({
          label: `Sin cargar (ARCA): ${num(row, 'expectedNotLoadedCount')}`,
          amount: num(row, 'expectedNotLoadedTotal'),
          detail: true,
        });
      }
      return list;
    }
    return [
      { label: 'IVA débito', color: VAT_SERIES[0].color, amount: num(row, 'vatDebit') },
      { label: 'IVA crédito', color: VAT_SERIES[1].color, amount: num(row, 'vatCreditTotal') },
      { label: 'IVA', amount: num(row, 'vatCredit'), detail: true },
      { label: 'Percepción', amount: num(row, 'vatPerception'), detail: true },
    ];
  }
</script>

<div class="wrap">
  {#if !hasIssued}
    <p class="empty">
      Sin comprobantes emitidos en el período. Importe el Excel de Mis Comprobantes Emitidos desde
      Comprobantes.
    </p>
  {:else}
    <div class="chart" role="img" aria-label={title}>
      <BarChart
        data={rows}
        x="month"
        series={chartSeries}
        seriesLayout="group"
        bandPadding={0.3}
        padding={{ top: 8, right: 8, bottom: 28, left: 56 }}
        props={{
          xAxis: { format: (m: string) => shortMonthLabel(m) },
          yAxis: { format: (v: number) => formatCompact(v) },
        }}
      >
        {#snippet tooltip({ context })}
          <Tooltip.Root {context}>
            {#snippet children({ data: row }: { data: MonthlyRow })}
              <ChartTooltip
                title={monthTitle(row.month)}
                rows={tooltipRows(row)}
                total={mode === 'result' ? num(row, 'result') : num(row, 'vatBalance')}
                totalLabel={mode === 'result' ? 'Resultado' : 'Saldo (positivo = a pagar)'}
              />
            {/snippet}
          </Tooltip.Root>
        {/snippet}
      </BarChart>
    </div>
    <ChartLegend
      items={series.map((s) => ({ label: s.label, color: s.color }))}
      label="Conceptos"
    />
  {/if}

  {#if hasIssued && hasNotes}
    <ul class="notes">
      {#if mode === 'result'}
        {#if coverage.invoicesWithoutBreakdown > 0}
          <li>
            {intFormatter.format(coverage.invoicesWithoutBreakdown)}
            {coverage.invoicesWithoutBreakdown === 1
              ? 'factura sin desglose'
              : 'facturas sin desglose'}
            (bruto {formatCurrency(coverage.invoicesWithoutBreakdownGross)}) no
            {coverage.invoicesWithoutBreakdown === 1 ? 'entra' : 'entran'} en el neto.
          </li>
        {/if}
        {#if notLoaded.count > 0}
          <li>
            {intFormatter.format(notLoaded.count)}
            {notLoaded.count === 1
              ? 'comprobante recibido informado'
              : 'comprobantes recibidos informados'} por ARCA sin cargar ({formatCurrency(
              notLoaded.total
            )}) no {notLoaded.count === 1 ? 'entra' : 'entran'} en gastos.
          </li>
        {/if}
        {#if missingMonths.length > 0}
          <li>Meses incompletos: {formatShortMonthList(missingMonths)}.</li>
        {/if}
      {:else}
        {#if vatWithoutBreakdown > 0 && vatCoverage}
          <li>
            {intFormatter.format(vatWithoutBreakdown)} de {intFormatter.format(vatCoverage.total)}
            facturas A y M sin desglose: su IVA no entra en el crédito.
          </li>
        {/if}
        {#if missingMonths.length > 0}
          <li>Crédito de IVA incompleto en: {formatShortMonthList(missingMonths)}.</li>
        {/if}
      {/if}
    </ul>
  {/if}
</div>

<style>
  .wrap {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .chart {
    width: 100%;
    height: calc(var(--spacing-20) * 3);
  }

  .empty {
    margin: 0;
    padding: var(--spacing-4);
    text-align: center;
    color: var(--color-text-tertiary);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-base);
  }

  .notes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }
</style>
