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
  import CategorySelect from './CategorySelect.svelte';
  import Button from './ui/Button.svelte';
  import ReprocessDialog, { type ExtractionMethod } from './ReprocessDialog.svelte';
  import { getFriendlyType, formatCurrency, formatDateShort, formatCuit } from '$lib/formatters';
  import { emitterService, type ResolvedEmitter } from '$lib/services/EmitterService';
  import { format } from 'date-fns';
  import { es } from 'date-fns/locale';
  import { Package, ClipboardList, RefreshCw, Search, ChevronDown, Check } from 'lucide-svelte';
  import { Select as SelectBuilder } from 'melt/builders';

  type Category = {
    id: number;
    description: string;
    color?: string;
  };

  type ExtractionResult = {
    id: number;
    method: string | null;
    confidence: number | null;
    extractedCuit: string | null;
    extractedDate: string | null;
    extractedTotal: number | null;
    extractedType: number | null;
    extractedPointOfSale: number | null;
    extractedInvoiceNumber: number | null;
    extractedAt: string | null;
    errors: string | null;
  };

  type FileData = {
    extractedCuit?: string | null;
    extractedDate?: string | null;
    extractedTotal?: number | null;
    extractedType?: number | null;
    extractedPointOfSale?: number | null;
    extractedInvoiceNumber?: number | null;
    extractionConfidence?: number | null;
    extractionMethod?: string | null;
    categoryId?: number | null;
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
    categoryId?: number | null;
  };

  type Props = {
    /** Datos extraídos del archivo (OCR) */
    file?: FileData | null;
    /** Datos esperados */
    expected?: ExpectedData | null;
    /** All extraction results for this file (for dropdown) */
    extractions?: ExtractionResult[];
    /** Callback cuando se quiere crear factura desde archivo */
    oncreatefromfile?: () => void;
    /** Callback cuando se quiere crear factura desde expected */
    oncreatefromexpected?: () => void;
    /** Callback para reprocesar con método específico */
    onreprocess?: (method: ExtractionMethod) => void;
    /** Callback para buscar expected manualmente (issue #135) */
    onsearchexpected?: () => void;
    /** Callback cuando el usuario cambia la extracción seleccionada */
    onextractionchange?: (extractionId: number) => void;
    /** Si está procesando algo */
    processing?: boolean;
    /** Lista de categorías disponibles */
    categories?: Category[];
    /** Callback cuando cambia la categoría del archivo */
    onfilecategorychange?: (categoryId: number | null) => void;
    /** Callback cuando cambia la categoría del expected */
    onexpectedcategorychange?: (categoryId: number | null) => void;
  };

  let {
    file,
    expected,
    extractions = [],
    oncreatefromfile,
    oncreatefromexpected,
    onreprocess,
    onsearchexpected,
    onextractionchange,
    processing = false,
    categories = [],
    onfilecategorychange,
    onexpectedcategorychange,
  }: Props = $props();

  // Selected extraction ID (defaults to first/most recent)
  let selectedExtractionId = $state<number | null>(null);

  // Flag para evitar llamar onchange durante sincronización programática
  let isSyncingSelect = false;

  // Melt UI Select for extraction dropdown
  const extractionSelect = new SelectBuilder<number | null>({
    sameWidth: true,
    onValueChange: (newValue) => {
      if (!isSyncingSelect && newValue !== null && newValue !== undefined) {
        selectedExtractionId = newValue;
        onextractionchange?.(newValue);
      }
    },
  });

  // Initialize selectedExtractionId when extractions change
  $effect(() => {
    if (extractions.length > 0 && selectedExtractionId === null) {
      selectedExtractionId = extractions[0].id;
    }
  });

  // Sync select value with selectedExtractionId
  $effect(() => {
    if (selectedExtractionId !== extractionSelect.value) {
      isSyncingSelect = true;
      extractionSelect.value = selectedExtractionId;
      isSyncingSelect = false;
    }
  });

  // Get currently selected extraction
  const selectedExtraction = $derived(
    extractions.find((e) => e.id === selectedExtractionId) ?? extractions[0] ?? null
  );

  // Override file data with selected extraction when available
  const displayedFile = $derived.by<FileData | null>(() => {
    if (selectedExtraction) {
      return {
        extractedCuit: selectedExtraction.extractedCuit,
        extractedDate: selectedExtraction.extractedDate,
        extractedTotal: selectedExtraction.extractedTotal,
        extractedType: selectedExtraction.extractedType,
        extractedPointOfSale: selectedExtraction.extractedPointOfSale,
        extractedInvoiceNumber: selectedExtraction.extractedInvoiceNumber,
        extractionConfidence: selectedExtraction.confidence,
        extractionMethod: selectedExtraction.method,
        categoryId: file?.categoryId,
        emitterName: file?.emitterName,
      };
    }
    return file ?? null;
  });

  // Format extraction option for dropdown
  function formatExtractionOption(ext: ExtractionResult): string {
    const method = ext.method?.toUpperCase() ?? 'UNKNOWN';
    const methodLabel =
      method === 'OCR'
        ? 'OCR'
        : method === 'PDF_TEXT'
          ? 'PDF'
          : method === 'PDF_TEXT+OCR'
            ? 'PDF+OCR'
            : method;
    const confidence = ext.confidence ?? 0;
    const date = ext.extractedAt
      ? format(new Date(ext.extractedAt), 'dd/MM HH:mm', { locale: es })
      : '';
    return `${methodLabel} (${confidence}%) - ${date}`;
  }

  const hasFile = $derived(!!displayedFile);
  const hasExpected = $derived(!!expected);
  const hasMultipleExtractions = $derived(extractions.length > 1);

  // Resolved emitters (from EmitterService)
  let fileEmitter = $state<ResolvedEmitter | null>(null);
  let expectedEmitter = $state<ResolvedEmitter | null>(null);

  // Resolve emitters when CUITs change
  $effect(() => {
    const cuit = displayedFile?.extractedCuit;
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
      ? emitterService.formatDisplay(fileEmitter, displayedFile?.emitterName)
      : displayedFile?.emitterName || '—'
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
    const method = displayedFile?.extractionMethod?.toUpperCase();
    if (!method) return null;
    if (method === 'OCR') return 'OCR';
    if (method === 'PDF_TEXT') return 'PDF Text';
    if (method === 'PDF_TEXT+OCR') return 'PDF+OCR';
    if (method === 'QR') return 'QR';
    return method;
  });

  // Confidence badge
  const confidenceLevel = $derived.by(() => {
    const conf = displayedFile?.extractionConfidence;
    if (conf == null) return null;
    if (conf >= 90) return { label: 'Alta', class: 'high' };
    if (conf >= 70) return { label: 'Media', class: 'medium' };
    return { label: 'Baja', class: 'low' };
  });

  function handleReprocess(method: ExtractionMethod) {
    reprocessDialogOpen = false;
    onreprocess?.(method);
  }

  function closeReprocessDialog() {
    reprocessDialogOpen = false;
  }
</script>

<div class="source-comparison">
  <div class="columns">
    <!-- Columna Archivo -->
    {#if hasFile}
      <div class="source-column file">
        <div class="column-header">
          <div class="header-title-row">
            <span class="source-icon"><Package size={16} /></span>
            <span class="source-title">Archivo</span>
            {#if !hasMultipleExtractions && currentMethod}
              <span class="method-badge">{currentMethod}</span>
              {#if confidenceLevel}
                <span class="confidence-badge {confidenceLevel.class}">
                  {displayedFile?.extractionConfidence}%
                </span>
              {/if}
            {/if}
          </div>

          <div class="header-selector-row">
            {#if hasMultipleExtractions}
              <div class="extraction-select-wrapper">
                <button
                  {...extractionSelect.trigger}
                  class="extraction-trigger"
                  disabled={processing}
                >
                  <span class="trigger-text">{formatExtractionOption(selectedExtraction!)}</span>
                  <ChevronDown size={14} />
                </button>

                <div {...extractionSelect.content} class="extraction-content">
                  {#each extractions as ext (ext.id)}
                    <div
                      {...extractionSelect.getOption(ext.id, formatExtractionOption(ext))}
                      class="extraction-option"
                      class:selected={extractionSelect.isSelected(ext.id)}
                    >
                      <span class="option-text">{formatExtractionOption(ext)}</span>
                      {#if extractionSelect.isSelected(ext.id)}
                        <Check size={14} />
                      {/if}
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
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
            <span class="field-value mono">{formatCuit(displayedFile?.extractedCuit)}</span>
          </div>
          <div class="field">
            <span class="field-label">Tipo</span>
            <span class="field-value">{getFriendlyType(displayedFile?.extractedType)}</span>
          </div>
          <div class="field">
            <span class="field-label">Numero</span>
            <span class="field-value mono"
              >{formatInvoiceNum(
                displayedFile?.extractedPointOfSale,
                displayedFile?.extractedInvoiceNumber
              )}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Fecha</span>
            <span class="field-value"
              >{displayedFile?.extractedDate
                ? formatDateShort(displayedFile.extractedDate)
                : '—'}</span
            >
          </div>
          <div class="field">
            <span class="field-label">Total</span>
            <span class="field-value mono">{formatCurrency(displayedFile?.extractedTotal)}</span>
          </div>
          <div class="field">
            <span class="field-label">Categoría</span>
            <span class="field-value">
              {#if categories.length > 0 && onfilecategorychange}
                <CategorySelect
                  {categories}
                  value={displayedFile?.categoryId ?? null}
                  onchange={onfilecategorychange}
                  disabled={processing}
                />
              {:else}
                {categories.find((c) => c.id === displayedFile?.categoryId)?.description ?? '—'}
              {/if}
            </span>
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
              <RefreshCw size={14} />
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

    <!-- Indicador de Match (centro) - siempre visible para mantener layout -->
    {#if hasFile}
      <div class="match-column">
        <div class="match-indicators">
          <div class="match-row"><span class="match-spacer"></span></div>
          {#if hasExpected}
            <div class="match-row">
              <MatchIndicator
                left={displayedFile?.extractedCuit}
                right={expected?.cuit}
                type="cuit"
              />
            </div>
            <div class="match-row">
              <MatchIndicator
                left={displayedFile?.extractedType}
                right={expected?.invoiceType}
                type="exact"
              />
            </div>
            <div class="match-row">
              <MatchIndicator
                left={`${displayedFile?.extractedPointOfSale}-${displayedFile?.extractedInvoiceNumber}`}
                right={`${expected?.pointOfSale}-${expected?.invoiceNumber}`}
                type="exact"
              />
            </div>
            <div class="match-row">
              <MatchIndicator
                left={displayedFile?.extractedDate}
                right={expected?.issueDate}
                type="date"
              />
            </div>
            <div class="match-row">
              <MatchIndicator
                left={displayedFile?.extractedTotal}
                right={expected?.total}
                type="amount"
              />
            </div>
            <div class="match-row">
              <MatchIndicator
                left={displayedFile?.categoryId}
                right={expected?.categoryId}
                type="exact"
              />
            </div>
          {:else}
            <!-- Placeholders vacíos para mantener altura -->
            <div class="match-row"></div>
            <div class="match-row"></div>
            <div class="match-row"></div>
            <div class="match-row"></div>
            <div class="match-row"></div>
            <div class="match-row"></div>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Columna Expected o Sin coincidencias -->
    {#if hasExpected}
      <div class="source-column expected">
        <div class="column-header">
          <div class="header-title-row">
            <span class="source-icon"><ClipboardList size={16} /></span>
            <span class="source-title">#{expected?.id}</span>
            {#if expected?.status}
              <span class="status-badge {expected.status}">{expected.status}</span>
            {/if}
          </div>

          <div class="header-selector-row">
            <!-- Spacer para alinear con la columna archivo -->
          </div>
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
            <span class="field-value mono">{formatCuit(expected?.cuit)}</span>
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
          <div class="field">
            <span class="field-label">Categoría</span>
            <span class="field-value">
              {#if categories.length > 0 && onexpectedcategorychange}
                <CategorySelect
                  {categories}
                  value={expected?.categoryId ?? null}
                  onchange={onexpectedcategorychange}
                  disabled={processing}
                />
              {:else}
                {categories.find((c) => c.id === expected?.categoryId)?.description ?? '—'}
              {/if}
            </span>
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
    {:else if hasFile}
      <!-- Sin coincidencias - mostrar panel vacío con opción de buscar -->
      <div class="source-column no-match">
        <div class="column-header">
          <div class="header-title-row">
            <span class="source-icon"><ClipboardList size={16} /></span>
            <span class="source-title">Expected</span>
          </div>

          <div class="header-selector-row">
            <!-- Spacer para alinear con la columna archivo -->
          </div>
        </div>

        <div class="no-match-content">
          <div class="no-match-icon"><Search size={32} strokeWidth={1.5} /></div>
          <p class="no-match-text">Sin coincidencias</p>
          <p class="no-match-hint">No se encontró factura esperada que coincida con estos datos</p>
          {#if onsearchexpected}
            <Button variant="secondary" size="sm" onclick={onsearchexpected} disabled={processing}>
              Buscar manualmente
            </Button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<!-- Diálogo de reprocesamiento -->
<ReprocessDialog
  bind:open={reprocessDialogOpen}
  onselect={handleReprocess}
  onclose={closeReprocessDialog}
  {processing}
/>

<style>
  .source-comparison {
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    /* No overflow:hidden para que el dropdown de categoría no se corte */
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
    flex-direction: column;
    background: var(--color-surface-alt);
    border-bottom: 1px solid var(--color-border);
  }

  .header-title-row {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    height: 36px;
  }

  .header-selector-row {
    padding: 0 var(--spacing-3) var(--spacing-2);
    height: 32px; /* Altura fija para alinear columnas */
    display: flex;
    align-items: center;
  }

  .source-icon {
    display: flex;
    align-items: center;
    color: var(--color-text-secondary);
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

  /* Extraction select (Melt UI) */
  .extraction-select-wrapper {
    position: relative;
    width: 100%;
  }

  .extraction-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    width: 100%;
    padding: var(--spacing-1) var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all var(--transition-fast);
  }

  .extraction-trigger:hover:not(:disabled) {
    border-color: var(--color-primary-400);
    background: var(--color-surface-alt);
  }

  .extraction-trigger:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .extraction-trigger:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .extraction-trigger .trigger-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .extraction-content {
    position: absolute;
    left: 0;
    top: 100%;
    z-index: var(--z-dropdown);
    min-width: var(--melt-invoker-width);
    width: fit-content;
    max-width: max(var(--melt-invoker-width), 280px);
    margin-top: var(--spacing-1);
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    max-height: 200px;
    overflow-y: auto;
    padding: var(--spacing-1);
  }

  .extraction-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-sm);
    cursor: pointer;
    font-size: var(--font-size-sm);
    transition: background-color var(--transition-fast);
  }

  .extraction-option:hover {
    background: var(--color-surface-alt);
  }

  .extraction-option[data-highlighted] {
    background: var(--color-primary-50);
  }

  .extraction-option.selected {
    background: var(--color-primary-100);
    font-weight: var(--font-weight-medium);
  }

  .extraction-option .option-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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

  /* Fields - spacing relajado como InvoiceCard */
  .fields {
    padding: var(--spacing-4);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    flex: 1;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .field-label {
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .field-value {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    line-height: 1.4;
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
    padding: var(--spacing-4) var(--spacing-2);
    background: var(--color-neutral-50);
    border-left: 1px solid var(--color-border);
    border-right: 1px solid var(--color-border);
    flex-shrink: 0;
    min-width: 32px;
  }

  .match-indicators {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    align-items: center;
    /* Offset para el header (36px title + 32px selector row) */
    margin-top: 68px;
  }

  .match-row {
    /* Altura consistente con los campos */
    min-height: 40px;
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

  /* No match column */
  .source-column.no-match {
    background: var(--color-neutral-50);
  }

  .no-match-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-6) var(--spacing-4);
    flex: 1;
    text-align: center;
    gap: var(--spacing-2);
  }

  .no-match-icon {
    color: var(--color-text-tertiary);
    opacity: 0.5;
  }

  .no-match-text {
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .no-match-hint {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: 0;
    max-width: 180px;
    line-height: 1.4;
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
      min-height: auto;
    }
  }
</style>
