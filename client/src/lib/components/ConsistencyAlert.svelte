<script lang="ts">
  /**
   * Alert with the divergences between an invoice (source of truth) and its
   * linked expected invoice / file. Nothing is changed without a confirmed
   * action; ARCA values are never overwritten, only the invoice is corrected.
   */
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { TriangleAlert, ArrowRight, Undo2 } from '$lib/components/icons';
  import { formatCurrency, formatDateISO, getFriendlyType } from '$lib/formatters';
  import { consistencyService } from '$lib/services/ConsistencyService';
  import type {
    ConsistencyField,
    ConsistencySource,
    Divergence,
  } from '$lib/services/ConsistencyService.types';

  interface Props {
    invoiceId: number;
    categories: Array<{ id: number; description: string }>;
    /** Whether the invoice has a file (date/type corrections may rename it) */
    hasFile: boolean;
    /** Changes whenever the invoice data changes, to reload the divergences */
    refreshKey?: string;
    /** Called after an action changed data, so the page can reload */
    onchange?: () => void;
  }

  let { invoiceId, categories, hasFile, refreshKey = '', onchange }: Props = $props();

  type Pending =
    | { action: 'copy-category'; d: Divergence }
    | { action: 'correct'; d: Divergence }
    | { action: 'accept'; d: Divergence };

  let divergences = $state<Divergence[]>([]);
  let loadError = $state<string | null>(null);
  let busy = $state(false);
  let pending = $state<Pending | null>(null);
  let dialogOpen = $state(false);
  let note = $state('');
  let showAccepted = $state(false);
  let requestId = 0;

  const open = $derived(divergences.filter((d) => !d.acked));
  const accepted = $derived(divergences.filter((d) => d.acked));

  async function load() {
    const id = ++requestId;
    const result = await consistencyService.list(invoiceId);
    if (id !== requestId) return;
    if (result.success && result.data) {
      divergences = result.data;
      loadError = null;
    } else {
      loadError = result.error ?? 'No se pudieron cargar las diferencias.';
    }
  }

  $effect(() => {
    void invoiceId;
    void refreshKey;
    load();
  });

  const FIELD_LABELS: Record<ConsistencyField, string> = {
    category: 'Categoría',
    total: 'Total',
    date: 'Fecha',
    type: 'Tipo',
  };
  const SOURCE_LABELS: Record<ConsistencySource, string> = {
    expected: 'la esperada (ARCA)',
    file: 'el archivo',
  };
  const SOURCE_TITLES: Record<ConsistencySource, string> = {
    expected: 'Esperada (ARCA)',
    file: 'Archivo',
  };

  function label(field: ConsistencyField, value: string | number | null): string {
    if (value === null) return field === 'category' ? 'Sin categoría' : 'Sin dato';
    switch (field) {
      case 'category':
        return categories.find((c) => c.id === value)?.description ?? `Categoría #${value}`;
      case 'total':
        return formatCurrency(Number(value));
      case 'date':
        return formatDateISO(String(value).slice(0, 10));
      case 'type':
        return getFriendlyType(Number(value));
    }
  }

  function startAction(action: Pending['action'], d: Divergence) {
    pending = { action, d };
    note = '';
    dialogOpen = true;
  }

  function closeDialog() {
    dialogOpen = false;
  }

  const dialogTitle = $derived.by(() => {
    if (!pending) return '';
    if (pending.action === 'copy-category') {
      return `Completar la categoría en ${SOURCE_LABELS[pending.d.source]}`;
    }
    if (pending.action === 'correct') {
      return `Corregir ${FIELD_LABELS[pending.d.field].toLowerCase()} de la factura`;
    }
    return 'Aceptar diferencia';
  });

  /** What changes, as [where, before, after] rows. Null for accepting (nothing changes). */
  const preview = $derived.by(() => {
    if (!pending) return null;
    const { d, action } = pending;
    if (action === 'copy-category') {
      return {
        where: SOURCE_TITLES[d.source],
        before: label('category', d.sourceValue),
        after: label('category', d.invoiceValue),
      };
    }
    if (action === 'correct') {
      return {
        where: 'Factura',
        before: label(d.field, d.invoiceValue),
        after: label(d.field, d.sourceValue),
      };
    }
    return null;
  });

  async function confirm() {
    if (!pending) return;
    const { action, d } = pending;
    busy = true;
    let ok = false;
    if (action === 'copy-category') {
      const r = await consistencyService.copyCategory(invoiceId, d.source);
      ok = r.success;
      if (r.success && r.data) divergences = r.data;
      else toast.error(r.error ?? 'No se pudo completar la categoría.');
      if (ok) toast.success('Categoría completada');
    } else if (action === 'correct') {
      const correction =
        d.field === 'total'
          ? { total: Number(d.sourceValue) }
          : d.field === 'date'
            ? { issueDate: String(d.sourceValue).slice(0, 10) }
            : { invoiceType: Number(d.sourceValue) };
      const r = await consistencyService.correctInvoice(invoiceId, correction);
      ok = r.success;
      if (r.success) toast.success('Factura corregida');
      else toast.error(r.error ?? 'No se pudo corregir la factura.');
    } else {
      const r = await consistencyService.accept(invoiceId, d.field, d.source, note.trim() || null);
      ok = r.success;
      if (r.success && r.data) divergences = r.data;
      else toast.error(r.error ?? 'No se pudo aceptar la diferencia.');
      if (ok) toast.success('Diferencia aceptada');
    }
    busy = false;
    closeDialog();
    // Reload what changed on the server (also on failure, e.g. stale data)
    await load();
    if (ok) onchange?.();
  }

  async function undo(d: Divergence) {
    busy = true;
    const r = await consistencyService.removeAcceptance(invoiceId, d.field, d.source);
    busy = false;
    if (r.success && r.data) {
      divergences = r.data;
      toast.success('Se quitó la aceptación');
    } else {
      toast.error(r.error ?? 'No se pudo quitar la aceptación.');
    }
  }
</script>

{#if loadError}
  <p class="load-error">{loadError}</p>
{/if}

{#if open.length > 0}
  <section class="alert" aria-label="Diferencias con la esperada o el archivo">
    <header class="head">
      <TriangleAlert size={16} />
      <h3>
        {open.length === 1 ? '1 diferencia' : `${open.length} diferencias`} con la esperada o el archivo
      </h3>
    </header>
    <ul class="list">
      {#each open as d (`${d.field}:${d.source}`)}
        <li class="item">
          <p class="desc">
            <strong>{FIELD_LABELS[d.field]}</strong>
            {#if d.kind === 'missing'}
              : {SOURCE_LABELS[d.source]} no tiene categoría; la factura tiene
              <span class="value">{label(d.field, d.invoiceValue)}</span>.
            {:else}
              : la factura tiene <span class="value">{label(d.field, d.invoiceValue)}</span> y
              {SOURCE_LABELS[d.source]} tiene
              <span class="value">{label(d.field, d.sourceValue)}</span>.
            {/if}
          </p>
          <div class="actions">
            {#if d.field === 'category'}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onclick={() => startAction('copy-category', d)}
              >
                {#if d.kind === 'missing'}
                  Completar en {d.source === 'expected' ? 'la esperada' : 'el archivo'}
                {:else}
                  Usar la categoría de la factura
                {/if}
              </Button>
            {:else}
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onclick={() => startAction('correct', d)}
              >
                Corregir la factura con el valor de ARCA
              </Button>
            {/if}
            {#if d.kind === 'different'}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onclick={() => startAction('accept', d)}
              >
                Aceptar diferencia
              </Button>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </section>
{/if}

{#if accepted.length > 0}
  <div class="accepted">
    <button type="button" class="accepted-toggle" onclick={() => (showAccepted = !showAccepted)}>
      {accepted.length === 1 ? '1 diferencia aceptada' : `${accepted.length} diferencias aceptadas`}
    </button>
    {#if showAccepted}
      <ul class="accepted-list">
        {#each accepted as d (`${d.field}:${d.source}`)}
          <li>
            <span>
              {FIELD_LABELS[d.field]} ({SOURCE_TITLES[d.source]}): {label(d.field, d.invoiceValue)}
              frente a {label(d.field, d.sourceValue)}
              {#if d.note}<em class="note"> - {d.note}</em>{/if}
            </span>
            <button type="button" class="undo" disabled={busy} onclick={() => undo(d)}>
              <Undo2 size={12} /> Deshacer
            </button>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<Dialog bind:open={dialogOpen} title={dialogTitle}>
  {#if pending}
    {#if preview}
      <div class="preview" aria-label="Antes y después">
        <span class="where">{preview.where}</span>
        <span class="before">{preview.before}</span>
        <ArrowRight size={14} />
        <span class="after">{preview.after}</span>
      </div>
      {#if pending.action === 'correct' && hasFile && (pending.d.field === 'date' || pending.d.field === 'type')}
        <p class="warn">
          El archivo asociado se va a renombrar para reflejar la nueva
          {pending.d.field === 'date' ? 'fecha' : 'tipo de comprobante'}.
        </p>
      {/if}
      {#if pending.action === 'correct'}
        <p class="hint">Solo se modifica la factura; el dato de ARCA no se toca.</p>
      {/if}
    {:else}
      <div class="preview" aria-label="Valores actuales">
        <span class="where">Factura</span>
        <span class="before">{label(pending.d.field, pending.d.invoiceValue)}</span>
        <span class="where">{SOURCE_TITLES[pending.d.source]}</span>
        <span class="before">{label(pending.d.field, pending.d.sourceValue)}</span>
      </div>
      <p class="hint">
        No se cambia ningún dato. La diferencia deja de avisar mientras el valor de
        {SOURCE_LABELS[pending.d.source]} no cambie.
      </p>
      <label class="note-field">
        <span>Nota (opcional)</span>
        <textarea rows="3" bind:value={note} maxlength="500"></textarea>
      </label>
    {/if}
  {/if}
  <div class="dialog-actions">
    <Button variant="secondary" disabled={busy} onclick={closeDialog}>Cancelar</Button>
    <Button variant="primary" disabled={busy} onclick={confirm}>Confirmar</Button>
  </div>
</Dialog>

<style>
  .alert {
    margin-top: var(--spacing-4);
    padding: var(--spacing-3) var(--spacing-4);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-warning) 10%, var(--color-surface));
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    color: var(--color-text-primary);
  }

  .head h3 {
    margin: 0;
    font-size: var(--font-size-base);
  }

  .list,
  .accepted-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .item {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .desc {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .value {
    font-weight: var(--font-weight-semibold);
  }

  .actions,
  .dialog-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
  }

  .dialog-actions {
    justify-content: flex-end;
    margin-top: var(--spacing-4);
  }

  .accepted {
    margin-top: var(--spacing-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .accepted-toggle {
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    text-decoration: underline;
    cursor: pointer;
  }

  .accepted-list {
    margin-top: var(--spacing-2);
    gap: var(--spacing-1);
  }

  .accepted-list li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
  }

  .note {
    font-style: italic;
  }

  .undo {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-primary-600);
    font-size: var(--font-size-xs);
    cursor: pointer;
  }

  .undo:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .accepted-toggle:focus-visible,
  .undo:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .load-error {
    margin: var(--spacing-2) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-error);
  }

  .preview {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface-alt);
    font-size: var(--font-size-sm);
  }

  .where {
    color: var(--color-text-secondary);
  }

  .after {
    font-weight: var(--font-weight-semibold);
  }

  .warn,
  .hint {
    margin: var(--spacing-3) 0 0;
    font-size: var(--font-size-sm);
  }

  .warn {
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-base);
    background: color-mix(in srgb, var(--color-warning) 12%, var(--color-surface));
  }

  .hint {
    color: var(--color-text-secondary);
  }

  .note-field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    margin-top: var(--spacing-3);
    font-size: var(--font-size-sm);
  }

  textarea {
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-base);
    background: var(--color-surface);
    color: var(--color-text-primary);
    resize: vertical;
  }

  textarea:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 1px;
  }
</style>
