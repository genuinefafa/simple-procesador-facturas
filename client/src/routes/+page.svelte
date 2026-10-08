<script lang="ts">
  import StatsSection from '$lib/components/dashboard/StatsSection.svelte';

  // Fixed period: current year, no controls and nothing in the URL
  const year = String(new Date().getFullYear());
</script>

<svelte:head>
  <title>Dashboard - Procesador de Facturas</title>
</svelte:head>

<StatsSection period={year} />

<style>
  :global(body) {
    background: var(--color-background);
    color: var(--color-text-primary);
  }
</style>
