<script lang="ts">
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import Input from '$lib/components/ui/Input.svelte';
  import type { PageData } from './$types';

  type SearchResult = {
    id: number;
    emitterCuit: string;
    invoiceType?: string | null;
    pointOfSale?: number | null;
    invoiceNumber?: number | null;
    fullInvoiceNumber?: string | null;
    total?: number | null;
    issueDate?: string | null;
    pendingFileId?: number | null;
    expectedInvoiceId?: number | null;
    originalFile?: string | null;
  };

  let { data } = $props();
  const stats = $derived(data.stats);

  let searchQuery = $state('');
  let searchResults = $state<SearchResult[]>([]);
  let searching = $state(false);
  let searchError = $state('');

  const intFormatter = new Intl.NumberFormat('es-AR');
  const currencyFormatter = new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
  });

  function formatInt(value: number | null | undefined) {
    return intFormatter.format(value ?? 0);
  }

  function formatCurrency(value: number | null | undefined) {
    if (value == null) return '—';
    return currencyFormatter.format(value);
  }

  function formatDate(value: string | null | undefined) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium' }).format(new Date(value));
  }

  function compactInvoice(result: SearchResult) {
    if (result.fullInvoiceNumber) return result.fullInvoiceNumber;
    const type = result.invoiceType ?? '—';
    const pos = result.pointOfSale != null ? String(result.pointOfSale).padStart(4, '0') : '----';
    const num =
      result.invoiceNumber != null ? String(result.invoiceNumber).padStart(8, '0') : '--------';
    return `${type}-${pos}-${num}`;
  }

  async function runSearch() {
    const q = searchQuery.trim();
    searchError = '';

    if (!q) {
      searchResults = [];
      return;
    }

    searching = true;
    try {
      const res = await fetch(`/api/invoices/search?q=${encodeURIComponent(q)}&limit=10`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'No se pudo buscar');
      searchResults = (json.items as SearchResult[]) ?? [];
    } catch (error) {
      searchError = error instanceof Error ? error.message : 'Error desconocido';
    } finally {
      searching = false;
    }
  }
</script>

<svelte:head>
  <title>Dashboard - Procesador de Facturas</title>
</svelte:head>

<section class="hero">
  <div class="hero-text">
    <p class="eyebrow">Panel principal</p>
    <h1>Dashboard</h1>
    <p class="lede">
      Estado general de importaciones, archivos pendientes y facturas vinculadas. Punto de partida
      para procesar archivos y revisar pendientes.
    </p>
    <div class="hero-actions">
      <Button size="lg" onclick={() => goto('/comprobantes')}>Comprobantes</Button>
      <Button variant="ghost" size="lg" onclick={() => goto('/emisores')}>Emisores</Button>
    </div>
  </div>
  <div class="hero-card">
    <p class="meta">Última actualización</p>
    <p class="meta-strong">Ahora mismo</p>
    <p class="hint">Los datos se cargan directo desde los endpoints existentes.</p>
  </div>
</section>

<section class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Facturas esperadas</div>
    <div class="stat-value">
      {formatInt(stats.expected.matched)} / {formatInt(stats.expected.total)}
    </div>
    <p class="stat-hint">Reconocidas / totales desde AFIP</p>
  </div>

  <div class="stat-card">
    <div class="stat-label">Archivos pendientes</div>
    <div class="stat-value">
      {formatInt(stats.pendingFiles.pending)} / {formatInt(stats.pendingFiles.total)}
    </div>
    <p class="stat-hint">En cola / total subidos</p>
  </div>

  <div class="stat-card">
    <div class="stat-label">Facturas vinculadas</div>
    <div class="stat-value">{formatInt(stats.linkedInvoices)}</div>
    <p class="stat-hint">Con expected o pending asociado</p>
  </div>
</section>

<section class="search-panel">
  <div class="panel-header">
    <div>
      <p class="eyebrow">Búsqueda rápida</p>
      <h2>Buscar facturas</h2>
      <p class="hint">Por CUIT, número de comprobante o nombre de archivo (LIKE simple).</p>
    </div>
    <div class="actions-inline">
      <Button variant="secondary" onclick={() => goto('/facturas')}>Ver todas</Button>
    </div>
  </div>

  <form
    class="search-form"
    onsubmit={() => {
      runSearch();
      return false;
    }}
  >
    <Input
      type="search"
      placeholder="Ej: 30-12345678-9, A-0001-00001234, contrato.pdf"
      bind:value={searchQuery}
    />
    <Button type="submit" size="md" disabled={searching}>
      {searching ? 'Buscando...' : 'Buscar'}
    </Button>
  </form>

  {#if searchError}
    <div class="alert error">{searchError}</div>
  {/if}

  {#if searchResults.length > 0}
    <ul class="result-list">
      {#each searchResults as item}
        <li class="result-card">
          <div class="result-main">
            <p class="result-title">{compactInvoice(item)}</p>
            <p class="result-meta">CUIT {item.emitterCuit}</p>
          </div>
          <div class="result-meta-group">
            <span>{formatDate(item.issueDate)}</span>
            <span>{formatCurrency(item.total ?? null)}</span>
          </div>
          <div class="result-tags">
            {#if item.expectedInvoiceId != null}
              <span class="tag">Expected #{item.expectedInvoiceId}</span>
            {/if}
            {#if item.pendingFileId != null}
              <span class="tag subtle">Pending #{item.pendingFileId}</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="hint muted">No hay resultados aún. Probá buscar por CUIT o número de comprobante.</p>
  {/if}
</section>

<style>
  :global(body) {
    background: var(--color-background);
    color: var(--color-text-primary);
  }

  .hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 320px;
    gap: var(--spacing-6);
    margin-bottom: var(--spacing-6);
  }

  .hero-text h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: var(--font-size-3xl);
    color: var(--color-text-primary);
  }

  .hero-text .lede {
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

  .hero-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .meta {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .meta-strong {
    margin: 0;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .hint {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .hint.muted {
    text-align: center;
    margin-top: var(--spacing-3);
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: var(--spacing-4);
    margin-bottom: var(--spacing-6);
  }

  .stat-card {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    box-shadow: var(--shadow-base);
  }

  .stat-label {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin-bottom: var(--spacing-2);
  }

  .stat-value {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    color: var(--color-primary-700);
    margin: 0 0 var(--spacing-1);
  }

  .stat-hint {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .search-panel {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-5);
    box-shadow: var(--shadow-md);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .panel-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--spacing-3);
  }

  .panel-header h2 {
    margin: 0.25rem 0 0.35rem;
    font-size: var(--font-size-xl);
    color: var(--color-text-primary);
  }

  .actions-inline {
    display: flex;
    gap: var(--spacing-2);
  }

  .search-form {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--spacing-3);
  }

  .alert.error {
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid #ef4444;
    color: #b91c1c;
    padding: var(--spacing-3);
    border-radius: var(--radius-base);
    font-size: var(--font-size-sm);
  }

  .result-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: var(--spacing-3);
  }

  .result-card {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    padding: var(--spacing-3);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: var(--spacing-2);
    background: var(--color-surface-alt);
  }

  .result-title {
    margin: 0;
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .result-meta {
    margin: 0.1rem 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .result-main {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .result-meta-group {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .result-tags {
    display: flex;
    gap: var(--spacing-2);
    flex-wrap: wrap;
    align-items: center;
  }

  .tag {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.65rem;
    border-radius: var(--radius-full);
    background: var(--color-primary-50);
    color: var(--color-primary-700);
    border: 1px solid var(--color-primary-200);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  }

  .tag.subtle {
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
    border-color: var(--color-neutral-200);
  }

  @media (max-width: 960px) {
    .hero {
      grid-template-columns: 1fr;
    }

    .panel-header {
      flex-direction: column;
      align-items: flex-start;
    }

    .search-form {
      grid-template-columns: 1fr;
    }
  }
</style>
