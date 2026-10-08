<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import StatsSection from '$lib/components/dashboard/StatsSection.svelte';

  // Fixed period: current year, no controls and nothing in the URL
  const year = String(new Date().getFullYear());
</script>

<svelte:head>
  <title>Dashboard - Procesador de Facturas</title>
</svelte:head>

<section class="hero">
  <p class="eyebrow">Panel principal</p>
  <h1>Dashboard</h1>
  <p class="lede">Resumen del año en curso ({year}) y pendientes por revisar.</p>
  <div class="hero-actions">
    <Button size="lg" onclick={() => goto('/comprobantes')}>Comprobantes</Button>
    <Button variant="ghost" size="lg" onclick={() => goto('/emisores')}>Emisores</Button>
  </div>
</section>

<StatsSection period={year} />

<style>
  :global(body) {
    background: var(--color-background);
    color: var(--color-text-primary);
  }

  .hero {
    margin-bottom: var(--spacing-6);
  }

  .hero h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: var(--font-size-3xl);
    color: var(--color-text-primary);
  }

  .lede {
    margin: 0 0 var(--spacing-4);
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

  .hero-actions {
    display: flex;
    gap: var(--spacing-3);
    flex-wrap: wrap;
  }
</style>
