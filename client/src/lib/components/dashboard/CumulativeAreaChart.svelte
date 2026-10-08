<script lang="ts">
  /**
   * Running total stacked by category: how the period total builds up month
   * after month and how much each category contributes. Same series and
   * colors as the monthly stacked chart.
   */
  import { AreaChart, Tooltip } from 'layerchart';
  import {
    formatCompact,
    shortMonthLabel,
    monthName,
    type CumulativeChartData,
    type CumulativeRow,
    type MonthlySeries,
  } from '$lib/utils/dashboard';
  import ChartTooltip from './ChartTooltip.svelte';
  import ChartLegend from './ChartLegend.svelte';

  interface Props {
    data: CumulativeChartData;
    /** Called with the month (YYYY-MM) and the clicked series */
    onselect?: (month: string, series: MonthlySeries) => void;
  }

  let { data, onselect }: Props = $props();

  const seriesByKey = $derived(new Map(data.series.map((s) => [s.key, s])));
  const chartSeries = $derived(
    data.series.map((s) => ({ key: s.key, label: s.label, color: s.color, value: s.key }))
  );

  function monthTitle(month: string): string {
    return `Acumulado a ${monthName(Number(month.slice(5, 7))).toLowerCase()} de ${month.slice(0, 4)}`;
  }

  function tooltipRows(row: CumulativeRow) {
    return data.series
      .map((s) => ({ label: s.label, color: s.color, amount: Number(row[s.key]) || 0 }))
      .filter((r) => r.amount !== 0);
  }

  function rowTotal(row: CumulativeRow): number {
    return data.series.reduce((acc, s) => acc + (Number(row[s.key]) || 0), 0);
  }

  function monthOf(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }
</script>

<div class="cumulative">
  <div class="chart" role="img" aria-label="Total acumulado por categoría">
    <AreaChart
      data={data.rows}
      x="date"
      series={chartSeries}
      seriesLayout="stack"
      padding={{ top: 8, right: 16, bottom: 28, left: 56 }}
      props={{
        // Stacked areas read as solid bands; the default 0.3 washes out the palette
        area: { fillOpacity: 0.85 },
        // One tick per month of data; the time scale would add in-between ticks
        xAxis: {
          ticks: data.rows.map((r) => r.date),
          format: (d: Date) => shortMonthLabel(monthOf(d)),
        },
        yAxis: { format: (v: number) => formatCompact(v) },
      }}
      onPointClick={(
        _e: MouseEvent,
        detail: { point: { seriesKey?: string }; data: CumulativeRow }
      ) => {
        const series = detail.point.seriesKey ? seriesByKey.get(detail.point.seriesKey) : undefined;
        if (series) onselect?.(detail.data.month, series);
      }}
    >
      {#snippet tooltip({ context })}
        <Tooltip.Root {context}>
          {#snippet children({ data: row }: { data: CumulativeRow })}
            <ChartTooltip
              title={monthTitle(row.month)}
              rows={tooltipRows(row)}
              total={rowTotal(row)}
            />
          {/snippet}
        </Tooltip.Root>
      {/snippet}
    </AreaChart>
  </div>
  <ChartLegend
    items={data.series.map((s) => ({ label: s.label, color: s.color }))}
    label="Categorías"
  />
</div>

<style>
  .cumulative {
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
