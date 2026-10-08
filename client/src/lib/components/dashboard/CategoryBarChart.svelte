<script lang="ts">
  /**
   * Totals by category: horizontal bars sorted descending, labelled with
   * amount and share of the total. Negative totals (credit notes) extend to
   * the left of the zero line.
   */
  import { BarChart, Tooltip } from 'layerchart';
  import { formatCurrency } from '$lib/formatters';
  import { formatCompact, formatPercent, type CategoryBarRow } from '$lib/utils/dashboard';
  import ChartTooltip from './ChartTooltip.svelte';

  interface Props {
    rows: CategoryBarRow[];
    onselect?: (row: CategoryBarRow) => void;
  }

  let { rows, onselect }: Props = $props();

  const labelById = $derived(new Map(rows.map((r) => [r.id, r.label])));
  const rowById = $derived(new Map(rows.map((r) => [r.id, r])));
  // One row per category; height grows with the number of bars
  const height = $derived(
    `calc(var(--spacing-10) * ${Math.max(rows.length, 2)} + var(--spacing-12))`
  );

  function barLabel(d: CategoryBarRow): string {
    return `${formatCurrency(d.total)} · ${formatPercent(d.percent)}`;
  }
</script>

<div class="chart" style:height role="img" aria-label="Totales por categoría">
  <BarChart
    data={rows}
    orientation="horizontal"
    x="total"
    y="id"
    c="id"
    cDomain={rows.map((r) => r.id)}
    cRange={rows.map((r) => r.color)}
    bandPadding={0.3}
    padding={{ top: 8, right: 170, bottom: 28, left: 150 }}
    labels={{ value: barLabel, placement: 'outside' }}
    props={{
      // Surface-colored 2px gap between bars instead of the default black outline
      bars: { stroke: 'var(--color-surface)', strokeWidth: 2 },
      yAxis: { format: (id: string) => labelById.get(id) ?? id },
      xAxis: { format: (v: number) => formatCompact(v) },
    }}
    onBarClick={(_e: MouseEvent, detail: { data: CategoryBarRow }) => {
      const row = rowById.get(detail.data.id);
      if (row) onselect?.(row);
    }}
  >
    {#snippet tooltip({ context })}
      <Tooltip.Root {context}>
        {#snippet children({ data }: { data: CategoryBarRow })}
          <ChartTooltip
            title={data.label}
            rows={[
              {
                label: `${data.count} comprobantes`,
                color: data.color,
                amount: data.total,
                percent: data.percent,
              },
            ]}
          />
        {/snippet}
      </Tooltip.Root>
    {/snippet}
  </BarChart>
</div>

<style>
  .chart {
    width: 100%;
    cursor: pointer;
  }
</style>
