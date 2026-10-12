<script lang="ts">
  /**
   * InvoiceTypeLabel - Consistent display of an ARCA invoice type:
   * icon + "Description (code)" + friendly type in secondary tone.
   * Used in read-only details and in InvoiceTypeSelect options.
   */
  import { getInvoiceTypeFromARCA } from '$lib/formatters';

  type Props = {
    code: number | null | undefined;
    /** Icon size in px (14 for dense lists, 16 for details) */
    iconSize?: number;
  };

  let { code, iconSize = 14 }: Props = $props();

  const info = $derived(getInvoiceTypeFromARCA(code));
</script>

{#if code === null || code === undefined}
  <span class="invoice-type-label empty">—</span>
{:else}
  {@const Icon = info.icon}
  <span class="invoice-type-label">
    <span class="icon" aria-hidden="true"><Icon size={iconSize} /></span>
    <span class="text">{info.description} ({code})</span>
    <span class="friendly">{info.friendlyType}</span>
  </span>
{/if}

<style>
  .invoice-type-label {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-2);
    min-width: 0;
  }

  .icon {
    display: flex;
    flex-shrink: 0;
    color: var(--color-text-secondary);
  }

  .text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .friendly {
    flex-shrink: 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .empty {
    color: var(--color-text-secondary);
  }
</style>
