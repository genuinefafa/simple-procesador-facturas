<script lang="ts">
  import {
    formatCuit,
    formatDateISO,
    formatNumber,
    formatDateShort,
    getFullDateForTooltip,
  } from '$lib/formatters';
  import FilePreview from './FilePreview.svelte';
  import { X, FileSpreadsheet, FileText } from '$lib/components/icons';

  interface KnownInvoice {
    id?: number;
    source: 'expected' | 'known' | 'final';
    cuit?: string;
    cuit_guess?: string;
    issueDate?: string;
    invoiceType?: string;
    pointOfSale?: number;
    invoiceNumber?: number;
    total?: number | null;
    file?: string;
    year?: string;
    categoryId?: number | null;
    expectedInvoiceId?: number | null;
    fileId?: number | null;
  }

  interface Category {
    id: number;
    key: string;
    description?: string;
    name?: string;
  }

  let { invoices = [], categories = [], selectedItem, onSelect, onCategoryChange } = $props();

  let selectedKnown: KnownInvoice | null = $derived(selectedItem);
  let selectedKnownCategoryId: number | null = $state(null);
  let knownCategories = $derived(categories);
  let categoryLabelById = $derived(
    new Map(knownCategories.map((c) => [c.id, c.description || c.name || c.key || '']))
  );

  // Origin icons are rendered as Lucide components in the template
  const getOriginFlags = (item: KnownInvoice) => {
    const hasExcel = item.source === 'expected' || !!item.expectedInvoiceId;
    const hasProcessed = item.source === 'final' || !!item.fileId;
    return { hasExcel, hasProcessed };
  };

  const getOriginTitle = (item: KnownInvoice) => {
    const hasExcel = item.source === 'expected' || !!item.expectedInvoiceId;
    const hasProcessed = item.source === 'final' || !!item.fileId;
    if (hasExcel && hasProcessed) return 'Excel AFIP y PDF procesado';
    if (hasExcel) return 'Excel AFIP';
    return 'PDF procesado';
  };

  function selectKnown(item: KnownInvoice) {
    selectedKnownCategoryId = item.categoryId ?? null;
    onSelect?.(item);
  }

  async function saveKnownCategory() {
    if (
      !selectedKnown ||
      selectedKnown.source !== 'expected' ||
      !selectedKnown.id ||
      !selectedKnownCategoryId
    )
      return;

    await onCategoryChange?.({
      invoiceId: selectedKnown.id,
      categoryId: selectedKnownCategoryId,
    });
  }
</script>

<section class="known-invoices">
  <div class="section-header">
    <h2>🧮 Revisión de facturas conocidas</h2>
    <p class="help-text">
      Cruce entre facturas esperadas (Excel AFIP) y PDFs procesados. Hacé click en una fila para ver
      detalles.
    </p>
  </div>

  <div class="known-table-container">
    <table class="known-table">
      <thead>
        <tr>
          <th style="width: 10%">Origen</th>
          <th style="width: 12%">CUIT</th>
          <th style="width: 10%">Fecha</th>
          <th style="width: 8%">Tipo</th>
          <th style="width: 6%; text-align: right">PV</th>
          <th style="width: 8%; text-align: right">Número</th>
          <th style="width: 12%; text-align: right">Total</th>
          <th style="width: 16%">Categoría</th>
          <th style="width: 18%">Archivo</th>
        </tr>
      </thead>
      <tbody>
        {#if invoices.length === 0}
          <tr><td colspan="8" class="empty-row">No hay registros</td></tr>
        {:else}
          {#each invoices as item, idx}
            {@const flags = getOriginFlags(item)}
            <tr
              class="invoice-row"
              class:selected={selectedKnown &&
                selectedKnown.id === item.id &&
                selectedKnown.source === item.source}
              onclick={() => selectKnown(item)}
              role="button"
              tabindex={idx}
            >
              <td class="text-center origin-icons" title={getOriginTitle(item)}>
                {#if flags.hasExcel}<FileSpreadsheet size={16} />{/if}
                {#if flags.hasProcessed}<FileText size={16} />{/if}
              </td>
              <td class="nowrap">{formatCuit(item.cuit, item.cuit_guess)}</td>
              <td title={getFullDateForTooltip(item.issueDate)}
                >{formatDateShort(item.issueDate)}</td
              >
              <td>{item.invoiceType ?? '—'}</td>
              <td class="text-right">{item.pointOfSale ?? '—'}</td>
              <td class="text-right">{item.invoiceNumber ?? '—'}</td>
              <td class="text-right">{formatNumber(item.total)}</td>
              <td>{categoryLabelById.get(item.categoryId ?? -1) || '—'}</td>
              <td class="file-col truncate">{item.file ? item.file.split('/').pop() : '—'}</td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </div>
</section>

<!-- Sidebar overlay -->
{#if selectedKnown}
  <div class="sidebar-overlay" onclick={() => onSelect?.(null)} role="presentation"></div>
  <aside class="sidebar-panel">
    <div class="sidebar-header">
      <h3>Detalle del {selectedKnown.source === 'expected' ? 'AFIP' : 'PDF'}</h3>
      <button class="close-btn" onclick={() => onSelect?.(null)} aria-label="Cerrar">
        <X size={20} />
      </button>
    </div>

    <div class="sidebar-content">
      {#if selectedKnown.file}
        <div class="preview-section">
          <h4>Vista previa</h4>
          <FilePreview
            src="/api/files/{encodeURI(selectedKnown.file)}"
            filename={selectedKnown.file}
            showZoom={true}
            maxHeight="600px"
          />
        </div>
      {/if}

      <div class="detail-section">
        <h4>Información</h4>
        <div class="detail-row">
          <span class="detail-label">Origen:</span>
          <span class="detail-value">{getOriginTitle(selectedKnown)}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">CUIT:</span>
          <span class="detail-value"
            >{formatCuit(selectedKnown.cuit, selectedKnown.cuit_guess)}</span
          >
        </div>
        <div class="detail-row">
          <span class="detail-label">Fecha:</span>
          <span class="detail-value">{formatDateISO(selectedKnown.issueDate)}</span>
        </div>
        {#if selectedKnown.categoryId}
          <div class="detail-row">
            <span class="detail-label">Categoría:</span>
            <span class="detail-value"
              >{categoryLabelById.get(selectedKnown.categoryId) || '—'}</span
            >
          </div>
        {/if}
        <div class="detail-row">
          <span class="detail-label">Comprobante:</span>
          <span class="detail-value monospace">
            {selectedKnown.invoiceType ?? '—'}-{String(selectedKnown.pointOfSale ?? 0).padStart(
              4,
              '0'
            )}-{String(selectedKnown.invoiceNumber ?? 0).padStart(8, '0')}
          </span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Total:</span>
          <span class="detail-value">{formatNumber(selectedKnown.total)}</span>
        </div>
        {#if selectedKnown.file}
          <div class="detail-row">
            <span class="detail-label">Archivo:</span>
            <span class="detail-value filename">{selectedKnown.file.split('/').pop()}</span>
          </div>
        {/if}
      </div>

      {#if selectedKnown.source === 'expected'}
        <div class="detail-section">
          <h4>Categoría</h4>
          <div class="category-form">
            <select
              id="known-category"
              bind:value={selectedKnownCategoryId}
              class="category-select"
            >
              <option value={null}>Sin categoría</option>
              {#each knownCategories as cat}
                <option value={cat.id}>{cat.description}</option>
              {/each}
            </select>
            <button
              class="btn btn-primary"
              onclick={saveKnownCategory}
              disabled={!selectedKnownCategoryId}
            >
              Asignar categoría
            </button>
          </div>
        </div>
      {/if}
    </div>
  </aside>
{/if}

<style>
  .known-invoices {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  }

  .section-header {
    margin-bottom: 1.5rem;
  }

  .section-header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
    color: #1e293b;
  }

  .help-text {
    margin: 0;
    color: #64748b;
    font-size: 0.95rem;
  }

  .known-table-container {
    overflow-x: auto;
  }

  .known-table {
    width: 100%;
    border-collapse: collapse;
    min-width: 760px;
  }

  .known-table th,
  .known-table td {
    padding: 0.65rem 0.75rem;
    border-bottom: 1px solid #e5e7eb;
    text-align: left;
  }

  .known-table th {
    background: #f8fafc;
    font-weight: 600;
    font-size: 0.95rem;
    color: #1e293b;
  }

  .known-table tbody tr {
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .known-table tbody tr:hover {
    background: #f8fafc;
  }

  .known-table tbody tr.invoice-row.selected {
    background: #e0ecff;
    border-left: 3px solid #2563eb;
  }

  .monospace {
    font-family: monospace;
    font-size: 0.9rem;
  }

  .nowrap {
    white-space: nowrap;
  }

  .text-center {
    text-align: center;
  }

  .origin-icons {
    display: flex;
    gap: 2px;
    justify-content: center;
    color: var(--color-text-secondary, #64748b);
  }

  .text-right {
    text-align: right;
  }

  /* Increase specificity so it overrides .known-table td { text-align: left } */
  .known-table td.text-right {
    text-align: right;
  }
  .known-table td.text-center {
    text-align: center;
  }

  .file-col {
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .truncate {
    word-wrap: break-word;
    overflow-wrap: break-word;
  }

  .empty-row {
    text-align: center;
    color: #6b7280;
    padding: 1rem;
  }

  /* SIDEBAR */
  .sidebar-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 40;
  }

  .sidebar-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: 800px;
    max-width: 90vw;
    background: white;
    box-shadow: -4px 0 12px rgba(0, 0, 0, 0.15);
    z-index: 50;
    display: flex;
    flex-direction: column;
    animation: slideIn 0.3s ease-out;
  }

  @keyframes slideIn {
    from {
      transform: translateX(100%);
    }
    to {
      transform: translateX(0);
    }
  }

  .sidebar-header {
    padding: 1.5rem;
    border-bottom: 2px solid #e5e7eb;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .sidebar-header h3 {
    margin: 0;
    font-size: 1.2rem;
    color: #1e293b;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: #64748b;
    padding: 0;
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.2s;
  }

  .close-btn:hover {
    color: #1e293b;
  }

  .sidebar-content {
    overflow-y: auto;
    flex: 1;
    padding: 1.5rem;
  }

  .detail-section {
    margin-bottom: 2rem;
  }

  .detail-section h4 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #374151;
    font-weight: 600;
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid #f1f5f9;
  }

  .detail-row:last-child {
    border-bottom: none;
  }

  .detail-label {
    font-weight: 500;
    color: #6b7280;
    min-width: 100px;
  }

  .detail-value {
    color: #1e293b;
    text-align: right;
    flex: 1;
    word-break: break-word;
  }

  .filename {
    font-family: monospace;
    font-size: 0.9rem;
  }

  /* Preview styles (reused from review section) */
  .preview-section {
    margin-bottom: 1.5rem;
  }

  .preview-section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 1rem;
    color: #374151;
  }

  .category-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .category-select {
    padding: 0.75rem;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    font-size: 0.95rem;
    background: white;
    cursor: pointer;
  }

  .category-select:focus {
    outline: none;
    border-color: #2563eb;
    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
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

  @media (max-width: 768px) {
    .sidebar-panel {
      width: 100%;
    }
  }
</style>
