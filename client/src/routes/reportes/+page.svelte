<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import StatsSection from '$lib/components/dashboard/StatsSection.svelte';
  import { resolvePeriodKey } from '$lib/utils/dashboard';

  // URL is the source of truth for the period
  const period = $derived(resolvePeriodKey(page.url.searchParams.get('period')));

  function changePeriod(key: string) {
    goto(`?period=${encodeURIComponent(key)}`, { keepFocus: true, noScroll: true });
  }
</script>

<svelte:head>
  <title>Reportes - Procesador de Facturas</title>
</svelte:head>

<header class="header">
  <p class="eyebrow">Análisis</p>
  <h1>Reportes</h1>
  <p class="lede">Totales por categoría, mes a mes y por letra para el período elegido.</p>
</header>

<StatsSection {period} full onperiodchange={changePeriod} />

<style>
  .header {
    margin-bottom: var(--spacing-6);
  }

  .header h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: var(--font-size-3xl);
    color: var(--color-text-primary);
  }

  .lede {
    margin: 0;
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-semibold);
  }
</style>
