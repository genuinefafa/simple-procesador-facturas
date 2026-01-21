<script lang="ts">
  /**
   * Comparación lado a lado de datos de archivo (OCR) vs expected.
   *
   * Muestra los valores de ambas fuentes con indicadores de coincidencia
   * y acciones para crear factura desde cualquiera de las fuentes.
   */

  import MatchIndicator from './MatchIndicator.svelte';
  import Button from './ui/Button.svelte';
  import { getFriendlyType, formatCurrency, formatDateShort } from '$lib/formatters';

  type FileData = {
    extractedCuit?: string | null;
    extractedDate?: string | null;
    extractedTotal?: number | null;
    extractedType?: number | null;
    extractedPointOfSale?: number | null;
    extractedInvoiceNumber?: number | null;
    extractionConfidence?: number | null;
  };

  type ExpectedData = {
    id: number;
    cuit: string;
    emitterName?: string | null;
    issueDate: string;
    invoiceType: number | null;
    pointOfSale: number;
    invoiceNumber: number;
    total?: number | null;
    status?: string;
  };

  type Category = {
    id: number;
    key: string;
    description: string;
  };

  type Props = {
    /** Datos extraídos del archivo (OCR) */
    file?: FileData | null;
    /** Datos esperados */
    expected?: ExpectedData | null;
    /** Categorías disponibles */
    categories?: Category[];
    /** Callback cuando se quiere crear factura desde archivo */
    oncreatefromfile?: () => void;
    /** Callback cuando se quiere crear factura desde expected */
    oncreatefromexpected?: () => void;
    /** Callback para reprocesar OCR */
    onreprocess?: () => void;
    /** Si está procesando algo */
    processing?: boolean;
  };

  let {
    file,
    expected,
    categories = [],
    oncreatefromfile,
    oncreatefromexpected,
    onreprocess,
    processing = false,
  }: Props = $props();

  const hasFile = $derived(!!file);
  const hasExpected = $derived(!!expected);

  // Formateadores
  const formatInvoiceNum = (pv: number | null | undefined, num: number | null | undefined) => {
    if (pv == null && num == null) return '—';
    const pvStr = pv != null ? String(pv).padStart(4, '0') : '----';
    const numStr = num != null ? String(num).padStart(8, '0') : '--------';
    return `${pvStr}-${numStr}`;
  };

  // Confidence badge
  const confidenceLevel = $derived.by(() => {
    const conf = file?.extractionConfidence;
    if (conf == null) return null;
    if (conf >= 90) return { label: 'Alta', class: 'high' };
    if (conf >= 70) return { label: 'Media', class: 'medium' };
    return { label: 'Baja', class: 'low' };
  });

  // Valores para comparación de número de factura
  const fileInvoiceNum = $derived(
    hasFile ? `${file?.extractedPointOfSale ?? ''}-${file?.extractedInvoiceNumber ?? ''}` : ''
  );
  const expectedInvoiceNum = $derived(
    hasExpected ? `${expected?.pointOfSale}-${expected?.invoiceNumber}` : ''
  );
</script>

<div class="source-comparison">
  <!-- Headers -->
  <div class="comparison-header">
    {#if hasFile}
      <div class="source-header file">
        <span class="source-icon">📦</span>
        <span class="source-title">Archivo (OCR)</span>
        {#if confidenceLevel}
          <span class="confidence-badge {confidenceLevel.class}">
            {file?.extractionConfidence}% {confidenceLevel.label}
          </span>
        {/if}
      </div>
    {/if}

    {#if hasFile && hasExpected}
      <div class="match-column-header">Match</div>
    {/if}

    {#if hasExpected}
      <div class="source-header expected">
        <span class="source-icon">📋</span>
        <span class="source-title">Expected #{expected?.id}</span>
        {#if expected?.status}
          <span class="status-badge {expected.status}">{expected.status}</span>
        {/if}
      </div>
    {/if}
  </div>

  <!-- Rows de comparación -->
  <div class="comparison-rows">
    <!-- CUIT -->
    <div class="comparison-row">
      <div class="row-label">CUIT</div>
      {#if hasFile}
        <div class="value file">{file?.extractedCuit || '—'}</div>
      {/if}
      {#if hasFile && hasExpected}
        <div class="match-cell">
          <MatchIndicator left={file?.extractedCuit} right={expected?.cuit} type="cuit" />
        </div>
      {/if}
      {#if hasExpected}
        <div class="value expected">{expected?.cuit || '—'}</div>
      {/if}
    </div>

    <!-- Tipo -->
    <div class="comparison-row">
      <div class="row-label">Tipo</div>
      {#if hasFile}
        <div class="value file">{getFriendlyType(file?.extractedType)}</div>
      {/if}
      {#if hasFile && hasExpected}
        <div class="match-cell">
          <MatchIndicator left={file?.extractedType} right={expected?.invoiceType} type="exact" />
        </div>
      {/if}
      {#if hasExpected}
        <div class="value expected">{getFriendlyType(expected?.invoiceType)}</div>
      {/if}
    </div>

    <!-- Número -->
    <div class="comparison-row">
      <div class="row-label">Número</div>
      {#if hasFile}
        <div class="value file mono">
          {formatInvoiceNum(file?.extractedPointOfSale, file?.extractedInvoiceNumber)}
        </div>
      {/if}
      {#if hasFile && hasExpected}
        <div class="match-cell">
          <MatchIndicator left={fileInvoiceNum} right={expectedInvoiceNum} type="exact" />
        </div>
      {/if}
      {#if hasExpected}
        <div class="value expected mono">
          {formatInvoiceNum(expected?.pointOfSale, expected?.invoiceNumber)}
        </div>
      {/if}
    </div>

    <!-- Fecha -->
    <div class="comparison-row">
      <div class="row-label">Fecha</div>
      {#if hasFile}
        <div class="value file">
          {file?.extractedDate ? formatDateShort(file.extractedDate) : '—'}
        </div>
      {/if}
      {#if hasFile && hasExpected}
        <div class="match-cell">
          <MatchIndicator left={file?.extractedDate} right={expected?.issueDate} type="date" />
        </div>
      {/if}
      {#if hasExpected}
        <div class="value expected">
          {expected?.issueDate ? formatDateShort(expected.issueDate) : '—'}
        </div>
      {/if}
    </div>

    <!-- Total -->
    <div class="comparison-row">
      <div class="row-label">Total</div>
      {#if hasFile}
        <div class="value file mono">
          {formatCurrency(file?.extractedTotal)}
        </div>
      {/if}
      {#if hasFile && hasExpected}
        <div class="match-cell">
          <MatchIndicator left={file?.extractedTotal} right={expected?.total} type="amount" />
        </div>
      {/if}
      {#if hasExpected}
        <div class="value expected mono">
          {formatCurrency(expected?.total)}
        </div>
      {/if}
    </div>
  </div>

  <!-- Acciones -->
  <div class="comparison-actions">
    {#if hasFile}
      <div class="action-section file">
        {#if onreprocess}
          <Button variant="ghost" size="sm" onclick={onreprocess} disabled={processing}>
            Reprocesar
          </Button>
        {/if}
        {#if oncreatefromfile}
          <Button variant="primary" size="sm" onclick={oncreatefromfile} disabled={processing}>
            Crear factura
          </Button>
        {/if}
      </div>
    {/if}

    {#if hasFile && hasExpected}
      <div class="action-spacer"></div>
    {/if}

    {#if hasExpected}
      <div class="action-section expected">
        {#if oncreatefromexpected}
          <Button variant="primary" size="sm" onclick={oncreatefromexpected} disabled={processing}>
            Crear factura
          </Button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .source-comparison {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    overflow: hidden;
  }

  /* Headers */
  .comparison-header {
    display: flex;
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
  }

  .source-header {
    flex: 1;
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
  }

  .source-header.file {
    border-right: 1px solid var(--color-border);
  }

  .source-icon {
    font-size: var(--font-size-lg);
  }

  .source-title {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
  }

  .match-column-header {
    width: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    background: var(--color-neutral-50);
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
  }

  .confidence-badge {
    font-size: var(--font-size-xs);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-full);
    margin-left: auto;
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
    font-size: var(--font-size-xs);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-full);
    margin-left: auto;
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
  }

  .status-badge.pending {
    background: var(--color-warning-100, #fef3c7);
    color: var(--color-warning-700, #b45309);
  }

  .status-badge.discrepancy {
    background: var(--color-error-100, #fee2e2);
    color: var(--color-error-700, #b91c1c);
  }

  /* Rows */
  .comparison-rows {
    padding: var(--spacing-2) 0;
  }

  .comparison-row {
    display: flex;
    align-items: center;
    padding: var(--spacing-2) var(--spacing-3);
  }

  .comparison-row:hover {
    background: var(--color-surface-alt);
  }

  .row-label {
    width: 80px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .value {
    flex: 1;
    font-size: var(--font-size-sm);
    padding: 0 var(--spacing-2);
  }

  .value.file {
    text-align: right;
    padding-right: var(--spacing-3);
  }

  .value.expected {
    padding-left: var(--spacing-3);
  }

  .value.mono {
    font-family: 'Monaco', 'Menlo', monospace;
  }

  .match-cell {
    width: 3rem;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  /* Actions */
  .comparison-actions {
    display: flex;
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    padding: var(--spacing-3);
  }

  .action-section {
    flex: 1;
    display: flex;
    gap: var(--spacing-2);
  }

  .action-section.file {
    justify-content: flex-end;
    padding-right: var(--spacing-2);
  }

  .action-section.expected {
    padding-left: var(--spacing-2);
  }

  .action-spacer {
    width: 3rem;
    flex-shrink: 0;
  }
</style>
