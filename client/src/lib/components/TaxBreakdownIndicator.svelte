<script lang="ts">
  /**
   * Fifth completeness indicator: state of the tax breakdown vs ARCA.
   * Renders a button that toggles the comparison panel under the row.
   * Renders an invisible slot when there is nothing to flag, to keep alignment.
   */
  import type { TaxReconciliationSummary } from '$lib/types/comprobante';
  import { REASON_LABELS } from '$lib/services/ReconciliationService.types';
  import {
    CopyPlus,
    CircleHelp,
    TriangleAlert,
    Diff,
    Pin,
    CheckCheck,
  } from '$lib/components/icons';

  type Props = {
    reconciliation: TaxReconciliationSummary | null | undefined;
    expanded?: boolean;
    ontoggle?: () => void;
  };

  let { reconciliation, expanded = false, ontoggle }: Props = $props();

  type Variant = { icon: typeof CopyPlus; tone: string; tooltip: string };

  const variant = $derived.by((): Variant | null => {
    if (!reconciliation) return null;
    const { status, reason } = reconciliation;
    if (status === 'completable') {
      return {
        icon: CopyPlus,
        tone: 'info',
        tooltip: 'ARCA informa un desglose que cuadra con el total',
      };
    }
    if (status === 'manual' && reason === 'arca_no_breakdown') {
      return { icon: CircleHelp, tone: 'neutral', tooltip: REASON_LABELS.arca_no_breakdown };
    }
    if (status === 'manual' && reason === 'arca_sum_mismatch') {
      return {
        icon: TriangleAlert,
        tone: 'warning',
        tooltip: 'El desglose de ARCA no suma el total',
      };
    }
    if (status === 'divergent') {
      return { icon: Diff, tone: 'danger', tooltip: 'Distinto de ARCA' };
    }
    if (status === 'ok' && reason === 'matches_arca') {
      return { icon: CheckCheck, tone: 'success', tooltip: 'Desglose igual a ARCA' };
    }
    if (status === 'ok' && reason === 'accepted') {
      return { icon: Pin, tone: 'neutral', tooltip: 'Diferencia aceptada' };
    }
    return null;
  });
</script>

{#if variant}
  {@const Icon = variant.icon}
  <button
    type="button"
    class="indicator {variant.tone}"
    class:expanded
    data-tooltip={variant.tooltip}
    aria-label={variant.tooltip}
    aria-expanded={expanded}
    onclick={ontoggle}
  >
    <Icon size={14} />
  </button>
{:else}
  <span class="indicator empty" aria-hidden="true"></span>
{/if}

<style>
  .indicator {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25em;
    padding: 0;
    border: none;
    background: none;
    text-align: center;
    cursor: pointer;
    border-radius: var(--radius-sm);
  }

  .indicator.empty {
    visibility: hidden;
  }

  button.indicator:hover,
  button.indicator.expanded {
    background: var(--color-surface-alt);
  }

  button.indicator:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 1px;
  }

  /* CSS tooltip, same style as CompletenessIndicator */
  .indicator[data-tooltip]:hover::after {
    content: attr(data-tooltip);
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-neutral-900, #1a1a1a);
    color: var(--color-neutral-0, #fff);
    font-size: 11px;
    font-weight: var(--font-weight-medium, 500);
    line-height: 1.4;
    padding: 4px 8px;
    border-radius: 4px;
    width: max-content;
    max-width: var(--tooltip-max-width);
    white-space: normal;
    text-align: center;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .success {
    color: var(--color-success);
  }

  .info {
    color: var(--color-info);
  }

  .neutral {
    color: var(--color-neutral-500);
  }

  .warning {
    color: var(--color-warning);
  }

  .danger {
    color: var(--color-error);
  }
</style>
