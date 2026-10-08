<script lang="ts">
  /**
   * Panel shown under a comprobante row: compact comparison of the invoice
   * breakdown with ARCA, the reason, and the actions available from the list.
   * Normalize / accept difference live only in the detail view.
   */
  import { goto } from '$app/navigation';
  import Button from '$lib/components/ui/Button.svelte';
  import CompleteFromArcaDialog from '$lib/components/CompleteFromArcaDialog.svelte';
  import TaxBreakdownCompareTable from '$lib/components/TaxBreakdownCompareTable.svelte';
  import { formatCuit, formatInvoiceLabel } from '$lib/formatters';
  import { reconciliationService } from '$lib/services/ReconciliationService';
  import {
    REASON_LABELS,
    type TaxReconciliationItem,
  } from '$lib/services/ReconciliationService.types';

  interface Props {
    invoiceId: number;
    /** Called after the breakdown was copied from ARCA */
    onapplied?: () => void;
  }

  let { invoiceId, onapplied }: Props = $props();

  let item = $state<TaxReconciliationItem | null>(null);
  let loadError = $state<string | null>(null);
  let confirmOpen = $state(false);
  let requestId = 0;

  async function load() {
    const id = ++requestId;
    loadError = null;
    const result = await reconciliationService.get(invoiceId);
    if (id !== requestId) return;
    if (result.success && result.data) item = result.data;
    else loadError = result.error ?? 'No se pudo cargar la comparación.';
  }

  $effect(() => {
    void invoiceId;
    load();
  });

  const completeItems = $derived(
    item && item.status === 'completable' && item.arcaLines
      ? [
          {
            invoiceId: item.invoiceId,
            label: formatInvoiceLabel(item.invoiceType, item.pointOfSale, item.invoiceNumber),
            emitter: item.emitterName ?? formatCuit(item.emitterCuit),
            arcaLines: item.arcaLines,
          },
        ]
      : []
  );
</script>

<div class="panel">
  {#if loadError}
    <div class="state error" role="alert">
      <p>{loadError}</p>
      <Button size="sm" variant="secondary" onclick={load}>Reintentar</Button>
    </div>
  {:else if !item}
    <p class="state">Cargando comparación...</p>
  {:else}
    <TaxBreakdownCompareTable {item} />
    <p class="reason">
      {REASON_LABELS[item.reason]}
      {#if item.ackStale}
        <span class="stale">ARCA cambió desde que se aceptó la diferencia.</span>
      {/if}
    </p>
    <div class="actions">
      {#if item.status === 'completable'}
        <Button size="sm" variant="primary" onclick={() => (confirmOpen = true)}>
          Copiar desde ARCA
        </Button>
      {:else if item.status === 'divergent' || item.reason === 'accepted'}
        <Button
          size="sm"
          variant="secondary"
          onclick={() => goto(`/comprobantes/factura:${invoiceId}?compare=desglose`)}
        >
          Ver diferencias
        </Button>
      {/if}
    </div>
  {/if}
</div>

<CompleteFromArcaDialog bind:open={confirmOpen} items={completeItems} {onapplied} />

<style>
  .panel {
    grid-column: 1 / -1;
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    max-width: 44rem;
    padding: var(--spacing-2) 0 var(--spacing-2) var(--spacing-6);
  }

  .reason {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .stale {
    display: block;
    font-size: var(--font-size-xs);
    color: var(--color-warning);
    font-weight: var(--font-weight-medium);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
  }

  .state {
    margin: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .state.error {
    color: var(--color-error);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
    align-items: flex-start;
  }
</style>
