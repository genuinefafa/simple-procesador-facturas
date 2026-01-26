<script lang="ts">
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import FilePreview from '$lib/components/FilePreview.svelte';
  import DuplicateHashAlert from '$lib/components/DuplicateHashAlert.svelte';
  import NavigationBar from '$lib/components/NavigationBar.svelte';
  import SourceComparison from '$lib/components/SourceComparison.svelte';
  import InvoiceCard from '$lib/components/InvoiceCard.svelte';
  import type { PageData } from './$types';
  import { toast, Toaster } from 'svelte-sonner';
  import { invalidateAll, goto } from '$app/navigation';
  import { formatDateTime, formatDateShort, getFriendlyType, formatCuit } from '$lib/formatters';
  import { createInvoiceForm } from '$lib/stores/createInvoiceForm.svelte';
  import { createEmitterResolver } from '$lib/stores/emitterResolver.svelte';
  import { createDeleteHandler } from '$lib/stores/deleteInvoice.svelte';
  import {
    comprobanteService,
    type ExpectedInvoiceSummary,
    type ExtractionMethod,
  } from '$lib/services/ComprobanteService';

  let { data } = $props();
  let comprobante = $derived(data.comprobante);
  let categories = $derived(data.categories || []);

  // Stores
  const invoiceForm = createInvoiceForm();
  const emitterResolver = createEmitterResolver();
  const deleteHandler = createDeleteHandler();

  let processing = $state(false);
  let linkExpectedDialogOpen = $state(false);
  let availableExpected = $state<ExpectedInvoiceSummary[]>([]);
  let loadingExpected = $state(false);

  const formatHash = (hash: string | null | undefined) => {
    if (!hash) return '—';
    return `${hash.substring(0, 16)}...`;
  };

  // Determinar si es una expected sin archivo (no permite crear factura directamente)
  const isExpectedWithoutFile = $derived(
    comprobante.kind === 'expected' && !comprobante.file && !comprobante.final
  );

  // Determinar si mostrar la comparación de fuentes (sin factura final)
  const showSourceComparison = $derived(
    !comprobante.final && (comprobante.file || comprobante.expected)
  );

  // El mejor match: si hay expected vinculado, usarlo; sino el primer match
  const bestExpected = $derived.by(() => {
    if (comprobante.expected) return comprobante.expected;
    if (comprobante.matches && comprobante.matches.length > 0) {
      const m = comprobante.matches[0];
      return {
        id: m.id,
        cuit: m.cuit,
        emitterName: m.emitterName,
        issueDate: m.issueDate,
        invoiceType: m.invoiceType,
        pointOfSale: m.pointOfSale,
        invoiceNumber: m.invoiceNumber,
        total: m.total,
        status: m.status,
        categoryId: m.categoryId ?? null,
      };
    }
    return null;
  });

  // File para SourceComparison (solo datos de extracción)
  // El emitterName ya no se pasa - SourceComparison resuelve via EmitterService
  const enrichedFile = $derived(comprobante.file ?? null);

  // Sincronizar facturaData con comprobante cuando cambie
  $effect(() => {
    const fd = invoiceForm.formData;
    fd.cuit = comprobante.final?.cuit || comprobante.expected?.cuit || fd.cuit;
    fd.invoiceType =
      comprobante.final?.invoiceType || comprobante.expected?.invoiceType || fd.invoiceType;
    fd.pointOfSale =
      comprobante.final?.pointOfSale ?? comprobante.expected?.pointOfSale ?? fd.pointOfSale;
    fd.invoiceNumber =
      comprobante.final?.invoiceNumber ?? comprobante.expected?.invoiceNumber ?? fd.invoiceNumber;
    fd.issueDate = comprobante.final?.issueDate || comprobante.expected?.issueDate || fd.issueDate;
    fd.total = comprobante.final?.total ?? comprobante.expected?.total ?? fd.total;

    if (comprobante.expected) {
      invoiceForm.selectedExpectedId = comprobante.expected.id;
    }

    // Preseleccionar categoría desde la factura final si existe
    if (!invoiceForm.editMode && comprobante.final) {
      invoiceForm.selectedCategoryId = comprobante.final.categoryId ?? null;
    }
  });

  async function openLinkExpectedDialog() {
    if (!comprobante.final) return;

    linkExpectedDialogOpen = true;
    loadingExpected = true;

    const result = await comprobanteService.fetchPendingExpected(comprobante.final.cuit);
    if (result.success) {
      availableExpected = result.data || [];
    } else {
      toast.error(result.error || 'Error al cargar facturas esperadas');
    }
    loadingExpected = false;
  }

  async function linkExpected(expectedId: number) {
    if (!comprobante.final) return;

    const toastId = toast.loading('Vinculando...');
    const result = await comprobanteService.linkExpected(comprobante.final.id, expectedId);

    if (result.success) {
      toast.success('Factura vinculada con expected', { id: toastId });
      linkExpectedDialogOpen = false;
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al vincular', { id: toastId });
    }
  }

  async function processPending(method?: ExtractionMethod) {
    if (!comprobante.file) return;

    processing = true;
    const methodLabel = method === 'pdf_text' ? 'PDF Text' : method === 'qr' ? 'QR' : 'OCR';
    const toastId = toast.loading(`Procesando con ${methodLabel}...`);

    const result = await comprobanteService.processFile(comprobante.file.id, method || 'ocr');

    if (result.success) {
      toast.success(
        `Procesado con ${methodLabel}: ${result.extraction?.confidence || 0}% confianza`,
        { id: toastId }
      );
      await invalidateAll();
    } else {
      toast.error(result.error || 'Error al procesar', { id: toastId });
    }
    processing = false;
  }

  // Obtener ruta del archivo para preview
  const fileUrl = $derived.by(() => {
    // Factura: usar endpoint de factura (resuelve fileId internamente)
    if (comprobante.final?.id) {
      return `/api/comprobantes/factura:${comprobante.final.id}/file`;
    }
    // Archivo pendiente (sin factura)
    if (comprobante.file?.id) {
      return `/api/comprobantes/file:${comprobante.file.id}/file`;
    }
    return null;
  });

  const previewFilename = $derived.by(() => {
    if (comprobante.file?.originalFilename) {
      return comprobante.file.originalFilename;
    }
    if (comprobante.final?.filePath) {
      return comprobante.final.filePath.split('/').pop() || 'documento';
    }
    return 'documento';
  });

  // Título y subtítulo para NavigationBar
  const navTitle = $derived.by(() => {
    if (comprobante.final) {
      const type = getFriendlyType(comprobante.final.invoiceType);
      const pv = comprobante.final.pointOfSale
        ? String(comprobante.final.pointOfSale).padStart(4, '0')
        : '----';
      const num = comprobante.final.invoiceNumber
        ? String(comprobante.final.invoiceNumber).padStart(8, '0')
        : '--------';
      return `${type} ${pv}-${num}`;
    }
    if (comprobante.file) {
      return comprobante.file.originalFilename;
    }
    if (comprobante.expected) {
      const type = getFriendlyType(comprobante.expected.invoiceType);
      return `${type} ${String(comprobante.expected.pointOfSale).padStart(4, '0')}-${String(comprobante.expected.invoiceNumber).padStart(8, '0')}`;
    }
    return 'Comprobante';
  });

  // Subtítulo especial para archivos: "subido el fecha"
  const navFileSubtitle = $derived.by(() => {
    if (comprobante.file && !comprobante.final) {
      const uploadDate = comprobante.file.uploadDate;
      if (uploadDate) {
        return `subido el ${formatDateShort(uploadDate)}`;
      }
      return 'archivo pendiente de procesar';
    }
    return null;
  });

  // Fecha para el navbar (formato corto: 17/ene/2025)
  const navDate = $derived.by(() => {
    const date = comprobante.final?.issueDate || comprobante.expected?.issueDate;
    return date ? formatDateShort(date) : undefined;
  });

  // CUIT formateado con guiones
  const navCuit = $derived.by(() => {
    const cuit = comprobante.final?.cuit || comprobante.expected?.cuit;
    if (!cuit) return undefined;
    const formatted = formatCuit(cuit);
    return formatted === '—' ? undefined : formatted;
  });
</script>

<svelte:head>
  <title>Detalle Comprobante</title>
</svelte:head>

<div class="container">
  <NavigationBar
    currentId={comprobante.id}
    title={navTitle}
    date={navDate}
    emitterName={navFileSubtitle || comprobante.emitterName || undefined}
    cuit={navFileSubtitle ? undefined : navCuit}
  />

  <!-- Alerta de duplicados por hash (global, arriba) -->
  {#if comprobante.final?.fileHash || comprobante.file?.fileHash}
    {@const fileHash = comprobante.final?.fileHash || comprobante.file?.fileHash}
    {@const currentType = comprobante.final ? 'invoice' : 'file'}
    {@const currentId = comprobante.final?.id || comprobante.file?.id || 0}
    {@const linkedFileId = comprobante.final?.fileId || null}
    {@const linkedInvoiceId = comprobante.file?.linkedInvoiceId || null}
    <DuplicateHashAlert {fileHash} {currentId} {currentType} {linkedFileId} {linkedInvoiceId} />
  {/if}

  <div class="layout" class:has-invoice={comprobante.final}>
    <!-- Columna izquierda: Preview -->
    <aside class="preview-panel">
      {#if fileUrl}
        <FilePreview src={fileUrl} filename={previewFilename} showZoom={true} maxHeight="100%" />
      {:else}
        <div class="no-preview">
          <p>📄</p>
          <p>Sin archivo asociado</p>
        </div>
      {/if}
    </aside>

    <!-- Columna derecha: Contenido -->
    <div class="content">
      <!-- Comparación de fuentes (sin factura) -->
      {#if showSourceComparison}
        <section class="section comparison-section">
          <SourceComparison
            file={enrichedFile}
            expected={bestExpected}
            oncreatefromfile={() => {
              if (comprobante.file) {
                invoiceForm.populateFromFile(comprobante.file);
              }
            }}
            oncreatefromexpected={async () => {
              if (!bestExpected) return;
              const emitterName = await emitterResolver.resolve(bestExpected.cuit);
              if (emitterName === null) return;
              invoiceForm.populateFromExpected(bestExpected, emitterName);
            }}
            onreprocess={processPending}
            {processing}
          />
        </section>
      {/if}

      <!-- Factura Final: usar InvoiceCard con inline edit -->
      {#if comprobante.final}
        <section class="section factura-section">
          {#if comprobante.final.fileHash}
            <div class="meta-row small">
              <span class="meta"
                >Hash: <code class="hash">{formatHash(comprobante.final.fileHash)}</code></span
              >
              <span class="meta">Creada: {formatDateTime(comprobante.final.processedAt)}</span>
            </div>
          {/if}
          <InvoiceCard
            invoice={{
              id: comprobante.final.id,
              cuit: comprobante.final.cuit,
              emitterName: comprobante.emitterName,
              issueDate: comprobante.final.issueDate,
              invoiceType: comprobante.final.invoiceType,
              pointOfSale: comprobante.final.pointOfSale,
              invoiceNumber: comprobante.final.invoiceNumber,
              total: comprobante.final.total,
              categoryId: comprobante.final.categoryId,
            }}
            {categories}
            onsave={async (data) => {
              if (!comprobante.final) return;
              const toastId = toast.loading('Guardando cambios...');
              const result = await comprobanteService.updateInvoice(comprobante.final.id, data);
              if (result.success) {
                toast.success('Factura actualizada', { id: toastId });
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al guardar', { id: toastId });
              }
            }}
            oncategorychange={async (categoryId) => {
              if (!comprobante.final) return;
              const result = await comprobanteService.updateInvoiceCategory(
                comprobante.final.id,
                categoryId
              );
              if (result.success) {
                toast.success('Categoría actualizada');
                await invalidateAll();
              } else {
                toast.error(result.error || 'Error al actualizar categoría');
              }
            }}
            ondelete={() => deleteHandler.open(comprobante)}
          />

          {#if comprobante.final.expectedInvoiceId}
            <div class="expected-indicator">
              <span class="indicator-label"
                >📋 Vinculado a expected #{comprobante.final.expectedInvoiceId}</span
              >
            </div>
          {:else}
            <div class="expected-indicator missing">
              <span class="indicator-label">📋 Sin vincular al fisco</span>
              <button type="button" class="link-button" onclick={openLinkExpectedDialog}>
                Buscar y vincular
              </button>
            </div>
          {/if}
        </section>

        <!-- Sin factura + editMode: InvoiceCard en modo create -->
      {:else if !isExpectedWithoutFile && invoiceForm.editMode}
        <section class="section factura-section">
          <InvoiceCard
            mode="create"
            invoice={{
              cuit: invoiceForm.formData.cuit,
              emitterName: invoiceForm.resolvedEmitterName,
              issueDate: invoiceForm.formData.issueDate,
              invoiceType: invoiceForm.formData.invoiceType,
              pointOfSale: invoiceForm.formData.pointOfSale,
              invoiceNumber: invoiceForm.formData.invoiceNumber,
              total: invoiceForm.formData.total,
              categoryId: invoiceForm.selectedCategoryId,
            }}
            {categories}
            onsave={async (data) => {
              await invoiceForm.submit(comprobante.file?.id, data);
            }}
            oncancel={() => invoiceForm.reset()}
          />

          {#if invoiceForm.selectedExpectedId}
            <div class="expected-indicator below-total">
              <span class="indicator-label"
                >📋 Vinculado a expected #{invoiceForm.selectedExpectedId}</span
              >
              <button
                type="button"
                class="link-button"
                onclick={() => invoiceForm.unlinkExpected()}
              >
                ✕ Desvincular
              </button>
            </div>
          {/if}
        </section>

        <!-- Sin factura + sin editMode: solo SourceComparison con botones -->
      {:else if !isExpectedWithoutFile}
        <!-- El SourceComparison ya se muestra arriba, no necesitamos más acá -->

        <!-- Expected sin archivo: mensaje informativo -->
      {:else}
        <section class="section factura-section">
          <div class="alert alert-info">
            <strong>📋 Factura esperada sin archivo</strong>
            <p>
              Esta factura está registrada en el sistema pero aún no tiene un comprobante digital
              asociado.
            </p>
            <p class="workflow-hint">
              <strong>Workflow:</strong> Para crear la factura, primero debés subir el comprobante digital.
              Luego el sistema lo vinculará automáticamente con esta expected y podrás finalizarla.
            </p>
            <Button size="sm" variant="secondary" onclick={() => goto('/comprobantes')}>
              ← Ir a Comprobantes
            </Button>
          </div>
        </section>
      {/if}
    </div>
  </div>
</div>

<Toaster position="top-right" richColors />

<!-- Dialog de confirmación de eliminación -->
<Dialog
  bind:open={deleteHandler.dialogOpen}
  title={comprobante.final
    ? '⚠️ Eliminar Factura'
    : comprobante.file
      ? '⚠️ Eliminar Archivo Pendiente'
      : '⚠️ Eliminar Comprobante'}
  description="Esta acción no se puede deshacer"
>
  <div class="delete-dialog-content">
    {#if comprobante.final}
      <p>¿Estás seguro de que querés eliminar esta factura?</p>
      <div class="delete-info">
        <p><strong>La factura será eliminada pero:</strong></p>
        <ul>
          <li>• Los archivos se mantendrán</li>
          <li>• Si tiene factura esperada vinculada, volverá a estado "pendiente"</li>
          <li>• Si tiene archivo pendiente vinculado, volverá a "en revisión"</li>
        </ul>
      </div>
    {:else if comprobante.file}
      <p>¿Estás seguro de que querés eliminar este archivo pendiente?</p>
      <div class="delete-info">
        <p><strong>Se eliminará:</strong></p>
        <ul>
          <li>• El registro en base de datos</li>
          <li>
            • El archivo físico del disco <strong
              >solo si no está vinculado a ninguna factura</strong
            >
          </li>
        </ul>
        <p class="info-note">
          📌 Si existe una factura que usa este archivo, el archivo físico se preservará
          automáticamente.
        </p>
      </div>
    {/if}

    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => deleteHandler.close()}>Cancelar</Button>
      <Button variant="danger" onclick={() => deleteHandler.confirm(comprobante)}>Eliminar</Button>
    </div>
  </div>
</Dialog>

<!-- Dialog para vincular expected -->
<Dialog bind:open={linkExpectedDialogOpen} title="Vincular con factura esperada">
  <div class="link-expected-content">
    {#if loadingExpected}
      <p class="loading-text">Buscando facturas esperadas...</p>
    {:else if availableExpected.length === 0}
      <p class="empty-text">No hay facturas esperadas pendientes para este CUIT.</p>
    {:else}
      <p class="help-text">Seleccioná la factura esperada que corresponde:</p>
      <div class="expected-list">
        {#each availableExpected as exp}
          <button type="button" class="expected-option" onclick={() => linkExpected(exp.id)}>
            <div class="expected-main">
              <span class="expected-type">{getFriendlyType(exp.invoiceType)}</span>
              <span class="expected-number">
                {String(exp.pointOfSale).padStart(4, '0')}-{String(exp.invoiceNumber).padStart(
                  8,
                  '0'
                )}
              </span>
            </div>
            <div class="expected-details">
              <span class="expected-date">{formatDateShort(exp.issueDate)}</span>
              {#if exp.total}
                <span class="expected-total">${exp.total.toLocaleString('es-AR')}</span>
              {/if}
            </div>
            {#if exp.emitterName}
              <div class="expected-emitter">{exp.emitterName}</div>
            {/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="dialog-actions">
      <Button variant="secondary" onclick={() => (linkExpectedDialogOpen = false)}>Cancelar</Button>
    </div>
  </div>
</Dialog>

<style>
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding: var(--spacing-4);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    /*
     * Altura = viewport - topbar (~56px) - content-inner padding (spacing-6 * 2)
     * El topbar es sticky y ocupa ~56px. El content-inner agrega spacing-6 de padding.
     * Usamos un cálculo conservador para evitar doble scroll.
     */
    height: calc(100vh - 56px - var(--spacing-6) * 3);
  }

  .layout {
    display: grid;
    /* Preview ocupa el espacio restante, content tiene mínimo 420px */
    grid-template-columns: 1fr minmax(420px, 480px);
    gap: var(--spacing-4);
    flex: 1;
    min-height: 0; /* Importante para que flex children puedan hacer scroll */
    overflow: hidden;
  }

  /* Cuando hay factura, dar un poco más de espacio al content */
  .layout.has-invoice {
    grid-template-columns: 1fr minmax(440px, 520px);
  }

  /* Preview panel */
  .preview-panel {
    height: 100%;
    min-height: 0; /* Permite que se encoja si es necesario */
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
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

  /* Content - columna derecha con scroll propio */
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    overflow-y: auto;
    min-height: 0; /* Permite scroll interno */
    padding-right: var(--spacing-2); /* Espacio para scrollbar */
  }

  .section {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    padding: var(--spacing-4);
    background: var(--color-surface);
  }

  /* Comparison section - sin borde propio, el SourceComparison ya tiene */
  .comparison-section {
    border: none;
    padding: 0;
    background: transparent;
  }

  /* Meta row for factura header */
  .meta-row {
    display: flex;
    gap: var(--spacing-3);
    align-items: center;
    margin-bottom: var(--spacing-3);
    color: var(--color-text-secondary);
    flex-wrap: wrap;
  }
  .meta-row.small {
    font-size: var(--font-size-sm);
  }

  /* Alert box for expected without file */
  .alert {
    padding: var(--spacing-3);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-3);
  }

  .alert-info {
    background: var(--color-primary-50);
    border: 1px solid var(--color-primary-200);
    color: var(--color-primary-900);
  }

  .alert strong {
    display: block;
    margin-bottom: var(--spacing-2);
    font-size: var(--font-size-md);
  }

  .alert p {
    margin: 0 0 var(--spacing-2);
    font-size: var(--font-size-sm);
    line-height: 1.5;
  }

  .alert .workflow-hint {
    padding: var(--spacing-2);
    background: white;
    border-radius: var(--radius-sm);
    border-left: 3px solid var(--color-primary-600);
  }

  /* Expected indicator */
  .expected-indicator {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-primary-50);
    border: 1px solid var(--color-primary-200);
    border-radius: var(--radius-md);
    margin-bottom: var(--spacing-3);
  }

  .expected-indicator.below-total {
    margin-top: var(--spacing-2);
  }

  .expected-indicator .indicator-label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    color: var(--color-primary-700);
  }

  .expected-indicator.missing {
    background: var(--color-warning-50);
    border-color: var(--color-warning-200);
  }

  .expected-indicator.missing .indicator-label {
    color: var(--color-warning-700);
  }

  .link-button {
    background: transparent;
    border: none;
    color: var(--color-primary-700);
    font-size: var(--font-size-sm);
    cursor: pointer;
    text-decoration: underline;
    padding: 0.25rem 0.5rem;
  }

  .link-button:hover {
    color: var(--color-primary-900);
  }

  /* Dialog de eliminación */
  .delete-dialog-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
  }

  .delete-info {
    padding: var(--spacing-4);
    background: var(--color-warning-50);
    border-left: 3px solid var(--color-warning);
    border-radius: var(--radius-base);
  }

  .delete-info p {
    margin: 0 0 var(--spacing-2) 0;
    color: var(--color-text-primary);
  }

  .delete-info ul {
    margin: 0;
    padding-left: var(--spacing-4);
    list-style: none;
  }

  .delete-info li {
    margin: var(--spacing-1) 0;
    color: var(--color-text-secondary);
  }

  .delete-info .info-note {
    margin-top: var(--spacing-3);
    padding: var(--spacing-2);
    background: var(--color-surface);
    border-radius: var(--radius-sm);
    font-size: 0.9em;
    color: var(--color-text-secondary);
  }

  .dialog-actions {
    display: flex;
    gap: var(--spacing-3);
    justify-content: flex-end;
    margin-top: var(--spacing-2);
  }

  code.hash {
    font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
    font-size: 0.85em;
    background: var(--color-surface);
    padding: 0.125rem 0.375rem;
    border-radius: var(--radius-sm);
    color: var(--color-text-secondary);
    border: 1px solid var(--color-border);
  }

  /* Dialog vincular expected */
  .link-expected-content {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .loading-text,
  .empty-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    text-align: center;
    padding: var(--spacing-4);
  }

  .help-text {
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    margin: 0;
  }

  .expected-list {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    max-height: 300px;
    overflow-y: auto;
  }

  .expected-option {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .expected-option:hover {
    border-color: var(--color-primary-300);
    background: var(--color-primary-50);
  }

  .expected-main {
    display: flex;
    gap: var(--spacing-2);
    align-items: baseline;
  }

  .expected-type {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
  }

  .expected-number {
    font-family: var(--font-mono);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .expected-details {
    display: flex;
    gap: var(--spacing-3);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
  }

  .expected-total {
    font-family: var(--font-mono);
  }

  .expected-emitter {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }
</style>
