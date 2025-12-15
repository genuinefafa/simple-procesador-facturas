<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import type { PageData } from './$types';

  let { data } = $props();
  let { comprobante } = data;

  let facuraData = $state({
    cuit: comprobante.final?.cuit || comprobante.expected?.cuit || comprobante.pending?.extractedCuit || '',
    invoiceType:
      comprobante.final?.invoiceType ||
      comprobante.expected?.invoiceType ||
      null,
    pointOfSale:
      comprobante.final?.pointOfSale ||
      comprobante.expected?.pointOfSale ||
      null,
    invoiceNumber:
      comprobante.final?.invoiceNumber ||
      comprobante.expected?.invoiceNumber ||
      null,
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

  async function saveFactura() {
    // TODO: Guardar factura con PATCH /api/invoices/:id
    // TODO: log audit event (source='manual', diff, actor)
    console.log('Guardar factura:', facuraData);
  }

  async function reprocess() {
    if (comprobante.pending) {
      // TODO: Reprocesar pendiente con POST /api/pending-files/:id/reprocess
      // TODO: log audit event (action='pending.reprocess')
      console.log('Reprocesar pendiente:', comprobante.pending.id);
    }
  }
</script>

<svelte:head>
  <title>Detalle Comprobante</title>
</svelte:head>

<div class="container">
  <header class="header">
    <a href="/comprobantes">← Volver</a>
    <h1>Detalle Comprobante</h1>
  </header>

  <div class="sections">
    <!-- Sección Factura (la que se va a guardar/modificar) -->
    <section class="section factura-section">
      <h2>Factura (Datos verificados por usuario)</h2>
      <div class="form-group">
        <label>CUIT</label>
        <input type="text" bind:value={facuraData.cuit} />
      </div>
      <div class="form-group">
        <label>Tipo</label>
        <input type="text" bind:value={facuraData.invoiceType} />
      </div>
      <div class="form-group">
        <label>Punto de Venta</label>
        <input type="number" bind:value={facuraData.pointOfSale} />
      </div>
      <div class="form-group">
        <label>Número</label>
        <input type="number" bind:value={facuraData.invoiceNumber} />
      </div>
      <div class="form-group">
        <label>Fecha</label>
        <input type="date" bind:value={facuraData.issueDate} />
      </div>
      <div class="form-group">
        <label>Total</label>
        <input type="number" bind:value={facuraData.total} />
      </div>
      <div class="actions">
        <Button onclick={saveFactura}>Guardar</Button>
        {#if comprobante.pending}
          <Button variant="secondary" onclick={reprocess}>Reprocesar</Button>
        {/if}
      </div>
    </section>

    <!-- Sección Expected (si existe) -->
    {#if comprobante.expected}
      <section class="section expected-section">
        <div class="section-header">
          <h3>Del Fisco (Expected)</h3>
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
      </section>
    {/if}

    <!-- Sección Pending (si existe) -->
    {#if comprobante.pending}
      <section class="section pending-section">
        <div class="section-header">
          <h3>Documento Subido (OCR Extraído)</h3>
          <Button size="sm" variant="secondary" onclick={() => copyFromSection('pending')}>
            Copiar a Factura
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
      </section>
    {/if}

    <!-- Sección Final (si existe) -->
    {#if comprobante.final}
      <section class="section final-section">
        <div class="section-header">
          <h3>Factura Creada</h3>
          <Button size="sm" variant="secondary" onclick={() => copyFromSection('final')}>
            Copiar a Factura
          </Button>
        </div>
        <div class="data-list">
          <div class="data-item">
            <span class="label">CUIT:</span>
            <span class="value">{comprobante.final.cuit}</span>
          </div>
          <div class="data-item">
            <span class="label">Tipo:</span>
            <span class="value">{comprobante.final.invoiceType}</span>
          </div>
          <div class="data-item">
            <span class="label">Punto de Venta:</span>
            <span class="value">{comprobante.final.pointOfSale}</span>
          </div>
          <div class="data-item">
            <span class="label">Número:</span>
            <span class="value">{comprobante.final.invoiceNumber}</span>
          </div>
          <div class="data-item">
            <span class="label">Fecha:</span>
            <span class="value">{comprobante.final.issueDate}</span>
          </div>
          <div class="data-item">
            <span class="label">Total:</span>
            <span class="value">{comprobante.final.total}</span>
          </div>
          <div class="data-item">
            <span class="label">Hash:</span>
            <span class="value">{comprobante.final.fileHash?.slice(0, 8) || '—'}</span>
          </div>
        </div>
      </section>
    {/if}
  </div>
</div>

<style>
  .container {
    max-width: 1200px;
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

  .sections {
    display: grid;
    grid-template-columns: 1fr 1fr;
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

  .actions {
    display: flex;
    gap: var(--spacing-2);
    margin-top: var(--spacing-3);
  }

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

  .factura-section {
    grid-column: 1 / -1;
    order: -1;
  }
</style>
