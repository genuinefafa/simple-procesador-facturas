<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, Toaster } from 'svelte-sonner';
  import { PageHeader, StatsBar, Button } from '$lib/components';

  interface Invoice {
    id: number;
    emitterCuit: string;
    emitterName: string;
    emitterAlias: string | null;
    issueDate: string;
    invoiceType: string;
    fullInvoiceNumber: string;
    total: number | null;
    originalFile: string;
    extractionConfidence: number | null;
    requiresReview: boolean;
    manuallyValidated: boolean;
  }

  let invoices: Invoice[] = $state([]);
  let selectedInvoices = $state<Set<number>>(new Set());
  let loading = $state(false);

  onMount(async () => {
    await loadInvoices();
  });

  async function loadInvoices() {
    loading = true;
    try {
      const response = await fetch('/api/invoices');
      const data = await response.json();

      if (data.success) {
        invoices = data.invoices;
      }
    } catch (err) {
      toast.error('Error al cargar facturas');
    } finally {
      loading = false;
    }
  }

  function toggleSelection(id: number) {
    if (selectedInvoices.has(id)) {
      selectedInvoices.delete(id);
    } else {
      selectedInvoices.add(id);
    }
    selectedInvoices = selectedInvoices;
  }

  function selectAll() {
    selectedInvoices = new Set(invoices.map((inv) => inv.id));
  }

  function clearSelection() {
    selectedInvoices = new Set();
  }

  async function exportSelected() {
    if (selectedInvoices.size === 0) {
      toast.warning('Seleccioná al menos una factura para exportar');
      return;
    }

    const toastId = toast.loading('Exportando facturas...');

    try {
      const response = await fetch('/api/invoices/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceIds: Array.from(selectedInvoices) }),
      });
      const data = await response.json();

      if (data.success) {
        toast.success(`Exportadas ${data.stats.successful}/${data.stats.total} facturas`, {
          id: toastId,
        });
        clearSelection();
      } else {
        toast.error(data.error || 'Error al exportar', { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al exportar', { id: toastId });
    }
  }

  function getConfidenceColor(confidence: number | null): string {
    if (!confidence) return 'text-gray-400';
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  }
</script>

<svelte:head>
  <title>Facturas - Procesador de Facturas</title>
</svelte:head>

<Toaster position="top-right" richColors />

<div class="invoices-container">
  <PageHeader
    title="📋 Facturas Procesadas"
    subtitle="Todas las facturas que has procesado exitosamente"
  />

  <!-- STATS -->
  <StatsBar
    stats={[
      { value: invoices.length, label: 'Total' },
      {
        value: invoices.filter((inv) => (inv.extractionConfidence || 0) < 70).length,
        label: 'Baja confianza',
      },
      { value: selectedInvoices.size, label: 'Seleccionadas' },
    ]}
  />

  <!-- BULK ACTIONS -->
  {#if invoices.length > 0}
    <div class="bulk-actions">
      <button class="btn btn-secondary" onclick={selectAll}>✓ Seleccionar todas</button>
      <button class="btn btn-secondary" onclick={clearSelection}>✕ Limpiar selección</button>
      <button
        class="btn btn-primary"
        onclick={exportSelected}
        disabled={selectedInvoices.size === 0}
      >
        📦 Exportar ({selectedInvoices.size})
      </button>
    </div>
  {/if}

  <!-- CONTENT -->
  {#if loading}
    <div class="loading">
      <p>⏳ Cargando facturas...</p>
    </div>
  {:else if invoices.length === 0}
    <div class="empty">
      <p>📭 No hay facturas procesadas</p>
      <a href="/importar" class="btn btn-primary">📥 Importar archivos</a>
    </div>
  {:else}
    <div class="invoice-list">
      {#each invoices as invoice (invoice.id)}
        <div class="invoice-card" class:selected={selectedInvoices.has(invoice.id)}>
          <label class="checkbox-label">
            <input
              type="checkbox"
              checked={selectedInvoices.has(invoice.id)}
              onchange={() => toggleSelection(invoice.id)}
            />
          </label>

          <div class="invoice-header">
            <div>
              <h3>{invoice.fullInvoiceNumber}</h3>
              <p class="emitter">
                {invoice.emitterName}
                {#if invoice.emitterAlias}
                  <span class="alias">({invoice.emitterAlias})</span>
                {/if}
              </p>
              <p class="cuit">{invoice.emitterCuit}</p>
            </div>
            <div class={`confidence ${getConfidenceColor(invoice.extractionConfidence)}`}>
              {invoice.extractionConfidence?.toFixed(0) || '?'}%
            </div>
          </div>

          <div class="invoice-details">
            <div class="detail">
              <span class="label">Fecha:</span>
              <span class="value">{invoice.issueDate}</span>
            </div>
            <div class="detail">
              <span class="label">Total:</span>
              <span class="value">
                {invoice.total !== null
                  ? `$${invoice.total.toLocaleString('es-AR')}`
                  : '❌ No detectado'}
              </span>
            </div>
            <div class="detail">
              <span class="label">Archivo:</span>
              <span class="value file">{invoice.originalFile.split('/').pop()}</span>
            </div>
          </div>

          <div class="actions">
            <a href="/annotate/{invoice.id}" class="btn btn-secondary">📝 Anotar</a>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .invoices-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .page-header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 0;
    color: #666;
    font-size: 1rem;
  }

  /* STATS */
  .stats-bar {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .stat {
    background: white;
    padding: 1.5rem 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    min-width: 120px;
  }

  .stat-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    color: #2563eb;
  }

  .stat-label {
    display: block;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
  }

  /* BULK ACTIONS */
  .bulk-actions {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .bulk-actions .btn {
    flex: 0 0 auto;
  }

  /* LOADING/EMPTY */
  .loading,
  .empty {
    text-align: center;
    padding: 3rem;
    font-size: 1.2rem;
    background: white;
    border-radius: 12px;
  }

  .empty {
    color: #64748b;
  }

  /* INVOICE LIST */
  .invoice-list {
    display: grid;
    gap: 1.5rem;
  }

  .invoice-card {
    position: relative;
    background: white;
    border-radius: 12px;
    padding: 1.5rem 1.5rem 1.5rem 4rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.2s;
  }

  .invoice-card.selected {
    background: #eff6ff;
    border: 2px solid #2563eb;
  }

  .invoice-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .checkbox-label {
    position: absolute;
    left: 1.5rem;
    top: 1.5rem;
  }

  .checkbox-label input {
    width: 1.2rem;
    height: 1.2rem;
    cursor: pointer;
  }

  .invoice-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .invoice-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.3rem;
    color: #111;
  }

  .emitter {
    margin: 0.3rem 0;
    font-weight: 500;
    color: #374151;
  }

  .alias {
    color: #6b7280;
    font-size: 0.9rem;
  }

  .cuit {
    margin: 0.3rem 0;
    font-size: 0.9rem;
    color: #6b7280;
    font-family: monospace;
  }

  .confidence {
    font-size: 2rem;
    font-weight: bold;
  }

  .text-green-600 {
    color: #16a34a;
  }
  .text-yellow-600 {
    color: #ca8a04;
  }
  .text-red-600 {
    color: #dc2626;
  }
  .text-gray-400 {
    color: #9ca3af;
  }

  .invoice-details {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .detail {
    display: flex;
    flex-direction: column;
  }

  .label {
    font-size: 0.85rem;
    color: #6b7280;
    margin-bottom: 0.25rem;
  }

  .value {
    font-size: 1rem;
    color: #111;
    font-weight: 500;
  }

  .file {
    font-family: monospace;
    font-size: 0.9rem;
  }

  .actions {
    display: flex;
    gap: 1rem;
  }

  /* BUTTONS */
  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
    display: inline-block;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
</style>
