<script lang="ts">
  /**
   * Comparación lado a lado de datos de archivo (OCR) vs expected.
   *
   * Diseño: compacto, campos con altura fija para alinear indicadores.
   *
   * Los nombres de emisor se resuelven usando EmitterService para garantizar
   * consistencia de casing y formato entre file y expected.
   */

  import MatchIndicator from './MatchIndicator.svelte';
  import Button from './ui/Button.svelte';
  import Dialog from './ui/Dialog.svelte';
  import { getFriendlyType, formatCurrency, formatDateShort } from '$lib/formatters';
  import { emitterService, type ResolvedEmitter } from '$lib/services/EmitterService';

  type ExtractionMethod = 'ocr' | 'pdf_text' | 'qr';

  type FileData = {
    extractedCuit?: string | null;
    extractedDate?: string | null;
    extractedTotal?: number | null;
    extractedType?: number | null;
    extractedPointOfSale?: number | null;
    extractedInvoiceNumber?: number | null;
    extractionConfidence?: number | null;
    extractionMethod?: string | null;
    /** @deprecated Usar CUIT y resolver via EmitterService */
    emitterName?: string | null;
  };

  type ExpectedData = {
    id: number;
    cuit: string;
    /** @deprecated Usar CUIT y resolver via EmitterService */
    emitterName?: string | null;
    issueDate: string;
    invoiceType: number | null;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number | null;
    status?: string;
  };

  type Props = {
    /** Datos extraídos del archivo (OCR) */
    file?: FileData | null;
    /** Datos esperados */
    expected?: ExpectedData | null;
    /** Callback cuando se quiere crear factura desde archivo */
    oncreatefromfile?: () => void;
    /** Callback cuando se quiere crear factura desde expected */
    oncreatefromexpected?: () => void;
    /** Callback para reprocesar con método específico */
    onreprocess?: (method: ExtractionMethod) => void;
    /** Si está procesando algo */
    processing?: boolean;
  };

  let {
    file,
    expected,
    oncreatefromfile,
    oncreatefromexpected,
    onreprocess,
    processing = false,
  }: Props = $props();

  const hasFile = $derived(!!file);
  const hasExpected = $derived(!!expected);

  // Resolved emitters (from EmitterService)
  let fileEmitter = $state<ResolvedEmitter | null>(null);
  let expectedEmitter = $state<ResolvedEmitter | null>(null);

  // Resolve emitters when CUITs change
  $effect(() => {
    const cuit = file?.extractedCuit;
    if (cuit) {
      emitterService.resolve(cuit).then((resolved) => {
        fileEmitter = resolved;
      });
    } else {
      fileEmitter = null;
    }
  });

  $effect(() => {
    const cuit = expected?.cuit;
    if (cuit) {
      emitterService.resolve(cuit).then((resolved) => {
        expectedEmitter = resolved;
      });
    } else {
      expectedEmitter = null;
    }
  });

  // Display names usando EmitterService.formatDisplay()
  const fileEmitterDisplay = $derived(
    fileEmitter
      ? emitterService.formatDisplay(fileEmitter, file?.emitterName)
      : file?.emitterName || '—'
  );

  const expectedEmitterDisplay = $derived(
    expectedEmitter
      ? emitterService.formatDisplay(expectedEmitter, expected?.emitterName)
      : expected?.emitterName || '—'
  );

  // Estado del diálogo de reprocesamiento
  let reprocessDialogOpen = $state(false);

  // Formateadores
  const formatInvoiceNum = (pv: number | null | undefined, num: number | null | undefined) => {
    if (pv == null && num == null) return '—';
    const pvStr = pv != null ? String(pv).padStart(4, '0') : '----';
    const numStr = num != null ? String(num).padStart(8, '0') : '--------';
    return `${pvStr}-${numStr}`;
  };

  // Truncar nombre largo
  const truncateName = (name: string | null | undefined, maxLen: number = 20) => {
    if (!name) return '—';
    if (name.length <= maxLen) return name;
    return name.slice(0, maxLen - 1) + '...';
  };

  // Método actual de extracción (para mostrar cuál se usó)
  const currentMethod = $derived.by(() => {
    const method = file?.extractionMethod?.toUpperCase();
    if (!method) return null;
    if (method === 'OCR') return 'OCR';
    if (method === 'PDF_TEXT') return 'PDF Text';
    if (method === 'PDF_TEXT+OCR') return 'PDF+OCR';
    if (method === 'QR') return 'QR';
    return method;
  });

  // Confidence badge
  const confidenceLevel = $derived.by(() => {
    const conf = file?.extractionConfidence;
    if (conf == null) return null;
    if (conf >= 90) return { label: 'Alta', class: 'high' };
    if (conf >= 70) return { label: 'Media', class: 'medium' };
    return { label: 'Baja', class: 'low' };
  });

  function handleReprocess(method: ExtractionMethod) {
    reprocessDialogOpen = false;
    onreprocess?.(method);
  }
</script>

<div class="source-comparison">
  <div class="columns">
    <!-- Columna Archivo -->
    {#if hasFile}
      <div class="source-column file">
        <div class="column-header">
          <span class="source-icon">📦</span>
          <span class="source-title">Archivo</span>
          {#if currentMethod}
            <span class="method-badge">{currentMethod}</span>
          {/if}
          {#if confidenceLevel}
            <span class="confidence-badge {confidenceLevel.class}">
              {file?.extractionConfidence}%
            </span>
          {/if}
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label">Emisor</span>
            <span class="field-value" title={fileEmitterDisplay}
              >{truncateName(fileEmitterDisplay)}</span
            >
          </div>
          <div class="field">
            <span class="field-label">CUIT</span>
            <span class="field-value mono">{file?.extractedCuit || '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Tipo</span>
            <span class="field-value">{getFriendlyType(file?.extractedType)}</span>
          </div>
          <div class="field">
            <span class="field-label">Numero</span>
            <span class="field-value mono"
              >{formatInvoiceNum(file?.extractedPointOfSale, file?.extractedInvoiceNumber)}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Fecha</span>
            <span class="field-value"
              >{file?.extractedDate ? formatDateShort(file.extractedDate) : '—'}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Total</span>
            <span class="field-value mono">{formatCurrency(file?.extractedTotal)}</span>
          </div>
        </div>

        <div class="column-actions">
          {#if onreprocess}
            <button
              type="button"
              class="icon-btn"
              onclick={() => (reprocessDialogOpen = true)}
              disabled={processing}
              title="Reprocesar con otro método"
            >
              🔄
            </button>
          {/if}
          {#if oncreatefromfile}
            <Button variant="primary" size="sm" onclick={oncreatefromfile} disabled={processing}>
              Usar estos datos
            </Button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Indicador de Match (centro) -->
    {#if hasFile && hasExpected}
      <div class="match-column">
        <div class="match-indicators">
          <div class="match-row"><span class="match-spacer"></span></div>
          <div class="match-row">
            <MatchIndicator left={file?.extractedCuit} right={expected?.cuit} type="cuit" />
          </div>
          <div class="match-row">
            <MatchIndicator left={file?.extractedType} right={expected?.invoiceType} type="exact" />
          </div>
          <div class="match-row">
            <MatchIndicator
              left={`${file?.extractedPointOfSale}-${file?.extractedInvoiceNumber}`}
              right={`${expected?.pointOfSale}-${expected?.invoiceNumber}`}
              type="exact"
            />
          </div>
          <div class="match-row">
            <MatchIndicator left={file?.extractedDate} right={expected?.issueDate} type="date" />
          </div>
          <div class="match-row">
            <MatchIndicator left={file?.extractedTotal} right={expected?.total} type="amount" />
          </div>
        </div>
      </div>
    {/if}

    <!-- Columna Expected -->
    {#if hasExpected}
      <div class="source-column expected">
        <div class="column-header">
          <span class="source-icon">📋</span>
          <span class="source-title">#{expected?.id}</span>
          {#if expected?.status}
            <span class="status-badge {expected.status}">{expected.status}</span>
          {/if}
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label">Emisor</span>
            <span class="field-value" title={expectedEmitterDisplay}
              >{truncateName(expectedEmitterDisplay)}</span
            >
          </div>
          <div class="field">
            <span class="field-label">CUIT</span>
            <span class="field-value mono">{expected?.cuit || '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Tipo</span>
            <span class="field-value">{getFriendlyType(expected?.invoiceType)}</span>
          </div>
          <div class="field">
            <span class="field-label">Numero</span>
            <span class="field-value mono"
              >{formatInvoiceNum(expected?.pointOfSale, expected?.invoiceNumber)}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Fecha</span>
            <span class="field-value"
              >{expected?.issueDate ? formatDateShort(expected.issueDate) : '—'}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Total</span>
            <span class="field-value mono">{formatCurrency(expected?.total)}</span>
          </div>
        </div>

        <div class="column-actions">
          {#if oncreatefromexpected}
            <Button
              variant="primary"
              size="sm"
              onclick={oncreatefromexpected}
              disabled={processing}
            >
              Usar estos datos
            </Button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Diálogo de reprocesamiento -->
<Dialog bind:open={reprocessDialogOpen} title="Reprocesar archivo">
  <p class="dialog-text">Elegí el método de extracción:</p>

  <div class="method-options">
    <button
      type="button"
      class="method-option"
      onclick={() => handleReprocess('ocr')}
      disabled={processing}
    >
      <span class="method-icon">🔍</span>
      <span class="method-name">OCR</span>
      <span class="method-desc">Reconocimiento óptico de caracteres (imágenes)</span>
    </button>

    <button
      type="button"
      class="method-option"
      onclick={() => handleReprocess('pdf_text')}
      disabled={processing}
    >
      <span class="method-icon">📄</span>
      <span class="method-name">PDF Text</span>
      <span class="method-desc">Extraer texto embebido del PDF</span>
    </button>

    <button
      type="button"
      class="method-option"
      onclick={() => handleReprocess('qr')}
      disabled={processing}
    >
      <span class="method-icon">📱</span>
      <span class="method-name">QR</span>
      <span class="method-desc">Leer código QR de AFIP</span>
    </button>
  </div>
</Dialog>

<style>
  .source-comparison {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  .columns {
    display: flex;
    gap: 0;
  }

  .source-column {
    display: flex;
    flex-direction: column;
    min-width: 160px;
    flex: 1;
  }

  .source-column.file {
    border-right: 1px solid var(--color-border);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
    height: 36px;
  }

  .source-icon {
    font-size: var(--font-size-sm);
  }

  .source-title {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
  }

  .method-badge {
    font-size: 9px;
    padding: 1px 4px;
    border-radius: var(--radius-sm);
    background: var(--color-neutral-200);
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }

  .confidence-badge {
    margin-left: auto;
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: var(--radius-full);
  }

  .confidence-badge.high {
    background: var(--color-success-100, #dcfce7);
    color: var(--color-success-700, #15803d);
  }

  .confidence-badge.medium {
    background: var(--color-warning-100, #fef3c7);
    color: var(--color-warning-700, #b45309);
  }

  .confidence-badge.low {
    background: var(--color-error-100, #fee2e2);
    color: var(--color-error-700, #b91c1c);
  }

  .status-badge {
    margin-left: auto;
    font-size: var(--font-size-xs);
    padding: 2px 6px;
    border-radius: var(--radius-full);
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
  }

  .status-badge.pending {
    background: var(--color-warning-100, #fef3c7);
    color: var(--color-warning-700, #b45309);
  }

  /* Fields - altura fija por campo para alinear con indicadores */
  .fields {
    padding: var(--spacing-2) var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
  }

  .field {
    display: flex;
    flex-direction: column;
    height: 32px;
    justify-content: center;
  }

  .field-label {
    font-size: 9px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    line-height: 1;
  }

  .field-value {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .field-value.mono {
    font-family: var(--font-mono);
    font-size: var(--font-size-xs);
  }

  /* Match column */
  .match-column {
    display: flex;
    flex-direction: column;
    padding: var(--spacing-2) var(--spacing-2);
    background: var(--color-neutral-50);
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    flex-shrink: 0;
  }

  .match-indicators {
    display: flex;
    flex-direction: column;
    gap: 0;
    align-items: center;
    /* Offset para el header */
    margin-top: 36px;
  }

  .match-row {
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .match-spacer {
    display: block;
  }

  /* Actions */
  .column-actions {
    display: flex;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    justify-content: flex-end;
    align-items: center;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: all var(--transition-fast);
  }

  .icon-btn:hover:not(:disabled) {
    border-color: var(--color-primary-300);
    background: var(--color-primary-50);
  }

  .icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Dialog content */
  .dialog-text {
    margin: 0 0 var(--spacing-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .method-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .method-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .method-option:hover:not(:disabled) {
    border-color: var(--color-primary-300);
    background: var(--color-primary-50);
  }

  .method-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .method-icon {
    font-size: var(--font-size-xl);
  }

  .method-name {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .method-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .source-comparison {
      width: 100%;
    }

    .columns {
      flex-direction: column;
    }

    .source-column {
      width: 100%;
    }

    .source-column.file {
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .match-column {
      flex-direction: row;
      padding: var(--spacing-2);
      border-right: none;
      border-bottom: 1px solid var(--color-border);
    }

    .match-indicators {
      flex-direction: row;
      margin-top: 0;
      gap: var(--spacing-3);
    }

    .match-row {
      height: auto;
    }

    .method-desc {
      display: none;
    }
  }
</style>
