<script lang="ts">
  /**
   * Comparación lado a lado de datos de archivo (OCR) vs expected.
   *
   * Diseño: títulos arriba del contenido, más compacto.
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
</script>

<div class="source-comparison">
  <div class="columns">
    <!-- Columna Archivo -->
    {#if hasFile}
      <div class="source-column file">
        <div class="column-header">
          <span class="source-icon">📦</span>
          <span class="source-title">Archivo (OCR)</span>
          {#if confidenceLevel}
            <span class="confidence-badge {confidenceLevel.class}">
              {file?.extractionConfidence}%
            </span>
          {/if}
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label">CUIT</span>
            <span class="field-value">{file?.extractedCuit || '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Tipo</span>
            <span class="field-value">{getFriendlyType(file?.extractedType)}</span>
          </div>
          <div class="field">
            <span class="field-label">Número</span>
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
            <Button variant="ghost" size="sm" onclick={onreprocess} disabled={processing}>
              🔄 Reprocesar
            </Button>
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
          <MatchIndicator left={file?.extractedCuit} right={expected?.cuit} type="cuit" />
          <MatchIndicator left={file?.extractedType} right={expected?.invoiceType} type="exact" />
          <MatchIndicator
            left={`${file?.extractedPointOfSale}-${file?.extractedInvoiceNumber}`}
            right={`${expected?.pointOfSale}-${expected?.invoiceNumber}`}
            type="exact"
          />
          <MatchIndicator left={file?.extractedDate} right={expected?.issueDate} type="date" />
          <MatchIndicator left={file?.extractedTotal} right={expected?.total} type="amount" />
        </div>
      </div>
    {/if}

    <!-- Columna Expected -->
    {#if hasExpected}
      <div class="source-column expected">
        <div class="column-header">
          <span class="source-icon">📋</span>
          <span class="source-title">Expected #{expected?.id}</span>
          {#if expected?.status}
            <span class="status-badge {expected.status}">{expected.status}</span>
          {/if}
        </div>

        <div class="fields">
          <div class="field">
            <span class="field-label">CUIT</span>
            <span class="field-value">{expected?.cuit || '—'}</span>
          </div>
          <div class="field">
            <span class="field-label">Tipo</span>
            <span class="field-value">{getFriendlyType(expected?.invoiceType)}</span>
          </div>
          <div class="field">
            <span class="field-label">Número</span>
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
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .source-column.file {
    border-right: 1px solid var(--color-border);
  }

  .column-header {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
  }

  .source-icon {
    font-size: var(--font-size-base);
  }

  .source-title {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
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

  /* Fields - stacked layout */
  .fields {
    padding: var(--spacing-3);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    flex: 1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .field-label {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .field-value {
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .field-value.mono {
    font-family: 'Monaco', 'Menlo', monospace;
  }

  /* Match column */
  .match-column {
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: var(--spacing-3) var(--spacing-2);
    background: var(--color-neutral-50);
    border-right: 1px solid var(--color-border);
  }

  .match-indicators {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    align-items: center;
    /* Alinear con los campos - offset del header */
    padding-top: calc(var(--spacing-3) + var(--font-size-sm) + var(--spacing-2));
  }

  /* Actions */
  .column-actions {
    display: flex;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border-top: 1px solid var(--color-border);
    background: var(--color-surface-alt);
    justify-content: flex-end;
  }

  /* Responsive */
  @media (max-width: 640px) {
    .columns {
      flex-direction: column;
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
      padding-top: 0;
      gap: var(--spacing-3);
    }
  }
</style>
