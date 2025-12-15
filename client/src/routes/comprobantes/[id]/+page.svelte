<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import EmitterCombobox from '$lib/components/EmitterCombobox.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import { Accordion } from 'melt/builders';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();
  let { comprobante } = data;

  type Emitter = {
    id?: number;
    name: string;
    cuit: string;
    cuitNumeric?: string;
  };

  let selectedEmitter = $state<Emitter | null>(null);
  let confirmReprocess = $state(false);
  let processing = $state(false);

  let facuraData = $state({
    cuit:
      comprobante.final?.cuit ||
      comprobante.expected?.cuit ||
      comprobante.pending?.extractedCuit ||
      '',
    invoiceType: comprobante.final?.invoiceType || comprobante.expected?.invoiceType || '',
    pointOfSale: comprobante.final?.pointOfSale || comprobante.expected?.pointOfSale || null,
    invoiceNumber: comprobante.final?.invoiceNumber || comprobante.expected?.invoiceNumber || null,
    issueDate:
      comprobante.final?.issueDate ||
      comprobante.expected?.issueDate ||
      comprobante.pending?.extractedDate ||
      '',
    total:
      comprobante.final?.total ||
      comprobante.expected?.total ||
      comprobante.pending?.extractedTotal ||
      null,
  });

  // Accordion para expected/pending
  const accordion = new Accordion({
    value: comprobante.pending ? 'pending' : undefined,
  });

  function onEmitterSelect(emitter: Emitter | null) {
    selectedEmitter = emitter;
    if (emitter) facuraData.cuit = emitter.cuit;
  }

  function copyFromSection(source: 'final' | 'expected' | 'pending') {
    const sourceData =
      source === 'final'
        ? comprobante.final
        : source === 'expected'
          ? comprobante.expected
          : comprobante.pending;
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
    // TODO: Si selectedEmitter, también PATCH /api/invoices/:id/emisor
    // TODO: log audit event
    console.log('Guardar factura:', facuraData, { emitterId: selectedEmitter?.id });
  }

  // Determinar si se procesó alguna vez
  const wasProcessed = comprobante.final != null;

  async function processPending() {
    if (!comprobante.pending) return;

    if (wasProcessed && !confirmReprocess) {
      toast.error('Confirmá el reprocesamiento marcando el checkbox');
      return;
    }

    processing = true;
    const toastId = toast.loading(wasProcessed ? 'Reprocesando...' : 'Procesando...');

    try {
      const endpoint = wasProcessed
        ? `/api/pending-files/${comprobante.pending.id}/reprocess`
        : `/api/pending-files/${comprobante.pending.id}/process`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (data.success) {
        toast.success(
          `✅ ${wasProcessed ? 'Reprocesado' : 'Procesado'}: ${data.extraction?.confidence || 0}% confianza`,
          { id: toastId }
        );
        // Revalidar los datos de la página sin recargar completamente
        await invalidateAll();
      } else {
        toast.error(data.error || 'Error al procesar', { id: toastId });
      }
    } catch (err) {
      toast.error('Error al procesar archivo', { id: toastId });
      console.error('Error:', err);
    } finally {
      processing = false;
      confirmReprocess = false;
    }
  }

  // Obtener ruta del archivo para preview
  const fileUrl = $derived.by(() => {
    // Para pending files, usar el endpoint de API que maneja HEIC
    if (comprobante.pending?.id) {
      const url = `/api/pending-files/${comprobante.pending.id}/file`;
      console.log('[FilePreview] URL para pending:', url, comprobante.pending);
      return url;
    }
    if (comprobante.final?.filePath) {
      const url = `/api/files/${comprobante.final.filePath}`;
      console.log('[FilePreview] URL para final:', url);
      return url;
    }
    if (comprobante.expected?.filePath) {
      const url = `/api/files/${comprobante.expected.filePath}`;
      console.log('[FilePreview] URL para expected:', url);
      return url;
    }
    console.log('[FilePreview] No hay fileUrl disponible', comprobante);
    return null;
  });

  const previewFilename = $derived.by(() => {
    if (comprobante.pending?.originalFilename) {
      return comprobante.pending.originalFilename;
    }
    if (comprobante.final?.filePath) {
      return comprobante.final.filePath.split('/').pop() || 'documento';
    }
    if (comprobante.expected?.filePath) {
      return comprobante.expected.filePath.split('/').pop() || 'documento';
    }
    return 'documento';
  });
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
        <FilePreview
          src={fileUrl}
          filename={previewFilename}
          showZoom={true}
          maxHeight="calc(100vh - 200px)"
        />
      {:else}
        <div class="no-preview">
          <p>📄</p>
          <p>Sin archivo asociado</p>
        </div>
      {/if}
    </aside>

    <!-- Columna derecha: Formulario + Accordions -->
    <div {...accordion.root} class="content">
      <!-- Formulario Factura (ARRIBA, siempre visible) -->
      <section class="section factura-section">
        <h2>Factura Final (Verificada)</h2>

        <EmitterCombobox value={selectedEmitter} onselect={onEmitterSelect} />

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

      <!-- Accordion: Expected -->
      {#if comprobante.expected}
        {@const item = accordion.getItem({ id: 'expected' })}
        <div class="accordion">
          <h3 {...item.heading}>
            <button type="button" {...item.trigger} class="accordion-trigger">
              <span>📋 Del Fisco (Expected)</span>
              <span class="accordion-icon">▼</span>
            </button>
          </h3>
          <div {...item.content} class="accordion-content">
            <div class="accordion-header">
              <Button size="sm" variant="secondary" onclick={() => copyFromSection('expected')}>
                Copiar a Factura
              </Button>
            </div>
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
          </div>
        </div>
      {/if}

      <!-- Accordion: Pending -->
      {#if comprobante.pending}
        {@const item = accordion.getItem({ id: 'pending' })}
        <div class="accordion">
          <h3 {...item.heading}>
            <button type="button" {...item.trigger} class="accordion-trigger">
              <span>📦 Documento Subido (OCR Extraído)</span>
              <span class="accordion-icon">▼</span>
            </button>
          </h3>
          <div {...item.content} class="accordion-content">
            <div class="accordion-header">
              <Button size="sm" variant="secondary" onclick={() => copyFromSection('pending')}>
                Copiar a Factura
              </Button>
              {#if wasProcessed}
                <label class="reprocess-confirm">
                  <input type="checkbox" bind:checked={confirmReprocess} />
                  <span>Confirmar reprocesamiento</span>
                </label>
              {/if}
              <Button
                size="sm"
                variant={wasProcessed ? 'ghost' : 'secondary'}
                onclick={processPending}
                disabled={processing}
              >
                {#if processing}
                  ⏳ Procesando...
                {:else if wasProcessed}
                  🔄 Reprocesar
                {:else}
                  ▶️ Procesar
                {/if}
              </Button>
            </div>
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
          </div>
        </div>
      {/if}
    </div>
  </div>
</div>

<Toaster position="top-right" richColors />

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

  /* Content */
  .content {
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

  /* Form */
  .form-group {
    margin-bottom: var(--spacing-2);
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

  .actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }

  /* Accordion */
  .accordion {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .accordion-trigger {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--spacing-3) var(--spacing-4);
    background: var(--color-surface-alt);
    border: none;
    cursor: pointer;
    margin: 0;
    font-size: var(--font-size-md);
    font-weight: var(--font-weight-semibold);
    transition: background var(--transition-fast);
  }

  .accordion-trigger:hover {
    background: var(--color-neutral-100);
  }

  .accordion-trigger[data-state='open'] .accordion-icon {
    transform: rotate(180deg);
  }

  .accordion-icon {
    transition: transform var(--transition-base);
    font-size: var(--font-size-sm);
  }

  .accordion-content {
    padding: var(--spacing-4);
  }

  .accordion-content[data-state='closed'] {
    display: none;
  }

  .accordion-header {
    display: flex;
    gap: var(--spacing-2);
    align-items: center;
    margin-bottom: var(--spacing-3);
    flex-wrap: wrap;
  }

  .reprocess-confirm {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .reprocess-confirm input[type='checkbox'] {
    width: auto;
    cursor: pointer;
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
