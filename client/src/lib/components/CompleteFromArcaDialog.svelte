<script lang="ts">
  /**
   * Confirmation dialog to copy the ARCA breakdown into invoices that have
   * none. Shows a preview per invoice; nothing is copied until confirmed.
   */
  import { toast } from 'svelte-sonner';
  import Button from '$lib/components/ui/Button.svelte';
  import Dialog from '$lib/components/ui/Dialog.svelte';
  import { formatCurrency } from '$lib/formatters';
  import { reconciliationService } from '$lib/services/ReconciliationService';
  import {
    bucketLabel,
    type CompleteResponse,
    type ReconciliationLine,
  } from '$lib/services/ReconciliationService.types';

  export interface CompleteItem {
    invoiceId: number;
    /** e.g. "FACA 0001-00001234" */
    label: string;
    emitter?: string | null;
    arcaLines: ReconciliationLine[];
  }

  interface Props {
    open?: boolean;
    items: CompleteItem[];
    /** Called after the server applied the copy (even if some were skipped); the caller reports it */
    onapplied?: (result: CompleteResponse) => void;
  }

  let { open = $bindable(false), items, onapplied }: Props = $props();

  let completing = $state(false);

  async function confirm() {
    completing = true;
    const result = await reconciliationService.complete(items.map((i) => i.invoiceId));
    completing = false;
    if (!result.success || !result.data) {
      toast.error(result.error ?? 'No se pudo completar el desglose.');
      return;
    }
    open = false;
    onapplied?.(result.data);
  }
</script>

<Dialog
  bind:open
  title="Completar desde ARCA"
  description="Se copiará el desglose informado por ARCA. Después puede ajustarlo desde el detalle, viendo el comprobante."
>
  <ul class="preview">
    {#each items as item (item.invoiceId)}
      <li>
        <div class="preview-head">
          <strong>{item.label}</strong>
          {#if item.emitter}<span class="muted">{item.emitter}</span>{/if}
        </div>
        <ul class="preview-lines">
          {#each item.arcaLines as line, i (i)}
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
    <Button variant="secondary" disabled={completing} onclick={() => (open = false)}>
      Cancelar
    </Button>
    <Button variant="primary" disabled={completing} onclick={confirm}>
      {completing ? 'Completando...' : 'Completar'}
    </Button>
  </div>
</Dialog>

<style>
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

  .num {
    font-variant-numeric: tabular-nums;
  }

  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--spacing-2);
  }
</style>
