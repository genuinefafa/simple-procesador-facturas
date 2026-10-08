<script lang="ts">
  /**
   * Side-by-side comparison of an invoice's tax breakdown against the one
   * informed by ARCA, with the actions to align them (normalize, accept the
   * difference). Nothing is copied without an explicit, confirmed action.
   */
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { X } from '$lib/components/icons';
  import { formatCurrency, formatDateShort } from '$lib/formatters';
  import { reconciliationService } from '$lib/services/ReconciliationService';
  import {
    bucketLabel,
    REASON_LABELS,
    STATUS_LABELS,
    type TaxReconciliationItem,
  } from '$lib/services/ReconciliationService.types';

  interface Props {
    invoiceId: number;
    /** Called after the invoice breakdown changed (so siblings can refresh) */
    onchange?: () => void;
    onclose: () => void;
  }

  let { invoiceId, onchange, onclose }: Props = $props();

  let item = $state<TaxReconciliationItem | null>(null);
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let busy = $state(false);
  let normalizeOpen = $state(false);
  let acceptOpen = $state(false);
  let note = $state('');
  let requestId = 0;

  async function load() {
    const id = ++requestId;
    loading = true;
    loadError = null;
    const result = await reconciliationService.get(invoiceId);
    if (id !== requestId) return;
    if (result.success && result.data) item = result.data;
    else loadError = result.error ?? 'No se pudo cargar la comparación.';
    loading = false;
  }

  $effect(() => {
    void invoiceId;
    load();
  });

  async function run(
    action: () => Promise<{ success: boolean; data?: TaxReconciliationItem; error?: string }>,
    successMessage: string,
    notifyParent: boolean
  ): Promise<boolean> {
    busy = true;
    const result = await action();
    busy = false;
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'No se pudo completar la acción.');
      // e.g. 409 because ARCA changed meanwhile: reload to show the current state
      await load();
      return false;
    }
    item = result.data;
    toast.success(successMessage);
    if (notifyParent) onchange?.();
    return true;
  }

  async function confirmNormalize() {
    if (!item?.arcaFingerprint) return;
    const fingerprint = item.arcaFingerprint;
    const ok = await run(
      () => reconciliationService.normalize(invoiceId, fingerprint),
      'Desglose normalizado según ARCA',
      true
    );
    if (ok) normalizeOpen = false;
  }

  async function confirmAccept() {
    if (!item?.arcaFingerprint) return;
    const fingerprint = item.arcaFingerprint;
    const text = note.trim();
    const ok = await run(
      () => reconciliationService.acceptDifference(invoiceId, fingerprint, text || null),
      'Diferencia aceptada',
      false
    );
    if (ok) {
      acceptOpen = false;
      note = '';
    }
  }

  async function removeAcceptance() {
    await run(() => reconciliationService.removeAcceptance(invoiceId), 'Aceptación quitada', false);
  }

  function signed(value: number): string {
    if (value === 0) return formatCurrency(0);
    return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
  }
</script>

<section class="comparison" aria-label="Comparación con ARCA">
  <header class="head">
    <h3>Comparación con ARCA</h3>
    {#if item}
      <span class="badge badge-{item.status}">{STATUS_LABELS[item.status]}</span>
    {/if}
    <button type="button" class="close" aria-label="Cerrar comparación" onclick={onclose}>
      <X size={16} />
    </button>
  </header>

  {#if loading && !item}
    <p class="state">Cargando comparación...</p>
  {:else if loadError}
    <div class="state error" role="alert">
      <p>{loadError}</p>
      <Button size="sm" variant="secondary" onclick={load}>Reintentar</Button>
    </div>
  {:else if item}
    <p class="reason">{REASON_LABELS[item.reason]}</p>

    {#if item.ackStale}
      <p class="notice" role="status">ARCA cambió desde que se aceptó la diferencia.</p>
    {/if}

    {#if item.buckets.length > 0}
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="num">Factura</th>
            <th class="num">ARCA</th>
            <th class="num">Diferencia</th>
          </tr>
        </thead>
        <tbody>
          {#each item.buckets as bucket (bucket.key)}
            <tr class:mismatch={!bucket.matches}>
              <td>{bucketLabel(bucket.concept, bucket.rate)}</td>
              <td class="num">{formatCurrency(bucket.invoice)}</td>
              <td class="num">{formatCurrency(bucket.arca)}</td>
              <td class="num">{bucket.matches ? '—' : signed(bucket.diff)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else if item.arcaLines && item.arcaLines.length > 0}
      <p class="muted">La factura no tiene desglose cargado. ARCA informa:</p>
      <table>
        <thead>
          <tr>
            <th>Concepto</th>
            <th class="num">ARCA</th>
          </tr>
        </thead>
        <tbody>
          {#each item.arcaLines as line, i (i)}
            <tr>
              <td>{bucketLabel(line.concept, line.rate)}</td>
              <td class="num">{formatCurrency(line.amount)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}

    {#if item.ack && item.reason === 'accepted'}
      <div class="ack">
        <p>
          Diferencia aceptada el {formatDateShort(item.ack.createdAt)}.
          {#if item.ack.note}<span class="ack-note">{item.ack.note}</span>{/if}
        </p>
        <Button size="sm" variant="secondary" disabled={busy} onclick={removeAcceptance}>
          Quitar aceptación
        </Button>
      </div>
    {/if}

    {#if item.arcaLines && item.arcaFingerprint}
      <div class="actions">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy}
          onclick={() => (normalizeOpen = true)}
        >
          Normalizar según ARCA
        </Button>
        {#if item.status === 'divergent'}
          <Button size="sm" variant="secondary" disabled={busy} onclick={() => (acceptOpen = true)}>
            Aceptar diferencia
          </Button>
        {/if}
      </div>
    {/if}
  {/if}
</section>

<Dialog
  bind:open={normalizeOpen}
  title="Normalizar según ARCA"
  description="Se reemplazará el desglose de la factura por el informado por ARCA. Se perderán las reclasificaciones de percepciones (ARCA las informa juntas en 'Otros tributos')."
>
  <div class="dialog-actions">
    <Button variant="secondary" disabled={busy} onclick={() => (normalizeOpen = false)}>
      Cancelar
    </Button>
    <Button variant="primary" disabled={busy} onclick={confirmNormalize}>Normalizar</Button>
  </div>
</Dialog>

<Dialog
  bind:open={acceptOpen}
  title="Aceptar diferencia"
  description="La factura no volverá a figurar como divergente mientras ARCA no cambie estos valores."
>
  <label class="note-field">
    <span>Nota (opcional)</span>
    <textarea
      rows="3"
      bind:value={note}
      placeholder="Por ejemplo: la percepción se reclasificó según el comprobante en papel."
    ></textarea>
  </label>
  <div class="dialog-actions">
    <Button variant="secondary" disabled={busy} onclick={() => (acceptOpen = false)}>
      Cancelar
    </Button>
    <Button variant="primary" disabled={busy} onclick={confirmAccept}>Aceptar diferencia</Button>
  </div>
</Dialog>

<style>
  .comparison {
    margin-top: var(--spacing-4);
    padding: var(--spacing-4);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
  }

  .head h3 {
    margin: 0;
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
  }

  .close {
    margin-left: auto;
    display: inline-flex;
    padding: var(--spacing-1);
    border: none;
    border-radius: var(--radius-base);
    background: transparent;
    color: var(--color-text-tertiary);
    cursor: pointer;
  }

  .close:hover {
    background: var(--color-surface-alt);
    color: var(--color-text-primary);
  }

  .close:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .reason,
  .muted {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .state {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .state.error {
    color: var(--color-error);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    align-items: flex-start;
  }

  .notice {
    margin: 0;
    padding: var(--spacing-2) var(--spacing-3);
    border: 1px solid var(--color-warning);
    border-radius: var(--radius-base);
    background: color-mix(in srgb, var(--color-warning) 12%, var(--color-surface));
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th {
    text-align: left;
    padding: var(--spacing-1) var(--spacing-2);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: var(--spacing-1) var(--spacing-2);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  tr.mismatch td {
    background: color-mix(in srgb, var(--color-warning) 14%, var(--color-surface));
    font-weight: var(--font-weight-medium);
  }

  .ack {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--spacing-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .ack p {
    margin: 0;
  }

  .ack-note {
    display: block;
    font-style: italic;
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

  .note-field {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-1);
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
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

  .badge {
    display: inline-block;
    padding: 2px var(--spacing-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
  }

  .badge-completable {
    color: var(--color-info);
    background: color-mix(in srgb, var(--color-info) 14%, var(--color-surface));
  }

  .badge-manual {
    color: var(--color-text-secondary);
    background: var(--color-neutral-100);
  }

  .badge-ok {
    color: var(--color-success);
    background: color-mix(in srgb, var(--color-success) 14%, var(--color-surface));
  }

  .badge-divergent {
    color: var(--color-neutral-900);
    background: color-mix(in srgb, var(--color-warning) 28%, var(--color-surface));
  }
</style>
