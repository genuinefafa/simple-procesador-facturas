<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { toast, Toaster } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import PeriodSelector from '$lib/components/dashboard/PeriodSelector.svelte';
  import { Loader2 } from '$lib/components/icons';
  import { resolvePeriodKey, periodLabel } from '$lib/utils/dashboard';
  import { formatCurrency, formatCuit, formatDateShort, formatInvoiceLabel } from '$lib/formatters';
  import { reconciliationService } from '$lib/services/ReconciliationService';
  import {
    bucketLabel,
    REASON_LABELS,
    STATUS_LABELS,
    type ReconciliationCounts,
    type ReconciliationStatus,
    type TaxReconciliationItem,
  } from '$lib/services/ReconciliationService.types';

  const STATUSES: ReconciliationStatus[] = ['completable', 'manual', 'ok', 'divergent'];
  const FILTER_LABELS: Record<ReconciliationStatus, string> = {
    completable: 'Completables',
    manual: 'Manuales',
    ok: 'OK',
    divergent: 'Divergentes',
  };

  // URL is the source of truth for period and status filter
  const period = $derived(resolvePeriodKey(page.url.searchParams.get('period')));
  const statusFilter = $derived.by((): ReconciliationStatus | null => {
    const value = page.url.searchParams.get('status');
    return STATUSES.includes(value as ReconciliationStatus)
      ? (value as ReconciliationStatus)
      : null;
  });

  let items = $state<TaxReconciliationItem[]>([]);
  let counts = $state<ReconciliationCounts>({ completable: 0, manual: 0, ok: 0, divergent: 0 });
  let loading = $state(true);
  let loadError = $state<string | null>(null);
  let selected = $state<number[]>([]);
  let requestId = 0;

  let confirmOpen = $state(false);
  let confirmTargets = $state<TaxReconciliationItem[]>([]);
  let completing = $state(false);

  const visible = $derived(
    statusFilter ? items.filter((item) => item.status === statusFilter) : items
  );
  const visibleCompletable = $derived(visible.filter((item) => item.status === 'completable'));
  const allSelected = $derived(
    visibleCompletable.length > 0 && visibleCompletable.every((i) => selected.includes(i.invoiceId))
  );
  const selectedItems = $derived(items.filter((i) => selected.includes(i.invoiceId)));
  const totalAll = $derived(counts.completable + counts.manual + counts.ok + counts.divergent);

  async function load() {
    const id = ++requestId;
    loading = true;
    loadError = null;
    const result = await reconciliationService.list(period);
    if (id !== requestId) return; // a newer period superseded this request
    if (result.success && result.data) {
      items = result.data.items;
      counts = result.data.counts;
      selected = selected.filter((sid) =>
        result.data!.items.some((i) => i.invoiceId === sid && i.status === 'completable')
      );
    } else {
      items = [];
      loadError = result.error ?? 'No se pudo cargar la conciliación.';
    }
    loading = false;
  }

  $effect(() => {
    void period;
    load();
  });

  function updateQuery(changes: Record<string, string | null>) {
    const params = new URLSearchParams(page.url.searchParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) params.delete(key);
      else params.set(key, value);
    }
    const qs = params.toString();
    goto(qs ? `?${qs}` : page.url.pathname, { keepFocus: true, noScroll: true });
  }

  function toggle(id: number) {
    selected = selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id];
  }

  function toggleAll() {
    selected = allSelected ? [] : visibleCompletable.map((i) => i.invoiceId);
  }

  function askConfirm(targets: TaxReconciliationItem[]) {
    if (targets.length === 0) return;
    confirmTargets = targets;
    confirmOpen = true;
  }

  async function confirmComplete() {
    completing = true;
    const result = await reconciliationService.complete(confirmTargets.map((t) => t.invoiceId));
    completing = false;
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'No se pudo completar el desglose.');
      return;
    }
    const { applied, skipped } = result.data;
    const parts = [`${applied.length} ${applied.length === 1 ? 'completada' : 'completadas'}`];
    if (skipped.length > 0) {
      parts.push(
        `${skipped.length} ${skipped.length === 1 ? 'omitida' : 'omitidas'} porque cambiaron`
      );
    }
    if (skipped.length > 0) toast.warning(parts.join(' · '));
    else toast.success(parts.join(' · '));
    confirmOpen = false;
    selected = [];
    await load();
  }

  function signed(value: number): string {
    return `${value > 0 ? '+' : '−'}${formatCurrency(Math.abs(value))}`;
  }

  function detailText(item: TaxReconciliationItem): string {
    if (item.status === 'divergent') {
      const wrong = item.buckets.filter((b) => !b.matches);
      if (wrong.length === 0) return REASON_LABELS[item.reason];
      const shown = wrong
        .slice(0, 2)
        .map((b) => `${bucketLabel(b.concept, b.rate)}: ${signed(b.diff)}`)
        .join(' · ');
      return wrong.length > 2 ? `${shown} · +${wrong.length - 2} más` : shown;
    }
    return REASON_LABELS[item.reason];
  }

  const hasData = $derived(totalAll > 0);
</script>

<svelte:head>
  <title>Conciliación - Procesador de Facturas</title>
</svelte:head>

<header class="header">
  <p class="eyebrow">Control</p>
  <h1>Conciliación de desglose</h1>
  <p class="lede">Compara el desglose impositivo de cada factura con el informado por ARCA.</p>
</header>

<div class="toolbar">
  <PeriodSelector {period} onchange={(key) => updateQuery({ period: key })} />
</div>

<div class="chips" role="group" aria-label="Filtrar por estado">
  {#each STATUSES as status (status)}
    <button
      type="button"
      class="chip chip-{status}"
      class:active={statusFilter === status}
      aria-pressed={statusFilter === status}
      onclick={() => updateQuery({ status })}
    >
      {FILTER_LABELS[status]} <span class="chip-count">{counts[status]}</span>
    </button>
  {/each}
  <button
    type="button"
    class="chip"
    class:active={statusFilter === null}
    aria-pressed={statusFilter === null}
    onclick={() => updateQuery({ status: null })}
  >
    Todas <span class="chip-count">{totalAll}</span>
  </button>
</div>

<div class="actions-bar">
  <Button
    variant="primary"
    size="sm"
    disabled={selectedItems.length === 0}
    onclick={() => askConfirm(selectedItems)}
  >
    Completar desde ARCA ({selectedItems.length})
  </Button>
</div>

{#if loading}
  <p class="state"><Loader2 size={16} class="spin" /> Cargando conciliación...</p>
{:else if loadError}
  <div class="state error" role="alert">
    <p>{loadError}</p>
    <Button size="sm" variant="secondary" onclick={load}>Reintentar</Button>
  </div>
{:else if !hasData}
  <p class="state">No hay facturas en {periodLabel(period)}.</p>
{:else if visible.length === 0}
  <p class="state">No hay facturas con ese estado en {periodLabel(period)}.</p>
{:else}
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th class="col-check">
            <input
              type="checkbox"
              aria-label="Seleccionar todas las completables visibles"
              title="Seleccionar todas las completables visibles"
              checked={allSelected}
              disabled={visibleCompletable.length === 0}
              onchange={toggleAll}
            />
          </th>
          <th>Fecha</th>
          <th>Emisor</th>
          <th>Comprobante</th>
          <th class="num">Total</th>
          <th>Estado</th>
          <th>Detalle</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {#each visible as item (item.invoiceId)}
          <tr>
            <td class="col-check">
              {#if item.status === 'completable'}
                <input
                  type="checkbox"
                  aria-label="Seleccionar factura {item.invoiceNumber}"
                  checked={selected.includes(item.invoiceId)}
                  onchange={() => toggle(item.invoiceId)}
                />
              {/if}
            </td>
            <td class="nowrap">{formatDateShort(item.issueDate)}</td>
            <td class="emitter">{item.emitterName ?? formatCuit(item.emitterCuit)}</td>
            <td class="nowrap">
              {formatInvoiceLabel(item.invoiceType, item.pointOfSale, item.invoiceNumber)}
            </td>
            <td class="num nowrap">{item.total != null ? formatCurrency(item.total) : '—'}</td>
            <td><span class="badge badge-{item.status}">{STATUS_LABELS[item.status]}</span></td>
            <td class="detail">
              {detailText(item)}
              {#if item.ackStale}
                <span class="stale">ARCA cambió desde la aceptación</span>
              {/if}
            </td>
            <td class="action">
              {#if item.status === 'completable'}
                <Button size="sm" variant="secondary" onclick={() => askConfirm([item])}>
                  Copiar desde ARCA
                </Button>
              {:else if item.status === 'divergent'}
                <a href="/comprobantes/factura:{item.invoiceId}?compare=desglose">
                  Ver diferencias
                </a>
              {:else}
                <a href="/comprobantes/factura:{item.invoiceId}">Ver comprobante</a>
              {/if}
            </td>
          </tr>
        {/each}
      </tbody>
    </table>
  </div>
{/if}

<Dialog
  bind:open={confirmOpen}
  title="Completar desde ARCA"
  description="Se copiará el desglose informado por ARCA. Después puede ajustarlo desde el detalle, viendo el comprobante."
>
  <ul class="preview">
    {#each confirmTargets as target (target.invoiceId)}
      <li>
        <div class="preview-head">
          <strong>
            {formatInvoiceLabel(target.invoiceType, target.pointOfSale, target.invoiceNumber)}
          </strong>
          <span class="muted">{target.emitterName ?? formatCuit(target.emitterCuit)}</span>
        </div>
        <ul class="preview-lines">
          {#each target.arcaLines ?? [] as line}
            <li>
              <span>{bucketLabel(line.concept, line.rate)}</span>
              <span class="num">{formatCurrency(line.amount)}</span>
            </li>
          {/each}
        </ul>
      </li>
    {/each}
  </ul>
  <div class="dialog-actions">
    <Button variant="secondary" disabled={completing} onclick={() => (confirmOpen = false)}>
      Cancelar
    </Button>
    <Button variant="primary" disabled={completing} onclick={confirmComplete}>
      {completing ? 'Completando...' : 'Completar'}
    </Button>
  </div>
</Dialog>

<Toaster position="top-right" richColors />

<style>
  .header {
    margin-bottom: var(--spacing-6);
  }

  .header h1 {
    margin: 0.25rem 0 0.5rem;
    font-size: var(--font-size-3xl);
    color: var(--color-text-primary);
  }

  .lede {
    margin: 0;
    color: var(--color-text-secondary);
    line-height: var(--line-height-relaxed);
  }

  .eyebrow {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-semibold);
  }

  .toolbar {
    margin-bottom: var(--spacing-4);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    margin-bottom: var(--spacing-4);
  }

  .chip {
    font-family: var(--font-sans);
    font-size: var(--font-size-sm);
    padding: var(--spacing-1) var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-full);
    background: var(--color-surface);
    color: var(--color-text-secondary);
    cursor: pointer;
  }

  .chip:hover {
    background: var(--color-surface-alt);
  }

  .chip.active {
    border-color: var(--color-primary-500);
    color: var(--color-text-primary);
    font-weight: var(--font-weight-semibold);
    background: color-mix(in srgb, var(--color-primary-500) 10%, var(--color-surface));
  }

  .chip:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 2px;
  }

  .chip-count {
    margin-left: var(--spacing-1);
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .actions-bar {
    display: flex;
    justify-content: flex-end;
    margin-bottom: var(--spacing-3);
  }

  .state {
    display: flex;
    align-items: center;
    gap: var(--spacing-2);
    padding: var(--spacing-8) var(--spacing-4);
    color: var(--color-text-secondary);
    justify-content: center;
  }

  .state.error {
    flex-direction: column;
    color: var(--color-error);
  }

  .state :global(.spin) {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .table-wrap {
    overflow-x: auto;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  th {
    text-align: left;
    padding: var(--spacing-2) var(--spacing-3);
    background: var(--color-surface-alt);
    color: var(--color-text-tertiary);
    font-weight: var(--font-weight-semibold);
    font-size: var(--font-size-xs);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-bottom: 1px solid var(--color-border);
  }

  td {
    padding: var(--spacing-2) var(--spacing-3);
    border-bottom: 1px solid var(--color-border);
    color: var(--color-text-primary);
    vertical-align: middle;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  .col-check {
    width: var(--spacing-8);
    text-align: center;
  }

  .num {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .nowrap {
    white-space: nowrap;
  }

  .emitter {
    max-width: 16rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .detail {
    color: var(--color-text-secondary);
  }

  .stale {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-warning);
    font-weight: var(--font-weight-medium);
  }

  .action {
    text-align: right;
    white-space: nowrap;
  }

  .action a {
    color: var(--color-primary-600);
    text-decoration: none;
    font-weight: var(--font-weight-medium);
  }

  .action a:hover {
    text-decoration: underline;
  }

  .badge {
    display: inline-block;
    padding: 2px var(--spacing-2);
    border-radius: var(--radius-full);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-semibold);
    white-space: nowrap;
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

  .preview {
    list-style: none;
    margin: 0 0 var(--spacing-4);
    padding: 0;
    max-height: 50vh;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .preview-head {
    display: flex;
    flex-wrap: wrap;
    gap: var(--spacing-2);
    align-items: baseline;
    font-size: var(--font-size-sm);
  }

  .muted {
    color: var(--color-text-tertiary);
  }

  .preview-lines {
    list-style: none;
    margin: var(--spacing-1) 0 0;
    padding: 0 0 0 var(--spacing-3);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
  }

  .preview-lines li {
    display: flex;
    justify-content: space-between;
    gap: var(--spacing-4);
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
  }
</style>
