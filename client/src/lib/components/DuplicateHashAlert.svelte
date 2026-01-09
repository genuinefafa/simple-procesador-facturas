<script lang="ts">
  import { goto } from '$app/navigation';
  import { formatDateShort, getInvoiceTypeFromARCA } from '$lib/formatters';

  interface Props {
    fileHash?: string | null;
    currentId: number;
    currentType: 'pending' | 'invoice';
    linkedPendingId?: number | null; // Si es factura, el pending_file_id asociado
    linkedInvoiceId?: number | null; // Si es pending, el invoice_id asociado (si existe)
  }

  let { fileHash, currentId, currentType, linkedPendingId, linkedInvoiceId }: Props = $props();

  interface DuplicateResult {
    found: boolean;
    results: {
      pendingFiles: Array<{
        id: number;
        filename: string;
        status: string;
        uploadDate: string;
        extractedCuit?: string;
        extractedDate?: string;
        extractedType?: number;
      }>;
      invoices: Array<{
        id: number;
        emitterCuit: string;
        issueDate: string;
        invoiceType: number;
        fullInvoiceNumber: string;
        total?: number;
      }>;
    };
    totalFound: number;
  }

  let duplicates = $state<DuplicateResult | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  $effect(() => {
    if (!fileHash || fileHash.length < 16) {
      duplicates = null;
      return;
    }

    loading = true;
    error = null;

    fetch(`/api/files/hash/${encodeURIComponent(fileHash)}`)
      .then((res) => res.json())
      .then((data: DuplicateResult) => {
        // Filtrar el archivo actual Y las relaciones existentes de los resultados
        if (data.found && data.results) {
          const filteredPending = data.results.pendingFiles.filter((p) => {
            // No mostrar el propio pending
            if (currentType === 'pending' && p.id === currentId) return false;

            // Si es factura actual y este pending está vinculado a ella, no mostrar
            if (currentType === 'invoice' && linkedPendingId && p.id === linkedPendingId)
              return false;

            return true;
          });

          const filteredInvoices = data.results.invoices.filter((i) => {
            // No mostrar la propia factura
            if (currentType === 'invoice' && i.id === currentId) return false;

            // Si es pending actual y está vinculado a esta factura, no mostrar
            if (currentType === 'pending' && linkedInvoiceId && i.id === linkedInvoiceId)
              return false;

            return true;
          });

          duplicates = {
            ...data,
            results: {
              pendingFiles: filteredPending,
              invoices: filteredInvoices,
            },
            totalFound: filteredPending.length + filteredInvoices.length,
          };
        } else {
          duplicates = null;
        }
      })
      .catch((err) => {
        console.error('[DuplicateHashAlert] Error:', err);
        error = 'Error al buscar duplicados';
        duplicates = null;
      })
      .finally(() => {
        loading = false;
      });
  });

  const hasDuplicates = $derived(
    duplicates &&
      duplicates.totalFound > 0 &&
      (duplicates.results.pendingFiles.length > 0 || duplicates.results.invoices.length > 0)
  );

  function handleClick(type: 'pending' | 'invoice', id: number) {
    const comprobanteId = type === 'pending' ? `pending:${id}` : `factura:${id}`;
    goto(`/comprobantes/${comprobanteId}`);
  }
</script>

{#if loading}
  <div class="duplicate-alert loading">
    <div class="alert-header">
      <span class="icon">🔍</span>
      <span class="title">Buscando duplicados...</span>
    </div>
  </div>
{:else if error}
  <div class="duplicate-alert error">
    <div class="alert-header">
      <span class="icon">⚠️</span>
      <span class="title">{error}</span>
    </div>
  </div>
{:else if hasDuplicates}
  <div class="duplicate-alert warning">
    <div class="alert-header">
      <span class="icon">⚠️</span>
      <span class="title">Archivos duplicados detectados ({duplicates?.totalFound || 0})</span>
    </div>
    <p class="alert-description">
      Este archivo comparte el mismo hash SHA-256 con otros archivos en el sistema:
    </p>

    {#if duplicates?.results.pendingFiles && duplicates.results.pendingFiles.length > 0}
      <div class="duplicates-section">
        <h4>Archivos pendientes:</h4>
        <ul class="duplicates-list">
          {#each duplicates.results.pendingFiles as pending}
            <li class="duplicate-item">
              <button class="duplicate-link" onclick={() => handleClick('pending', pending.id)}>
                <span class="duplicate-label">pending:{pending.id}</span>
                <span class="duplicate-info">{pending.filename}</span>
                {#if pending.extractedCuit}
                  <span class="duplicate-meta">{pending.extractedCuit}</span>
                {/if}
                {#if pending.extractedDate}
                  <span class="duplicate-meta">{formatDateShort(pending.extractedDate)}</span>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if duplicates?.results.invoices && duplicates.results.invoices.length > 0}
      <div class="duplicates-section">
        <h4>Facturas procesadas:</h4>
        <ul class="duplicates-list">
          {#each duplicates.results.invoices as invoice}
            <li class="duplicate-item">
              <button class="duplicate-link" onclick={() => handleClick('invoice', invoice.id)}>
                <span class="duplicate-label">factura:{invoice.id}</span>
                <span class="duplicate-info">
                  {#if invoice.invoiceType}
                    {getInvoiceTypeFromARCA(invoice.invoiceType).friendlyType}
                  {/if}
                  {invoice.fullInvoiceNumber}
                </span>
                <span class="duplicate-meta">{invoice.emitterCuit}</span>
                <span class="duplicate-meta">{formatDateShort(invoice.issueDate)}</span>
                {#if invoice.total}
                  <span class="duplicate-meta"
                    >{invoice.total.toLocaleString('es-AR', {
                      style: 'currency',
                      currency: 'ARS',
                    })}</span
                  >
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
{/if}

<style>
  .duplicate-alert {
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    border: 1px solid;
    margin-bottom: var(--spacing-3);
  }

  .duplicate-alert.loading {
    background: var(--color-neutral-50);
    border-color: var(--color-neutral-200);
    color: var(--color-neutral-700);
  }

  .duplicate-alert.error {
    background: var(--color-danger-50);
    border-color: var(--color-danger-200);
    color: var(--color-danger-800);
  }

  .duplicate-alert.warning {
    background: var(--color-warning-50);
    border-color: var(--color-warning-300);
    color: var(--color-warning-900);
  }

  .alert-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-2);
  }

  .alert-header .icon {
    font-size: 1.25rem;
  }

  .alert-header .title {
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-sm);
  }

  .alert-description {
    margin: 0 0 var(--spacing-3) 0;
    font-size: var(--font-size-sm);
    color: var(--color-warning-800);
  }

  .duplicates-section {
    margin-top: var(--spacing-3);
  }

  .duplicates-section h4 {
    margin: 0 0 var(--spacing-2) 0;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-warning-800);
  }

  .duplicates-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .duplicate-item {
    margin: 0;
  }

  .duplicate-link {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    width: 100%;
    padding: var(--spacing-2);
    background: white;
    border: 1px solid var(--color-warning-200);
    border-radius: var(--radius-sm);
    cursor: pointer;
    text-align: left;
    transition: all 0.2s;
    font-size: var(--font-size-sm);
  }

  .duplicate-link:hover {
    background: var(--color-warning-100);
    border-color: var(--color-warning-400);
    transform: translateX(2px);
  }

  .duplicate-label {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: var(--font-size-xs);
    color: var(--color-primary-700);
    font-weight: var(--font-weight-semibold);
    flex-shrink: 0;
  }

  .duplicate-info {
    font-weight: var(--font-weight-medium);
    color: var(--color-text-primary);
    flex-shrink: 0;
  }

  .duplicate-meta {
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }
</style>
