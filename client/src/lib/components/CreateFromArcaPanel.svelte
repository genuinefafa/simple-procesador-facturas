<script lang="ts">
  /**
   * Creates an invoice by linking an ARCA expected invoice with its file.
   *
   * Everything comes from ARCA and is read-only. The user can only choose the
   * category and split the "otros tributos" amount into lines (perceptions of
   * several jurisdictions are lumped together by ARCA). Fixed lines plus the
   * split lines must add up to the ARCA total.
   */
  import { untrack } from 'svelte';
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import { AlertTriangle, Loader2, Plus, X } from '$lib/components/icons';
  import {
    doesNotItemizeVat,
    formatCuit,
    formatCurrency,
    formatDateShort,
    formatInvoiceLabel,
  } from '$lib/formatters';
  import { emitterService } from '$lib/services/EmitterService';
  import { expectedInvoicesService } from '$lib/services/ExpectedInvoicesService';
  import CategorySelect from './CategorySelect.svelte';
  import TaxLineSelect from './TaxLineSelect.svelte';
  import {
    CONCEPT_OPTIONS,
    EDITOR_CONCEPT_OPTIONS,
    TAX_SUM_TOLERANCE,
    type TaxLineConcept,
    type TaxLineInput,
  } from './InvoiceTaxBreakdown.types';
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

  interface Row {
    key: number;
    concept: TaxLineConcept | '';
    rate: string;
    amount: string;
    label: string;
  }

  let breakdown = $state<ArcaBreakdownResponse | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let rows = $state<Row[]>([]);
  let selectedCategoryId = $state<number | null>(null);
  let submitting = $state(false);
  let submitError = $state<string | null>(null);
  let emitterName = $state<string | null>(null);
  let nextKey = 1;

  const FREE_RATE_CONCEPTS: readonly TaxLineConcept[] = [
    'VAT_PERCEPTION',
    'IIBB_PERCEPTION',
    'OTHER_TAXES',
  ];

  const invoiceType = $derived(breakdown?.invoiceType ?? expected.invoiceType);
  // B/C/E/no letter do not itemize VAT: only "other taxes" can be edited there
  const noVat = $derived(doesNotItemizeVat(invoiceType));
  const conceptOptions = $derived(
    EDITOR_CONCEPT_OPTIONS.filter((o) =>
      noVat
        ? o.value === 'OTHER_TAXES'
        : o.value === 'VAT_PERCEPTION' || o.value === 'IIBB_PERCEPTION' || o.value === 'OTHER_TAXES'
    )
  );

  function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  function formatRate(rate: number): string {
    return String(rate).replace('.', ',');
  }

  // Inputs accept "1234,56" or "1234.56"
  function parseLoose(raw: string): number {
    const t = raw.trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  }

  function conceptLabel(line: TaxLineInput): string {
    const name = CONCEPT_OPTIONS.find((o) => o.value === line.concept)?.label ?? line.concept;
    if (line.concept === 'NET_TAXED' && line.rate !== null) {
      return `${name} · IVA ${formatRate(line.rate)}%`;
    }
    if (line.concept === 'VAT' && line.rate !== null) return `IVA ${formatRate(line.rate)}%`;
    return line.rate !== null ? `${name} ${formatRate(line.rate)}%` : name;
  }

  function toRow(line: TaxLineInput): Row {
    return {
      key: nextKey++,
      concept: line.concept,
      rate: line.rate === null ? '' : formatRate(line.rate),
      amount: String(line.amount),
      label: line.label ?? '',
    };
  }

  function addRow(): void {
    rows.push({ key: nextKey++, concept: '', rate: '', amount: '', label: '' });
  }

  function removeRow(key: number): void {
    rows = rows.filter((r) => r.key !== key);
  }

  const rowErrors = $derived(
    rows.map((row) => {
      if (!row.concept) return 'Seleccione un concepto';
      if (row.rate.trim() !== '') {
        const pct = parseLoose(row.rate);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return 'El porcentaje debe ser mayor a 0 y hasta 100';
        }
      }
      const amount = parseLoose(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) return 'Ingrese un monto mayor a cero';
      if (row.label.trim().length > 100) return 'La descripción admite hasta 100 caracteres';
      return null;
    })
  );

  const fixedSum = $derived(round2((breakdown?.fixed ?? []).reduce((s, l) => s + l.amount, 0)));
  const othersSum = $derived(
    round2(
      rows.reduce((s, r) => {
        const n = parseLoose(r.amount);
        return s + (Number.isFinite(n) ? n : 0);
      }, 0)
    )
  );
  const totalSum = $derived(round2(fixedSum + othersSum));
  const diff = $derived(breakdown ? round2(breakdown.total - totalSum) : 0);
  const sumOk = $derived(breakdown !== null && Math.abs(diff) <= TAX_SUM_TOLERANCE);

  const canSubmit = $derived(
    breakdown !== null && !submitting && sumOk && rowErrors.every((e) => e === null)
  );

  async function load(expectedId: number, initialCategory: number | null): Promise<void> {
    loading = true;
    loadError = null;
    breakdown = null;
    submitError = null;
    selectedCategoryId = initialCategory;
    const result = await expectedInvoicesService.getArcaBreakdown(expectedId);
    // Ignore stale responses when the expected changed meanwhile
    if (expectedId !== expected.id) return;
    if (result.success && result.data) {
      breakdown = result.data;
      rows = result.data.others.map(toRow);
    } else {
      loadError = result.error ?? 'No se pudo cargar el desglose informado por ARCA.';
      rows = [];
    }
    loading = false;
  }

  // Reload whenever the expected changes (the parent may switch it from the dropdown)
  $effect(() => {
    const id = expected.id;
    untrack(() => {
      void load(id, categoryId ?? expected.categoryId ?? null);
    });
  });

  $effect(() => {
    const cuit = expected.cuit;
    emitterName = null;
    void emitterService.resolve(cuit).then((e) => {
      if (cuit === expected.cuit && e.exists) emitterName = e.displayName;
    });
  });

  function buildPayload(): TaxLineInput[] {
    return rows.map((r) => {
      const concept = r.concept as TaxLineConcept;
      return {
        concept,
        rate: r.rate.trim() !== '' ? parseLoose(r.rate) : null,
        amount: round2(parseLoose(r.amount)),
        label: r.label.trim() ? r.label.trim() : null,
      };
    });
  }

  async function submit(): Promise<void> {
    if (!canSubmit) return;
    submitting = true;
    submitError = null;
    const result = await expectedInvoicesService.createInvoiceFromExpected(expected.id, {
      fileId,
      categoryId: selectedCategoryId,
      otherTaxLines: buildPayload(),
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

  const showFreeFields = (c: TaxLineConcept | ''): boolean =>
    c !== '' && FREE_RATE_CONCEPTS.includes(c);
</script>

<div class="panel">
  <header class="panel-header">
    <h3 class="title">Crear factura desde ARCA</h3>
    <p class="muted">
      Los datos del comprobante provienen de ARCA y no se pueden modificar. Usted puede elegir la
      categoría y detallar los otros tributos.
    </p>
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
    <section class="block" aria-label="Desglose informado por ARCA">
      <h4 class="block-title">Desglose informado por ARCA</h4>
      {#if breakdown.fixed.length === 0}
        <p class="muted">ARCA no informó un desglose para este comprobante.</p>
      {:else}
        <ul class="fixed-lines">
          {#each breakdown.fixed as line, i (i)}
            <li>
              <span>{conceptLabel(line)}</span>
              <span class="num">{formatCurrency(line.amount)}</span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="block" aria-label="Otros tributos">
      <h4 class="block-title">
        Otros tributos
        <span class="muted-inline">ARCA informó {formatCurrency(breakdown.arcaOtherTaxes)}</span>
      </h4>
      <p class="muted">
        Si ARCA agrupó varias percepciones en un solo importe, detállelas aquí. Cada línea admite
        una descripción (por ejemplo, la jurisdicción) y una alícuota opcional.
      </p>

      {#if rows.length > 0}
        <div class="rows">
          {#each rows as row, i (row.key)}
            <div class="row">
              <div class="cell">
                <TaxLineSelect
                  value={row.concept}
                  options={conceptOptions}
                  placeholder="Concepto"
                  ariaLabel="Concepto"
                  onchange={(v) => (row.concept = v as TaxLineConcept)}
                />
              </div>
              <div class="cell">
                {#if showFreeFields(row.concept)}
                  <input
                    type="text"
                    class="field"
                    placeholder={row.concept === 'IIBB_PERCEPTION'
                      ? 'Jurisdicción (ej. BA)'
                      : 'Descripción'}
                    aria-label="Descripción"
                    maxlength="100"
                    bind:value={row.label}
                  />
                {/if}
              </div>
              <div class="cell rate">
                {#if showFreeFields(row.concept)}
                  <input
                    type="text"
                    inputmode="decimal"
                    class="field num"
                    placeholder="% (opc.)"
                    aria-label="Alícuota en porcentaje"
                    bind:value={row.rate}
                  />
                {/if}
              </div>
              <div class="cell">
                <input
                  type="text"
                  inputmode="decimal"
                  class="field num"
                  placeholder="0,00"
                  aria-label="Monto"
                  bind:value={row.amount}
                />
              </div>
              <button
                type="button"
                class="icon-btn"
                aria-label="Quitar fila"
                onclick={() => removeRow(row.key)}
              >
                <X size={14} />
              </button>
              {#if rowErrors[i]}
                <p class="row-error">{rowErrors[i]}</p>
              {/if}
            </div>
          {/each}
        </div>
      {/if}

      <div>
        <Button size="sm" variant="secondary" onclick={addRow}>
          <Plus size={14} /> Agregar línea
        </Button>
      </div>
    </section>

    <section class="block totals" aria-live="polite">
      <div class="total-row">
        <span>Desglose de ARCA</span>
        <span class="num">{formatCurrency(fixedSum)}</span>
      </div>
      <div class="total-row">
        <span>Otros tributos detallados</span>
        <span class="num">{formatCurrency(othersSum)}</span>
      </div>
      <div class="total-row strong">
        <span>Suma</span>
        <span class="num">{formatCurrency(totalSum)}</span>
      </div>
      <div class="total-row">
        <span>Total ARCA</span>
        <span class="num">{formatCurrency(breakdown.total)}</span>
      </div>
      {#if !sumOk}
        <p class="error-text sum-error" role="alert">
          <AlertTriangle size={14} />
          {#if diff > 0}
            Faltan {formatCurrency(diff)} para llegar al total de ARCA.
          {:else}
            Sobran {formatCurrency(-diff)} respecto del total de ARCA.
          {/if}
          Ajuste los otros tributos para poder crear la factura.
        </p>
      {/if}
    </section>

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
    padding: var(--spacing-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
  }

  .title {
    margin: 0;
    font-size: var(--font-size-lg);
    color: var(--color-text-primary);
  }

  .block-title {
    margin: 0;
    display: flex;
    align-items: baseline;
    gap: var(--spacing-2);
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
  }

  .muted,
  .muted-inline {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-normal);
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

  .sum-error {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
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
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .strong {
    font-weight: var(--font-weight-semibold);
  }

  .block {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .fixed-lines {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
  }

  .fixed-lines li {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-3);
    padding: var(--spacing-1) var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .fixed-lines li:nth-child(odd) {
    background: var(--color-neutral-100);
    border-radius: var(--radius-base);
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
  }

  .row {
    display: grid;
    grid-template-columns:
      minmax(130px, 1.1fr) minmax(110px, 1.2fr) minmax(70px, 0.6fr) minmax(90px, 0.9fr)
      auto;
    gap: var(--spacing-2);
    align-items: center;
    padding: var(--spacing-2);
    border-radius: var(--radius-base);
  }

  .row:nth-child(odd) {
    background: var(--color-neutral-100);
  }

  .row-error {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-xs);
  }

  .cell {
    min-width: 0;
  }

  .field {
    width: 100%;
    box-sizing: border-box;
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .field:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .icon-btn {
    display: inline-flex;
    padding: var(--spacing-2);
    border: none;
    border-radius: var(--radius-base);
    background: transparent;
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .icon-btn:hover {
    background: var(--color-neutral-200);
  }

  .totals {
    padding: var(--spacing-3);
    border-radius: var(--radius-base);
    background: var(--color-surface-alt);
  }

  .total-row {
    display: flex;
    justify-content: space-between;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .total-row.strong {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-primary);
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
