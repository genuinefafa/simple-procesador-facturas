<script lang="ts">
  /**
   * Creates an invoice by linking an ARCA expected invoice with its file.
   *
   * Thin wrapper: ARCA data is read-only and the breakdown is the regular
   * InvoiceTaxBreakdown editor in draft mode (ARCA lines locked, "otros
   * tributos" editable). Fixed lines plus the edited ones must add up to the
   * ARCA total.
   */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import { Loader2 } from '$lib/components/icons';
  import { formatCuit, formatCurrency, formatDateShort, formatInvoiceLabel } from '$lib/formatters';
  import { emitterService } from '$lib/services/EmitterService';
  import { expectedInvoicesService } from '$lib/services/ExpectedInvoicesService';
  import CategorySelect from './CategorySelect.svelte';
  import InvoiceTaxBreakdown from './InvoiceTaxBreakdown.svelte';
  import type { TaxLineInput } from './InvoiceTaxBreakdown.types';
  import type { ArcaBreakdownResponse, CreateFromArcaExpected } from './CreateFromArcaPanel.types';

  type Category = { id: number; description: string; color?: string };

  interface Props {
    expected: CreateFromArcaExpected;
    fileId: number;
    categories?: Category[];
    /** Initial category (usually the one of the expected invoice or file) */
    categoryId?: number | null;
    /** Called with the new invoice id. Defaults to navigating to its detail page. */
    oncreated?: (invoiceId: number) => void;
    oncancel?: () => void;
  }

  let {
    expected,
    fileId,
    categories = [],
    categoryId = null,
    oncreated,
    oncancel,
  }: Props = $props();

  let breakdown = $state<ArcaBreakdownResponse | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let selectedCategoryId = $state<number | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let emitterName = $state<string | null>(null);
  // Draft reported by the editor (editable lines only)
  let otherTaxLines = $state<TaxLineInput[]>([]);
  let draftValid = $state(false);

  // Primitives on purpose: the parent hands a NEW `expected` object on every data
  // refresh (e.g. after changing the category). Depending on the object would
  // re-run the load and wipe what the user typed; a derived primitive only
  // notifies when the id really changes.
  const expectedId = $derived(expected.id);
  const expectedCuit = $derived(expected.cuit);
  const defaultCategoryId = $derived(categoryId ?? expected.categoryId ?? null);

  const invoiceType = $derived(breakdown?.invoiceType ?? expected.invoiceType);
  const canSubmit = $derived(breakdown !== null && !submitting && draftValid);

  async function load(id: number): Promise<void> {
    loading = true;
    loadError = null;
    breakdown = null;
    submitError = null;
    otherTaxLines = [];
    draftValid = false;
    const result = await expectedInvoicesService.getArcaBreakdown(id);
    // Ignore stale responses when the expected changed meanwhile
    if (id !== expectedId) return;
    if (result.success && result.data) {
      breakdown = result.data;
    } else {
      loadError = result.error ?? 'No se pudo cargar el desglose informado por ARCA.';
    }
    loading = false;
  }

  // Reload only when the expected really changes
  $effect(() => {
    const id = expectedId;
    untrack(() => {
      void load(id);
    });
  });

  // Keep the category in sync with the expected/file default without touching the lines
  $effect(() => {
    selectedCategoryId = defaultCategoryId;
  });

  $effect(() => {
    const cuit = expectedCuit;
    emitterName = null;
    void emitterService.resolve(cuit).then((e) => {
      if (cuit === expectedCuit && e.exists) emitterName = e.displayName;
    });
  });

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    submitting = true;
    submitError = null;
    const result = await expectedInvoicesService.createInvoiceFromExpected(expected.id, {
      fileId,
      categoryId: selectedCategoryId,
      otherTaxLines,
    });
    if (result.success && result.data) {
      const id = result.data.invoice.id;
      if (oncreated) oncreated(id);
      else await goto(`/comprobantes/factura:${id}`);
      return;
    }
    submitError = result.error ?? 'No se pudo crear la factura.';
    submitting = false;
  }
</script>

<div class="panel">
  <header class="panel-header">
    <h3 class="title">Crear factura</h3>
    <p class="muted">Datos de ARCA, no se modifican.</p>
  </header>

  <dl class="summary">
    <div class="item wide">
      <dt>Emisor</dt>
      <dd>{emitterName ?? expected.emitterName ?? '—'} · {formatCuit(expected.cuit)}</dd>
    </div>
    <div class="item">
      <dt>Comprobante</dt>
      <dd>{formatInvoiceLabel(invoiceType, expected.pointOfSale, expected.invoiceNumber)}</dd>
    </div>
    <div class="item">
      <dt>Fecha</dt>
      <dd>{formatDateShort(expected.issueDate)}</dd>
    </div>
    <div class="item">
      <dt>Total ARCA</dt>
      <dd class="num strong">{formatCurrency(breakdown?.total ?? expected.total)}</dd>
    </div>
  </dl>

  {#if loading}
    <p class="muted loading"><Loader2 size={14} /> Cargando desglose de ARCA...</p>
  {:else if loadError}
    <p class="error-text" role="alert">{loadError}</p>
  {:else if breakdown}
    {#if breakdown.arcaOtherTaxes > 0}
      <p class="muted">Otros tributos puede agrupar distintos conceptos; se sugiere detallarlos.</p>
    {/if}
    {#key breakdown.expectedId}
      <InvoiceTaxBreakdown
        total={breakdown.total}
        invoiceType={breakdown.invoiceType}
        lockedLines={breakdown.fixed}
        initialLines={breakdown.others}
        ondraftchange={(lines, valid) => {
          otherTaxLines = lines;
          draftValid = valid;
        }}
      />
    {/key}

    <div class="category">
      <span class="category-label">Categoría</span>
      <CategorySelect
        {categories}
        value={selectedCategoryId}
        onchange={(id) => (selectedCategoryId = id)}
        disabled={submitting}
      />
    </div>

    {#if submitError}
      <p class="error-text" role="alert">{submitError}</p>
    {/if}
  {/if}

  <footer class="actions">
    {#if oncancel}
      <Button variant="ghost" onclick={oncancel} disabled={submitting}>Cancelar</Button>
    {/if}
    <Button variant="primary" onclick={submit} disabled={!canSubmit}>
      {submitting ? 'Creando...' : 'Crear factura'}
    </Button>
  </footer>
</div>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    /* No frame: the parent .section already draws it (avoid double box) */
    min-width: 0;
  }

  .title {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .muted {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .loading {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .error-text {
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: var(--spacing-3);
    margin: 0;
  }

  .item.wide {
    grid-column: 1 / -1;
  }

  .item dt {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .item dd {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .num {
    font-variant-numeric: tabular-nums;
  }

  .strong {
    font-weight: var(--font-weight-semibold);
  }

  .category {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  .category-label {
    color: var(--color-text-secondary);
  }

  .actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
  }
</style>
