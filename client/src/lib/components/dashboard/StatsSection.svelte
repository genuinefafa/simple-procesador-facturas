<script lang="ts">
  /**
   * Totals section shared by the dashboard and the reports page. Loads the
   * summary for `period` and renders KPIs and charts.
   *
   * - `full` (reports): period selector, ARCA pending indicator under the KPIs
   *   and the letter donut.
   * - summary (dashboard): fixed period, actionable "Pendientes" block and a
   *   link to the reports page.
   *
   * The period is owned by the caller (the reports page keeps it in the URL).
   */
  import 'layerchart/core.css';
  import { goto } from '$app/navigation';
  import {
    assignCategoryColors,
    buildCategoryRows,
    buildLetterSlices,
    buildMonthlyData,
    categoryQuery,
    comprobantesUrl,
    letterQuery,
    monthCategoryQuery,
    monthsOfPeriod,
    pendingExpectedQuery,
    pendingFilesQuery,
    periodLabel,
  } from '$lib/utils/dashboard';
  import {
    statsService,
    type CategoryRef,
    type StatsSummaryResponse,
  } from '$lib/services/StatsService';
  import { ChartColumn } from '$lib/components/icons';
  import Button from '$lib/components/ui/Button.svelte';
  import PeriodSelector from './PeriodSelector.svelte';
  import PendingList from './PendingList.svelte';
  import StatsKpis from './StatsKpis.svelte';
  import CategoryBarChart from './CategoryBarChart.svelte';
  import MonthlyStackedChart from './MonthlyStackedChart.svelte';
  import LetterDonutChart from './LetterDonutChart.svelte';

  interface Props {
    period: string;
    /** Reports mode: selector + donut. Defaults to the dashboard summary. */
    full?: boolean;
    onperiodchange?: (key: string) => void;
  }

  let { period, full = false, onperiodchange }: Props = $props();

  let summary = $state<StatsSummaryResponse | null>(null);
  let categories = $state<CategoryRef[]>([]);
  let loading = $state(true);
  let error = $state('');
  let requestId = 0;

  $effect(() => {
    const key = period;
    const id = ++requestId;
    loading = true;
    error = '';
    statsService.getSummary(key).then((result) => {
      if (id !== requestId) return; // a newer period superseded this request
      if (result.success && result.data) {
        summary = result.data;
      } else {
        summary = null;
        error = result.error ?? 'No se pudieron cargar los totales del período.';
      }
      loading = false;
    });
  });

  $effect(() => {
    statsService.getCategories().then((result) => {
      if (result.success && result.data) categories = result.data;
    });
  });

  // Colors follow the category entity (ascending id), never the ranking
  const colors = $derived(
    assignCategoryColors([
      ...categories.map((c) => c.id),
      ...(summary?.byCategory.flatMap((c) => (c.categoryId === null ? [] : [c.categoryId])) ?? []),
    ])
  );

  const categoryRows = $derived(
    summary ? buildCategoryRows(summary.byCategory, summary.totals.total, colors) : []
  );
  const monthly = $derived(
    summary
      ? buildMonthlyData(summary.byMonth, categoryRows, monthsOfPeriod(summary.period.key))
      : null
  );
  const letterSlices = $derived(summary ? buildLetterSlices(summary.byLetter) : []);
  const isEmpty = $derived(!!summary && summary.totals.count === 0);

  function open(q: string) {
    goto(comprobantesUrl(q));
  }
</script>

<section class="stats" aria-labelledby="stats-title">
  <div class="stats-header">
    <div>
      <p class="eyebrow">Totales</p>
      <h2 id="stats-title">Resumen de {periodLabel(period)}</h2>
    </div>
    {#if full}
      <PeriodSelector {period} onchange={(key) => onperiodchange?.(key)} />
    {:else}
      <Button
        variant="secondary"
        onclick={() => goto(`/reportes?period=${encodeURIComponent(period)}`)}
      >
        <ChartColumn size={16} /> Ver reportes
      </Button>
    {/if}
  </div>

  {#if error}
    <div class="alert error" role="alert">{error}</div>
  {:else if !summary}
    <p class="state">Cargando totales...</p>
  {:else}
    <div class="content" class:loading>
      <StatsKpis
        {summary}
        showPending={full}
        onpendingclick={() => open(pendingExpectedQuery(period))}
      />

      {#if !full}
        <div class="panel">
          <h3>Pendientes</h3>
          <PendingList
            pending={summary.pendingExpected}
            onexpectedclick={() => open(pendingExpectedQuery(period))}
            onfilesclick={() => open(pendingFilesQuery())}
          />
        </div>
      {/if}

      {#if isEmpty}
        <p class="state">No hay facturas cargadas en {periodLabel(period)}.</p>
      {:else}
        <div class="panel">
          <h3>Totales por categoría</h3>
          <CategoryBarChart
            rows={categoryRows}
            onselect={(row) => open(categoryQuery(row.categoryKey, period))}
          />
        </div>

        {#if monthly}
          <div class="panel">
            <h3>Mes a mes por categoría</h3>
            <MonthlyStackedChart
              data={monthly}
              onselect={(month, series) => {
                // The folded "Otras" series has no query that represents it
                if (series.categoryKey !== undefined) {
                  open(monthCategoryQuery(series.categoryKey, month));
                }
              }}
            />
          </div>
        {/if}

        {#if full}
          <div class="panel">
            <h3>Facturas por letra</h3>
            <LetterDonutChart
              slices={letterSlices}
              onselect={(slice) => open(letterQuery(slice.letter, period))}
            />
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .stats {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
    /* Variables LayerChart reads for axes, grid and tooltips */
    --color-surface-content: var(--color-text-primary);
    --color-surface-100: var(--color-surface);
    --color-surface-300: var(--color-neutral-200);
    --color-primary: var(--color-primary-600);
  }

  .stats-header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    justify-content: space-between;
    gap: var(--spacing-4);
  }

  .stats-header h2 {
    margin: var(--spacing-1) 0 0;
    font-size: var(--font-size-xl);
    color: var(--color-text-primary);
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-semibold);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    transition: opacity var(--transition-fast);
  }

  .content.loading {
    opacity: 0.5;
  }

  .panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    min-width: 0;
  }

  .panel h3 {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .state {
    margin: 0;
    padding: var(--spacing-6);
    text-align: center;
    color: var(--color-text-tertiary);
    background: var(--color-surface);
    border: 1px dashed var(--color-border);
    border-radius: var(--radius-lg);
  }

  .alert.error {
    background: var(--color-surface);
    border: 1px solid var(--color-error);
    color: var(--color-error);
    padding: var(--spacing-3);
    border-radius: var(--radius-base);
    font-size: var(--font-size-sm);
  }
</style>
