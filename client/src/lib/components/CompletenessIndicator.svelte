<script lang="ts">
  /**
   * Indicadores de completitud para comprobantes.
   *
   * Muestra íconos indicando qué piezas tiene asociadas:
   * - FileText: Archivo físico (PDF)
   * - Check: Factura creada
   * - ClipboardList: Vinculada con expected (AFIP)
   * - Scale: Balanceado (FAC + NCR)
   *
   * El componente encapsula la lógica de determinar qué tiene cada comprobante.
   * Solo necesita recibir el comprobante, no las flags calculadas.
   */

  import type { Comprobante } from '$lib/types/comprobante';
  import { FileText, Check, ClipboardList, Scale } from '$lib/components/icons';

  type Props = {
    comprobante: Comprobante;
  };

  let { comprobante }: Props = $props();

  // Lógica encapsulada: determinar qué piezas tiene
  const fileId = $derived(comprobante.file?.id ?? comprobante.final?.fileId ?? null);
  const finalId = $derived(comprobante.final?.id ?? null);
  const expectedId = $derived(
    comprobante.expected?.id ?? comprobante.final?.expectedInvoiceId ?? null
  );
  const hasFile = $derived(fileId != null);
  const hasFinal = $derived(finalId != null);
  const hasExpected = $derived(expectedId != null);
  // Balance: solo mostrar Scale para el principal del grupo
  const isBalancePrincipal = $derived(comprobante.expected?.isBalanceGroupPrincipal ?? false);
  const balancePrincipalId = $derived(
    isBalancePrincipal ? (comprobante.expected?.id ?? null) : null
  );
</script>

<div class="indicators">
  <span
    class="indicator file"
    class:empty={!hasFile}
    data-tooltip={hasFile ? `file:${fileId}` : undefined}
    aria-label={hasFile ? `Archivo file:${fileId}` : undefined}
  >
    {#if hasFile}<FileText size={14} />{/if}
  </span>
  <span
    class="indicator final"
    class:empty={!hasFinal}
    data-tooltip={hasFinal ? `factura:${finalId}` : undefined}
    aria-label={hasFinal ? `Factura factura:${finalId}` : undefined}
  >
    {#if hasFinal}<Check size={14} />{/if}
  </span>
  <span
    class="indicator expected"
    class:empty={!hasExpected}
    data-tooltip={hasExpected ? `expected:${expectedId}` : undefined}
    aria-label={hasExpected ? `AFIP expected:${expectedId}` : undefined}
  >
    {#if hasExpected}<ClipboardList size={14} />{/if}
  </span>
  <span
    class="indicator balanced"
    class:empty={!isBalancePrincipal}
    data-tooltip={isBalancePrincipal ? `⚖ expected:${balancePrincipalId}` : undefined}
    aria-label={isBalancePrincipal
      ? `Principal de grupo expected:${balancePrincipalId}`
      : undefined}
  >
    {#if isBalancePrincipal}<Scale size={14} />{/if}
  </span>
</div>

<style>
  .indicators {
    display: inline-flex;
    gap: var(--spacing-1);
    align-items: center;
  }

  .indicator {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25em;
    text-align: center;
    cursor: help;
  }

  .indicator.empty {
    visibility: hidden;
  }

  /* CSS tooltip: aparece inmediatamente al hover, mejor que title nativo */
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
    white-space: nowrap;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  }

  .indicator.file {
    color: var(--color-info-600);
  }

  .indicator.final {
    color: var(--color-success-600);
    font-weight: var(--font-weight-semibold);
  }

  .indicator.expected {
    color: var(--color-warning-600);
  }

  .indicator.balanced {
    color: var(--color-primary-600);
  }
</style>
