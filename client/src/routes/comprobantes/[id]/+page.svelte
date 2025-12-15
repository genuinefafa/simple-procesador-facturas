<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';

  let { data } = $props();
  let { comprobante } = data;

  // State para emisores (autocomplete)
  let emisorQuery = $state('');
  let emisorResults = $state<Array<{ id: number; name: string; cuit: string }>>([]);
  let showEmisores = $state(false);
  let selectedEmitterId = $state<number | null>(null);

  let facuraData = $state({
    cuit: comprobante.final?.cuit || comprobante.expected?.cuit || comprobante.pending?.extractedCuit || '',
    invoiceType: comprobante.final?.invoiceType || comprobante.expected?.invoiceType || '',
    pointOfSale: comprobante.final?.pointOfSale || comprobante.expected?.pointOfSale || null,
    invoiceNumber: comprobante.final?.invoiceNumber || comprobante.expected?.invoiceNumber || null,
    issueDate: comprobante.final?.issueDate || comprobante.expected?.issueDate || comprobante.pending?.extractedDate || '',
    total: comprobante.final?.total || comprobante.expected?.total || comprobante.pending?.extractedTotal || null,
  });

  // Buscar emisores
  async function searchEmisores(query: string) {
    if (!query || query.length < 3) {
      emisorResults = [];
      return;
    }
    try {
      const res = await fetch(`/api/emisores?q=${encodeURIComponent(query)}`);
      const json = await res.json();
      emisorResults = json.emitters || [];
      showEmisores = true;
    } catch (e) {
      console.error('Error buscando emisores:', e);
    }
  }

  function selectEmisor(emisor: { id: number; name: string; cuit: string }) {
    selectedEmitterId = emisor.id;
    facuraData.cuit = emisor.cuit;
    emisorQuery = emisor.name;
    showEmisores = false;
  }

  function copyFromSection(source: 'final' | 'expected' | 'pending') {
    const sourceData = source === 'final' ? comprobante.final : source === 'expected' ? comprobante.expected : comprobante.pending;
    if (!sourceData) return;

    if (source === 'final') {
      const f = sourceData as any;
      facuraData.cuit = f.cuit || facuraData.cuit;
      facuraData.invoiceType = f.invoiceType || facuraData.invoiceType;
      facuraData.pointOfSale = f.pointOfSale || facuraData.pointOfSale;
      facuraData.invoiceNumber = f.invoiceNumber || facuraData.invoiceNumber;
      facuraData.issueDate = f.issueDate || facuraData.issueDate;
      facuraData.total = f.total || facuraData.total;
    } else if (source === 'expected') {
      const e = sourceData as any;
      facuraData.cuit = e.cuit || facuraData.cuit;
      facuraData.invoiceType = e.invoiceType || facuraData.invoiceType;
      facuraData.pointOfSale = e.pointOfSale || facuraData.pointOfSale;
      facuraData.invoiceNumber = e.invoiceNumber || facuraData.invoiceNumber;
      facuraData.issueDate = e.issueDate || facuraData.issueDate;
      facuraData.total = e.total || facuraData.total;
    } else {
      const p = sourceData as any;
      facuraData.cuit = p.extractedCuit || facuraData.cuit;
      facuraData.issueDate = p.extractedDate || facuraData.issueDate;
      facuraData.total = p.extractedTotal || facuraData.total;
    }
  }

  function validateFactura(): string[] {
    const errors: string[] = [];
    if (!facuraData.cuit?.trim()) errors.push('CUIT es requerido');
    if (!facuraData.invoiceType?.trim()) errors.push('Tipo de comprobante es requerido');
    if (!facuraData.pointOfSale) errors.push('Punto de venta es requerido');
    if (!facuraData.invoiceNumber) errors.push('Número de factura es requerido');
    if (!facuraData.issueDate) errors.push('Fecha es requerida');
    return errors;
  }

  async function saveFactura() {
    const errors = validateFactura();
    if (errors.length > 0) {
      alert('Errores de validación:\n' + errors.join('\n'));
      return;
    }

    // TODO: PATCH /api/invoices/:id con facuraData
    // TODO: Si selectedEmitterId, también PATCH /api/invoices/:id/emisor
    // TODO: log audit event
    console.log('Guardar factura:', facuraData, { emitterId: selectedEmitterId });
  }

  async function reprocess() {
    if (comprobante.pending) {
      // TODO: POST /api/pending-files/:id/reprocess
      // TODO: log audit event
      console.log('Reprocesar pendiente:', comprobante.pending.id);
    }
  }

  // Obtener ruta del archivo para preview
  function getFileUrl(): string | null {
    if (comprobante.pending?.filePath) return `/data${comprobante.pending.filePath}`;
    if (comprobante.final?.file) return `/data${comprobante.final.file}`;
    if (comprobante.expected?.file) return `/data${comprobante.expected.file}`;
    return null;
  }

  const fileUrl = getFileUrl();
</script>

<svelte:head>
  <title>Detalle Comprobante</title>
</svelte:head>

<div class="container">
  <header class="header">
    <a href="/comprobantes">← Volver</a>
    <h1>Detalle Comprobante</h1>
  </header>

  <div class="layout">
    <!-- Columna izquierda: Preview -->
    <aside class="preview-panel">
      {#if fileUrl}
        {#if fileUrl.endsWith('.pdf')}
          <iframe src={fileUrl} title="Preview PDF" class="pdf-preview"></iframe>
        {:else}
          <img src={fileUrl} alt="Preview" class="img-preview" />
        {/if}
      {:else}
        <div class="no-preview">
          <p>📄</p>
          <p>Sin archivo asociado</p>
        </div>
      {/if}
    </aside>

    <!-- Columna derecha: Secciones de datos -->
    <div class="sections">
      <!-- Sección Expected (SIEMPRE visible) -->
      <section class="section expected-section">
        <div class="section-header">
          <h3>Del Fisco (Expected)</h3>
          {#if comprobante.expected}
            <Button size="sm" variant="secondary" onclick={() => copyFromSection('expected')}>
              Copiar a Factura
            </Button>
          {/if}
        </div>
        {#if comprobante.expected}
          <div class="data-list">
            <div class="data-item">
              <span class="label">CUIT:</span>
              <span class="value">{comprobante.expected.cuit}</span>
            </div>
            <div class="data-item">
              <span class="label">Tipo:</span>
              <span class="value">{comprobante.expected.invoiceType}</span>
            </div>
            <div class="data-item">
              <span class="label">Punto de Venta:</span>
              <span class="value">{comprobante.expected.pointOfSale}</span>
            </div>
            <div class="data-item">
              <span class="label">Número:</span>
              <span class="value">{comprobante.expected.invoiceNumber}</span>
            </div>
            <div class="data-item">
              <span class="label">Fecha:</span>
              <span class="value">{comprobante.expected.issueDate}</span>
            </div>
            <div class="data-item">
              <span class="label">Total:</span>
              <span class="value">{comprobante.expected.total}</span>
            </div>
            <div class="data-item">
              <span class="label">Estado:</span>
              <span class="value">{comprobante.expected.status}</span>
            </div>
          </div>
        {:else}
          <p class="empty-state">No hay factura esperada asociada desde AFIP</p>
        {/if}
      </section>

      <!-- Sección Pending (SIEMPRE visible) -->
      <section class="section pending-section">
        <div class="section-header">
          <h3>Documento Subido (OCR Extraído)</h3>
          <div class="header-actions">
            {#if comprobante.pending}
              <Button size="sm" variant="secondary" onclick={() => copyFromSection('pending')}>
                Copiar a Factura
              </Button>
              <Button size="sm" variant="ghost" onclick={reprocess}>
                Reprocesar
              </Button>
            {/if}
          </div>
        </div>
        {#if comprobante.pending}
          <div class="data-list">
            <div class="data-item">
              <span class="label">Archivo:</span>
              <span class="value">{comprobante.pending.originalFilename}</span>
            </div>
            <div class="data-item">
              <span class="label">CUIT (detectado):</span>
              <span class="value">{comprobante.pending.extractedCuit || '—'}</span>
            </div>
            <div class="data-item">
              <span class="label">Fecha (detectada):</span>
              <span class="value">{comprobante.pending.extractedDate || '—'}</span>
            </div>
            <div class="data-item">
              <span class="label">Total (detectado):</span>
              <span class="value">{comprobante.pending.extractedTotal || '—'}</span>
            </div>
            <div class="data-item">
              <span class="label">Estado:</span>
              <span class="value">{comprobante.pending.status}</span>
            </div>
          </div>
        {:else}
          <p class="empty-state">No hay archivo pendiente asociado (no se subió digitalmente)</p>
        {/if}
      </section>

      <!-- Sección Factura (SIEMPRE visible - formulario editable) -->
      <section class="section factura-section">
        <h2>Factura Final (Verificada)</h2>

        <!-- Autocomplete Emisor -->
        <div class="form-group">
          <label for="emisor-search">Emisor</label>
          <input
            id="emisor-search"
            type="text"
            placeholder="Buscar por nombre o CUIT..."
            bind:value={emisorQuery}
            oninput={() => searchEmisores(emisorQuery)}
            onfocus={() => (showEmisores = emisorResults.length > 0)}
          />
          {#if showEmisores && emisorResults.length > 0}
            <ul class="autocomplete-results">
              {#each emisorResults as emisor}
                <li>
                  <button type="button" onclick={() => selectEmisor(emisor)}>
                    <strong>{emisor.name}</strong>
                    <span class="cuit-hint">{emisor.cuit}</span>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        <div class="form-group">
          <label for="cuit">CUIT *</label>
          <input id="cuit" type="text" bind:value={facuraData.cuit} required />
        </div>
        <div class="form-group">
          <label for="tipo">Tipo *</label>
          <input id="tipo" type="text" bind:value={facuraData.invoiceType} required />
        </div>
        <div class="form-group">
          <label for="pv">Punto de Venta *</label>
          <input id="pv" type="number" bind:value={facuraData.pointOfSale} required />
        </div>
        <div class="form-group">
          <label for="num">Número *</label>
          <input id="num" type="number" bind:value={facuraData.invoiceNumber} required />
        </div>
        <div class="form-group">
          <label for="fecha">Fecha *</label>
          <input id="fecha" type="date" bind:value={facuraData.issueDate} required />
        </div>
        <div class="form-group">
          <label for="total">Total</label>
          <input id="total" type="number" step="0.01" bind:value={facuraData.total} />
        </div>
        <div class="actions">
          <Button onclick={saveFactura}>Guardar Factura</Button>
        </div>
      </section>
    </div>
  </div>
</div>

<style>
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--spacing-4);
  }
  .header {
    margin-bottom: var(--spacing-4);
  }
  .header a {
    color: var(--color-primary-700);
    text-decoration: none;
  }
  .header h1 {
    margin: 0.5rem 0;
  }

  .layout {
    display: grid;
    grid-template-columns: 500px 1fr;
    gap: var(--spacing-4);
  }

  /* Preview panel */
  .preview-panel {
    position: sticky;
    top: var(--spacing-4);
    height: calc(100vh - var(--spacing-8));
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .pdf-preview,
  .img-preview {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .no-preview {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    color: var(--color-text-tertiary);
  }

  .no-preview p:first-child {
    font-size: 4rem;
    margin: 0;
  }

  /* Sections */
  .sections {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    background: var(--color-surface);
  }

  .section h2 {
    margin: 0 0 var(--spacing-3);
    font-size: var(--font-size-lg);
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--spacing-3);
  }

  .section-header h3 {
    margin: 0;
    font-size: var(--font-size-md);
  }

  .header-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .empty-state {
    color: var(--color-text-tertiary);
    font-style: italic;
    text-align: center;
    padding: var(--spacing-4);
  }

  /* Form */
  .form-group {
    margin-bottom: var(--spacing-2);
    position: relative;
  }

  .form-group label {
    display: block;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 0.25rem;
  }

  .form-group input {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    font-size: var(--font-size-sm);
  }

  .form-group input:focus {
    outline: none;
    border-color: var(--color-primary-500);
  }

  /* Autocomplete */
  .autocomplete-results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    margin-top: 0.25rem;
    max-height: 200px;
    overflow-y: auto;
    z-index: 10;
    list-style: none;
    padding: 0;
    margin: 0.25rem 0 0;
    box-shadow: var(--shadow-md);
  }

  .autocomplete-results li button {
    width: 100%;
    padding: 0.5rem;
    border: none;
    background: transparent;
    text-align: left;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .autocomplete-results li button:hover {
    background: var(--color-surface-alt);
  }

  .cuit-hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }

  /* Data display */
  .data-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .data-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid var(--color-border);
    font-size: var(--font-size-sm);
  }

  .data-item .label {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-secondary);
  }

  .data-item .value {
    color: var(--color-text-primary);
  }
</style>
