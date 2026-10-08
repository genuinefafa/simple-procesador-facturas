<script lang="ts">
  /**
   * Tax breakdown of an invoice (#190, silver layer).
   *
   * View mode lists the saved lines and compares their sum against the total;
   * edit mode lets the user load/replace them. Nothing is saved automatically.
   */
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { AlertTriangle, Calculator, Plus, Trash2, Edit, Save, X } from '$lib/components/icons';
  import { formatCurrency } from '$lib/formatters';
  import { invoiceTaxLinesService } from '$lib/services/InvoiceTaxLinesService';
  import TaxLineSelect from './TaxLineSelect.svelte';
  import {
    CONCEPT_OPTIONS,
    EDITOR_CONCEPT_OPTIONS,
    FREE_RATE_CONCEPTS,
    LABEL_CONCEPTS,
    RATES_BY_CONCEPT,
    REPEATABLE_CONCEPTS,
    TAX_SUM_TOLERANCE,
    type TaxLine,
    type TaxLineConcept,
    type TaxLineInput,
    type TaxLinesResponse,
  } from './InvoiceTaxBreakdown.types';

  interface Props {
    invoiceId: number;
    total?: number | null;
    /** Invoice letter (A, B, C, M...). Falls back to the one returned by the API. */
    letter?: string | null;
    /**
     * Reserved for ARCA prefill (#129): if provided and the invoice has no
     * breakdown, the form starts with these lines so the user can validate
     * them. They are never saved automatically.
     */
    prefill?: TaxLineInput[];
  }

  let { invoiceId, total = null, letter = null, prefill }: Props = $props();

  interface Row {
    key: number;
    concept: TaxLineConcept | '';
    rate: string;
    amount: string;
    label: string;
    /** UI-only helper for the percentage calculator ('total' | 'net:<rate>'); never saved */
    base: string;
  }

  let data = $state<TaxLinesResponse | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let editing = $state(false);
  let saving = $state(false);
  let saveError = $state<string | null>(null);
  let rows = $state<Row[]>([]);
  let removeDialogOpen = $state(false);
  let shortcutRate = $state('21');
  let nextKey = 1;

  const effectiveLetter = $derived(letter ?? data?.letter ?? null);
  const showShortcut = $derived(effectiveLetter === 'A' || effectiveLetter === 'M');
  const effectiveTotal = $derived(data?.total ?? total);

  const isFixedRate = (c: TaxLineConcept | ''): boolean => c !== '' && !!RATES_BY_CONCEPT[c];
  const isFreeRate = (c: TaxLineConcept | ''): boolean =>
    c !== '' && FREE_RATE_CONCEPTS.includes(c);

  // NET_TAXED states which VAT rate the net is taxed at, so it reads "IVA 21%"
  const rateOptions = (c: TaxLineConcept | ''): Array<{ value: string; label: string }> =>
    (c ? (RATES_BY_CONCEPT[c] ?? []) : []).map((r) => ({
      value: String(r),
      label: c === 'NET_TAXED' ? `IVA ${formatRate(r)}%` : `${formatRate(r)}%`,
    }));

  function formatRate(rate: number): string {
    return String(rate).replace('.', ',');
  }

  function conceptLabel(line: TaxLineInput): string {
    const name = CONCEPT_OPTIONS.find((o) => o.value === line.concept)?.label ?? line.concept;
    if (line.concept === 'NET_TAXED' && line.rate !== null) {
      return `${name} · IVA ${formatRate(line.rate)}%`;
    }
    if (line.concept === 'VAT' && line.rate !== null) return `IVA ${formatRate(line.rate)}%`;
    const withRate = line.rate !== null ? `${name} ${formatRate(line.rate)}%` : name;
    return line.label ? `${withRate} (${line.label})` : withRate;
  }

  function round2(n: number): number {
    return Math.round((n + Number.EPSILON) * 100) / 100;
  }

  // Amount inputs accept "1234,56" or "1234.56" (dot or comma as decimal separator)
  function parseAmountLoose(raw: string): number {
    const t = raw.trim().replace(',', '.');
    return t === '' ? NaN : Number(t);
  }

  function toRow(line: TaxLineInput): Row {
    return {
      key: nextKey++,
      concept: line.concept,
      // Fixed-list rates keep the dot (select values); free rates show a comma
      rate:
        line.rate === null
          ? ''
          : isFreeRate(line.concept)
            ? formatRate(line.rate)
            : String(line.rate),
      amount: String(line.amount),
      label: line.label ?? '',
      base: '',
    };
  }

  async function load(): Promise<void> {
    loading = true;
    loadError = null;
    const result = await invoiceTaxLinesService.get(invoiceId);
    if (result.success && result.data) {
      data = result.data;
    } else {
      loadError = result.error ?? 'No se pudo cargar el desglose impositivo.';
    }
    loading = false;
  }

  $effect(() => {
    // Reload when navigating to another invoice
    void invoiceId;
    editing = false;
    void load();
  });

  function startEdit(): void {
    saveError = null;
    const source: TaxLineInput[] = data && data.lines.length > 0 ? data.lines : (prefill ?? []);
    rows = source.map(toRow);
    if (rows.length === 0) addRow();
    editing = true;
  }

  function cancelEdit(): void {
    editing = false;
    saveError = null;
  }

  /** Suggests a logical concept for the new row; the user can change it. */
  function addRow(): void {
    let concept: TaxLineConcept | '' = '';
    let rate = '';
    if (rows.length === 0) {
      concept = 'NET_TAXED';
    } else {
      const lacking = rows.find(
        (r) =>
          r.concept === 'NET_TAXED' &&
          r.rate !== '' &&
          !rows.some((o) => o.concept === 'VAT' && o.rate === r.rate)
      );
      if (lacking) {
        concept = 'VAT';
        rate = lacking.rate;
      }
    }
    rows.push({ key: nextKey++, concept, rate, amount: '', label: '', base: '' });
  }

  function removeRow(key: number): void {
    rows = rows.filter((r) => r.key !== key);
  }

  function setConcept(row: Row, concept: string): void {
    const prev = row.concept;
    row.concept = concept as TaxLineConcept;
    const rates = RATES_BY_CONCEPT[row.concept];
    if (rates) {
      if (!rates.includes(Number(row.rate))) row.rate = '';
    } else if (!isFreeRate(row.concept) || isFixedRate(prev)) {
      row.rate = '';
    }
    if (!LABEL_CONCEPTS.includes(row.concept)) row.label = '';
    row.base = '';
  }

  const isNetOrVat = (c: TaxLineConcept | ''): boolean => c === 'NET_TAXED' || c === 'VAT';

  function validAmount(row: Row): number | null {
    const a = parseAmountLoose(row.amount);
    return Number.isFinite(a) && a > 0 ? a : null;
  }

  /** Net of the NET_TAXED line with exactly this VAT rate, or null if absent. */
  function netOfRate(rate: string): number | null {
    if (rate === '') return null;
    const row = rows.find((r) => r.concept === 'NET_TAXED' && Number(r.rate) === Number(rate));
    return row ? validAmount(row) : null;
  }

  /** Taxed nets already loaded (rows with a rate and a positive amount). */
  const taxedNets = $derived(
    rows
      .filter((r) => r.concept === 'NET_TAXED' && r.rate !== '' && validAmount(r) !== null)
      .map((r) => ({ rate: r.rate, amount: validAmount(r) as number }))
  );

  const baseOptions = $derived<Array<{ value: string; label: string }>>(
    taxedNets.length === 0
      ? []
      : [
          ...taxedNets.map((n) => ({
            value: `net:${n.rate}`,
            label: `Neto IVA ${formatRate(Number(n.rate))}%`,
          })),
          { value: 'total', label: 'Neto gravado total' },
        ]
  );

  /** Explicit choice if still valid; otherwise the single net, or the total when several. */
  function effectiveBase(row: Row): string {
    if (row.base && baseOptions.some((o) => o.value === row.base)) return row.base;
    if (taxedNets.length === 1) return `net:${taxedNets[0]!.rate}`;
    return taxedNets.length > 1 ? 'total' : '';
  }

  function baseAmount(base: string): number | null {
    if (base === 'total') return round2(taxedNets.reduce((acc, n) => acc + n.amount, 0));
    if (base.startsWith('net:')) return netOfRate(base.slice(4));
    return null;
  }

  function rateNumber(row: Row): number {
    return parseAmountLoose(row.rate);
  }

  // Calculators only run on click: a hand-edited amount is never overwritten.
  function vatCalcHint(row: Row): string | null {
    if (row.rate === '') return 'Seleccione la alícuota para calcular el IVA';
    if (netOfRate(row.rate) === null) {
      return `Cargue el neto gravado de IVA ${formatRate(Number(row.rate))}% para calcular el IVA`;
    }
    return null;
  }

  function percCalcHint(row: Row): string | null {
    const pct = rateNumber(row);
    if (!Number.isFinite(pct) || pct <= 0) return 'Ingrese el porcentaje para calcular el monto';
    if (baseAmount(effectiveBase(row)) === null)
      return 'Cargue un neto gravado para usarlo como base';
    return null;
  }

  function calcVat(row: Row): void {
    const net = netOfRate(row.rate);
    if (net === null) return;
    row.amount = String(round2((net * Number(row.rate)) / 100));
  }

  function calcPerc(row: Row): void {
    const base = baseAmount(effectiveBase(row));
    const pct = rateNumber(row);
    if (base === null || !Number.isFinite(pct) || pct <= 0) return;
    row.amount = String(round2((base * pct) / 100));
  }

  /** Sum of the rows that the shortcut keeps (everything but NET_TAXED / VAT). */
  const shortcutKept = $derived(
    rows.filter((r) => !isNetOrVat(r.concept) && (r.concept !== '' || r.amount.trim() !== ''))
  );
  const shortcutRest = $derived(
    effectiveTotal === null
      ? null
      : round2(
          effectiveTotal -
            shortcutKept.reduce((acc, r) => {
              const a = parseAmountLoose(r.amount);
              return acc + (Number.isFinite(a) ? a : 0);
            }, 0)
        )
  );
  const shortcutDisabled = $derived(shortcutRest === null || shortcutRest <= 0);

  /**
   * Fills net + VAT from (total - the other rows). Rows that are not
   * NET_TAXED/VAT (perceptions, other taxes, exempt, untaxed) are preserved.
   * Does not save.
   */
  function applyShortcut(): void {
    if (shortcutRest === null || shortcutRest <= 0) return;
    const rate = Number(shortcutRate);
    const net = round2(shortcutRest / (1 + rate / 100));
    const vat = round2(shortcutRest - net);
    rows = [
      toRow({ concept: 'NET_TAXED', rate, amount: net, label: null }),
      toRow({ concept: 'VAT', rate, amount: vat, label: null }),
      ...shortcutKept,
    ];
  }

  const rowErrors = $derived(
    rows.map((row) => {
      if (!row.concept) return 'Seleccione un concepto';
      if (RATES_BY_CONCEPT[row.concept] && row.rate === '') return 'Seleccione la alícuota';
      if (isFreeRate(row.concept) && row.rate.trim() !== '') {
        const pct = rateNumber(row);
        if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
          return 'El porcentaje debe ser mayor a 0 y hasta 100';
        }
        if (Math.abs(pct * 1e4 - Math.round(pct * 1e4)) > 1e-6) {
          return 'El porcentaje admite hasta 4 decimales';
        }
      }
      const amount = parseAmountLoose(row.amount);
      if (!Number.isFinite(amount) || amount <= 0) return 'Ingrese un monto mayor a cero';
      if (row.label.trim().length > 100) return 'La descripción admite hasta 100 caracteres';
      return null;
    })
  );

  const duplicateError = $derived.by(() => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (!row.concept || REPEATABLE_CONCEPTS.includes(row.concept)) continue;
      const key = `${row.concept}:${row.rate}`;
      if (seen.has(key)) return 'Hay conceptos repetidos (mismo concepto y alícuota)';
      seen.add(key);
    }
    return null;
  });

  const formSum = $derived(
    round2(
      rows.reduce((acc, r) => {
        const a = parseAmountLoose(r.amount);
        return acc + (Number.isFinite(a) ? a : 0);
      }, 0)
    )
  );
  const formDiff = $derived(effectiveTotal === null ? null : round2(formSum - effectiveTotal));
  const formSumOk = $derived(formDiff !== null && Math.abs(formDiff) <= TAX_SUM_TOLERANCE + 1e-9);
  const canSave = $derived(
    !saving &&
      rows.length > 0 &&
      rowErrors.every((e) => e === null) &&
      duplicateError === null &&
      formSumOk
  );

  function buildPayload(): TaxLineInput[] {
    return rows.map((r) => {
      const concept = r.concept as TaxLineConcept;
      return {
        concept,
        rate: RATES_BY_CONCEPT[concept]
          ? Number(r.rate)
          : isFreeRate(concept) && r.rate.trim() !== ''
            ? parseAmountLoose(r.rate)
            : null,
        amount: round2(parseAmountLoose(r.amount)),
        label: LABEL_CONCEPTS.includes(concept) && r.label.trim() ? r.label.trim() : null,
      };
    });
  }

  async function save(): Promise<void> {
    if (!canSave) return;
    saving = true;
    saveError = null;
    const result = await invoiceTaxLinesService.save(invoiceId, buildPayload());
    saving = false;
    if (result.success && result.data) {
      data = result.data;
      editing = false;
      toast.success('Desglose guardado');
    } else {
      saveError = result.error ?? 'No se pudo guardar el desglose.';
    }
  }

  async function removeBreakdown(): Promise<void> {
    saving = true;
    const result = await invoiceTaxLinesService.save(invoiceId, []);
    saving = false;
    removeDialogOpen = false;
    if (result.success && result.data) {
      data = result.data;
      editing = false;
      toast.success('Desglose quitado');
    } else {
      toast.error(result.error ?? 'No se pudo quitar el desglose');
    }
  }

  const viewLines = $derived<TaxLine[]>(data?.lines ?? []);
</script>

<div class="tax-breakdown">
  <header class="head">
    <h3>Desglose impositivo</h3>
    {#if !editing && !loading && viewLines.length > 0}
      <div class="head-actions">
        <Button size="sm" variant="secondary" onclick={startEdit}>
          <Edit size={14} /> Editar
        </Button>
        <Button size="sm" variant="ghost" onclick={() => (removeDialogOpen = true)}>
          <Trash2 size={14} /> Quitar desglose
        </Button>
      </div>
    {/if}
  </header>

  {#if loading}
    <p class="muted">Cargando desglose...</p>
  {:else if loadError}
    <p class="error-text" role="alert">{loadError}</p>
  {:else if editing}
    <div class="form">
      {#if showShortcut}
        <div class="shortcut">
          <span class="shortcut-label">Atajo Neto + IVA</span>
          <div class="shortcut-rate">
            <TaxLineSelect
              value={shortcutRate}
              options={['21', '10.5', '27'].map((r) => ({
                value: r,
                label: `${formatRate(Number(r))}%`,
              }))}
              ariaLabel="Alícuota del atajo"
              onchange={(v) => (shortcutRate = v)}
            />
          </div>
          <Button size="sm" variant="secondary" disabled={shortcutDisabled} onclick={applyShortcut}>
            Calcular desde el total
          </Button>
          {#if shortcutDisabled}
            <p class="shortcut-hint">
              {effectiveTotal === null
                ? 'El comprobante no tiene total cargado.'
                : 'No queda importe por distribuir: los demás conceptos ya igualan o superan el total.'}
            </p>
          {:else}
            <p class="shortcut-hint">
              Se conservan las demás líneas y se calcula sobre {formatCurrency(shortcutRest)}.
            </p>
          {/if}
        </div>
      {/if}

      <div class="rows">
        {#each rows as row, i (row.key)}
          <div class="row">
            <div class="cell concept">
              <TaxLineSelect
                value={row.concept}
                options={EDITOR_CONCEPT_OPTIONS}
                placeholder="Concepto"
                ariaLabel="Concepto"
                onchange={(v) => setConcept(row, v)}
              />
            </div>
            <!-- Rate and label are mutually exclusive per concept: they share one cell -->
            <div class="cell detail">
              {#if row.concept && RATES_BY_CONCEPT[row.concept]}
                <TaxLineSelect
                  value={row.rate}
                  options={rateOptions(row.concept)}
                  placeholder={row.concept === 'NET_TAXED' ? 'Gravado a' : 'Alícuota'}
                  ariaLabel="Alícuota"
                  onchange={(v) => (row.rate = v)}
                />
                {#if row.concept === 'VAT'}
                  {@const hint = vatCalcHint(row)}
                  <button
                    type="button"
                    class="icon-btn calc"
                    aria-label={hint ?? 'Calcular IVA desde el neto de la misma alícuota'}
                    data-tip={hint ?? 'Calcular IVA desde el neto'}
                    disabled={hint !== null}
                    onclick={() => calcVat(row)}
                  >
                    <Calculator size={14} />
                  </button>
                {/if}
              {:else if row.concept && LABEL_CONCEPTS.includes(row.concept)}
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
            <div class="cell amount">
              <input
                type="text"
                inputmode="decimal"
                class="field amount-input"
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
            {#if isFreeRate(row.concept)}
              {@const hint = percCalcHint(row)}
              <div class="subrow">
                <input
                  type="text"
                  inputmode="decimal"
                  class="field pct-input"
                  placeholder="%"
                  aria-label="Porcentaje"
                  bind:value={row.rate}
                />
                <span class="subrow-text">% sobre</span>
                <div class="base-select">
                  <TaxLineSelect
                    value={effectiveBase(row)}
                    options={baseOptions}
                    placeholder="Sin neto cargado"
                    ariaLabel="Base de cálculo"
                    onchange={(v) => (row.base = v)}
                  />
                </div>
                <button
                  type="button"
                  class="icon-btn calc"
                  aria-label={hint ?? 'Calcular monto como porcentaje de la base'}
                  data-tip={hint ?? 'Calcular monto'}
                  disabled={hint !== null}
                  onclick={() => calcPerc(row)}
                >
                  <Calculator size={14} />
                </button>
              </div>
            {/if}
            {#if rowErrors[i] && (row.concept || row.amount)}
              <p class="row-error">{rowErrors[i]}</p>
            {/if}
          </div>
        {/each}
      </div>

      <Button size="sm" variant="ghost" onclick={addRow}><Plus size={14} /> Agregar línea</Button>

      <div class="totals" class:bad={!formSumOk}>
        <span>Suma: <strong>{formatCurrency(formSum)}</strong></span>
        <span>Total del comprobante: <strong>{formatCurrency(effectiveTotal)}</strong></span>
        <span>
          Diferencia: <strong>{formDiff === null ? '—' : formatCurrency(formDiff)}</strong>
        </span>
      </div>
      {#if effectiveTotal === null}
        <p class="error-text">
          El comprobante no tiene total cargado; cárguelo antes de definir el desglose.
        </p>
      {:else if !formSumOk && rows.length > 0}
        <p class="error-text">
          La diferencia no debe superar {formatCurrency(TAX_SUM_TOLERANCE)} para poder guardar.
        </p>
      {/if}
      {#if duplicateError}
        <p class="error-text">{duplicateError}</p>
      {/if}
      {#if saveError}
        <p class="error-text" role="alert">{saveError}</p>
      {/if}

      <div class="form-actions">
        <Button size="sm" variant="primary" disabled={!canSave} onclick={save}>
          <Save size={14} />
          {saving ? 'Guardando...' : 'Guardar'}
        </Button>
        <Button size="sm" variant="ghost" disabled={saving} onclick={cancelEdit}>Cancelar</Button>
      </div>
    </div>
  {:else if viewLines.length === 0}
    <div class="empty">
      <p class="muted">Sin desglose cargado</p>
      <Button size="sm" variant="secondary" onclick={startEdit}>Cargar desglose</Button>
    </div>
  {:else}
    <table class="lines">
      <tbody>
        {#each viewLines as line (line.id)}
          <tr>
            <td>{conceptLabel(line)}</td>
            <td class="num">{formatCurrency(line.amount)}</td>
          </tr>
        {/each}
      </tbody>
      <tfoot>
        <tr>
          <td>Suma del desglose</td>
          <td class="num">{formatCurrency(data?.sum)}</td>
        </tr>
        <tr>
          <td>Total del comprobante</td>
          <td class="num">{formatCurrency(data?.total)}</td>
        </tr>
      </tfoot>
    </table>
    {#if data?.sumMatches === false}
      <div class="warning" role="alert">
        <AlertTriangle size={14} />
        <span>
          El desglose no coincide con el total del comprobante
          {#if data.diff !== null}(diferencia {formatCurrency(data.diff)}){/if}.
        </span>
      </div>
    {/if}
  {/if}
</div>

<Dialog
  bind:open={removeDialogOpen}
  title="Quitar desglose"
  description="Se eliminarán todas las líneas del desglose impositivo de este comprobante. El total no se modifica."
>
  <div class="dialog-actions">
    <Button variant="ghost" disabled={saving} onclick={() => (removeDialogOpen = false)}>
      Cancelar
    </Button>
    <Button variant="danger" disabled={saving} onclick={removeBreakdown}>
      {saving ? 'Quitando...' : 'Quitar desglose'}
    </Button>
  </div>
</Dialog>

<style>
  .tax-breakdown {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
    padding: var(--spacing-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    flex-wrap: wrap;
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
  }

  .head-actions,
  .form-actions,
  .dialog-actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .dialog-actions {
    justify-content: flex-end;
  }

  .muted {
    margin: 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .error-text {
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-sm);
  }

  .empty {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    flex-wrap: wrap;
  }

  .lines {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .lines td {
    padding: var(--spacing-1) var(--spacing-2);
  }

  .lines tbody tr + tr td {
    border-top: 1px solid var(--color-border);
  }

  .lines tfoot td {
    color: var(--color-text-secondary);
  }

  .lines tfoot tr:first-child td {
    border-top: 2px solid var(--color-border);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .warning {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-base);
    background: color-mix(in srgb, var(--color-warning) 12%, var(--color-surface));
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .shortcut {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    flex-wrap: wrap;
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-base);
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
  }

  .shortcut-rate {
    width: 90px;
  }

  .rows {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .row {
    display: grid;
    grid-template-columns: minmax(140px, 1.25fr) minmax(120px, 1.15fr) minmax(90px, 0.9fr) auto;
    gap: var(--spacing-2);
    align-items: center;
  }

  .row-error {
    grid-column: 1 / -1;
    margin: 0;
    color: var(--color-error);
    font-size: var(--font-size-xs);
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

  .cell.detail {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    min-width: 0;
  }

  .cell.detail > :global(:first-child) {
    flex: 1;
    min-width: 0;
  }

  .shortcut-hint {
    flex-basis: 100%;
    margin: 0;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .subrow {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding-left: var(--spacing-3);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .subrow .field {
    font-size: var(--font-size-xs);
    padding: var(--spacing-1) var(--spacing-2);
  }

  .pct-input {
    width: 64px;
    text-align: right;
  }

  .base-select {
    flex: 1;
    min-width: 0;
    font-size: var(--font-size-xs);
  }

  .icon-btn.calc:hover:not(:disabled) {
    color: var(--color-primary-500);
  }

  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  /* CSS tooltip (preferred over native title) */
  .icon-btn[data-tip] {
    position: relative;
  }

  .icon-btn[data-tip]:hover::after {
    content: attr(data-tip);
    position: absolute;
    right: 0;
    bottom: 100%;
    z-index: 10;
    width: max-content;
    max-width: 220px;
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-base);
    background: var(--color-text-primary);
    color: var(--color-surface);
    font-size: var(--font-size-xs);
    white-space: normal;
    pointer-events: none;
  }

  .amount-input {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .icon-btn {
    display: inline-flex;
    padding: var(--spacing-2);
    border: none;
    border-radius: var(--radius-base);
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }

  .icon-btn:hover {
    color: var(--color-error);
    background: var(--color-neutral-50);
  }

  .totals {
    display: flex;
    gap: var(--spacing-4);
    flex-wrap: wrap;
    padding: var(--spacing-2) var(--spacing-3);
    border-radius: var(--radius-base);
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .totals.bad {
    border: 1px solid var(--color-error);
  }
</style>
