<script lang="ts">
  /**
   * Month-by-month totals stacked by category (one bar per month).
   * Category colors come from the shared assignment so they match the
   * category bar chart. Negative stacks extend below the zero line.
   */
  import { BarChart, Tooltip } from 'layerchart';
  import {
    formatCompact,
    shortMonthLabel,
    monthName,
    type MonthlyChartData,
    type MonthlyRow,
    type MonthlySeries,
  } from '$lib/utils/dashboard';
  import ChartTooltip from './ChartTooltip.svelte';
  import ChartLegend from './ChartLegend.svelte';

  interface Props {
    data: MonthlyChartData;
    /** Called with the month (YYYY-MM) and the clicked series */
    onselect?: (month: string, series: MonthlySeries) => void;
  }

  let { data, onselect }: Props = $props();

  const seriesByKey = $derived(new Map(data.series.map((s) => [s.key, s])));
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

<div class="stacked">
  <div class="chart" role="img" aria-label="Totales mensuales por categoría">
    <BarChart
      data={data.rows}
      x="month"
      series={chartSeries}
      seriesLayout="stack"
      bandPadding={0.3}
      padding={{ top: 8, right: 8, bottom: 28, left: 56 }}
      props={{
        // Surface-colored 2px gap between stacked segments
        bars: { stroke: 'var(--color-surface)', strokeWidth: 2 },
        xAxis: { format: (m: string) => shortMonthLabel(m) },
        yAxis: { format: (v: number) => formatCompact(v) },
      }}
      onBarClick={(_e: MouseEvent, detail: { data: MonthlyRow; series: { key: string } }) => {
        const series = seriesByKey.get(detail.series.key);
        if (series) onselect?.(detail.data.month, series);
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
    label="Categorías"
  />
</div>

<style>
  .stacked {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .chart {
    width: 100%;
    height: calc(var(--spacing-20) * 3);
    cursor: pointer;
  }
</style>
