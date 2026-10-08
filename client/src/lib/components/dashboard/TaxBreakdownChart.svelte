<script lang="ts">
  /**
   * Monthly net / VAT / other stacked bars plus the VAT fiscal credit KPI and
   * the breakdown coverage. Only invoices with a loaded breakdown count; when
   * there are none the chart is NOT rendered (nothing is ever estimated).
   */
  import { BarChart, Tooltip } from 'layerchart';
  import { formatCurrency } from '$lib/formatters';
  import {
    formatCompact,
    shortMonthLabel,
    monthName,
    type MonthlyChartData,
    type MonthlyRow,
  } from '$lib/utils/dashboard';
  import type { TaxBreakdownStats } from '$lib/services/StatsService';
  import ChartTooltip from './ChartTooltip.svelte';
  import ChartLegend from './ChartLegend.svelte';

  interface Props {
    data: MonthlyChartData;
    stats: TaxBreakdownStats;
    /** Human label of the period, e.g. "septiembre de 2026" */
    periodLabel: string;
  }

  let { data, stats, periodLabel }: Props = $props();

  const intFormatter = new Intl.NumberFormat('es-AR');
  // The chart counts any letter with a breakdown; the VAT credit only A/M
  const hasData = $derived(stats.byMonth.length > 0);
  const hasCredit = $derived(stats.coverage.withBreakdown > 0);
  const coverageText = $derived(
    `${intFormatter.format(stats.coverage.withBreakdown)} de ${intFormatter.format(stats.coverage.total)} facturas A/M con desglose`
  );

  const chartSeries = $derived(
    data.series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.key }))
  );

  function monthTitle(month: string): string {
    return `${monthName(Number(month.slice(5, 7)))} de ${month.slice(0, 4)}`;
  }

  function tooltipRows(row: MonthlyRow) {
    return data.series
      .map((s) => ({ label: s.label, color: s.color, amount: Number(row[s.key]) || 0 }))
      .filter((r) => r.amount !== 0);
  }

  function rowTotal(row: MonthlyRow): number {
    return data.series.reduce((acc, s) => acc + (Number(row[s.key]) || 0), 0);
  }
</script>

<div class="tax">
  <div class="summary">
    {#if hasCredit}
      <div class="kpi">
        <div class="kpi-label">IVA crédito fiscal del período</div>
        <div class="kpi-value">{formatCurrency(stats.vatCredit)}</div>
      </div>
    {/if}
    <p class="coverage">{coverageText}</p>
  </div>

  {#if hasData}
    <div class="chart" role="img" aria-label="Neto, IVA y otros por mes">
      <BarChart
        data={data.rows}
        x="month"
        series={chartSeries}
        seriesLayout="stack"
        bandPadding={0.3}
        padding={{ top: 8, right: 8, bottom: 28, left: 56 }}
        props={{
          bars: { stroke: 'var(--color-surface)', strokeWidth: 2 },
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
                total={rowTotal(row)}
              />
            {/snippet}
          </Tooltip.Root>
        {/snippet}
      </BarChart>
    </div>
    <ChartLegend
      items={data.series.map((s) => ({ label: s.label, color: s.color }))}
      label="Conceptos"
    />
  {:else}
    <p class="empty">
      Todavía no hay facturas con desglose impositivo en {periodLabel}. Cargalo desde el detalle de
      cada comprobante.
    </p>
  {/if}
</div>

<style>
  .tax {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .summary {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-3);
  }

  .kpi-label {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-1);
  }

  .kpi-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary-700);
  }

  .coverage {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
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
</style>
