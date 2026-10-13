<script lang="ts">
  /**
   * NoVatBadge - "No discrimina IVA" badge for documents that do not itemize
   * VAT (B, C, E, no letter). Renders nothing for A/M or unknown types.
   * CSS tooltip explains the accounting consequence.
   */
  import { CircleMinus } from '$lib/components/icons';
  import { doesNotItemizeVat } from '$lib/formatters';

  type Props = {
    /** ARCA document type code */
    code: number | null | undefined;
  };

  let { code }: Props = $props();

  const TOOLTIP =
    'Los comprobantes B, C y sin letra no informan el IVA por separado. El importe total se registra como neto y no genera crédito fiscal.';
</script>

{#if doesNotItemizeVat(code)}
  <span class="no-vat-badge" data-tooltip={TOOLTIP} aria-label="No discrimina IVA. {TOOLTIP}">
    <CircleMinus size={12} />
    No discrimina IVA
  </span>
{/if}

<style>
  .no-vat-badge {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    padding: 0 var(--spacing-2);
    border-radius: var(--radius-full);
    background: var(--color-neutral-100);
    color: var(--color-text-secondary);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    white-space: nowrap;
    cursor: default;
  }

  /* CSS tooltip (preferred over native title) */
  .no-vat-badge[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + var(--spacing-1));
    left: 0;
    z-index: var(--z-tooltip);
    width: max-content;
    max-width: var(--tooltip-max-width);
    padding: var(--spacing-1) var(--spacing-2);
    border-radius: var(--radius-base);
    background: var(--color-neutral-900);
    color: var(--color-surface);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    line-height: 1.4;
    white-space: normal;
    pointer-events: none;
    box-shadow: var(--shadow-md);
  }
</style>
