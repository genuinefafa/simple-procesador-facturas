<script lang="ts">
  /**
   * Indicadores de completitud para comprobantes.
   *
   * Muestra íconos indicando qué piezas tiene asociadas:
   * - FileText: Archivo físico (PDF)
   * - Check: Factura creada
   * - ClipboardList: Vinculada con expected (AFIP)
   *
   * El componente encapsula la lógica de determinar qué tiene cada comprobante.
   * Solo necesita recibir el comprobante, no las flags calculadas.
   */

  import type { Comprobante } from '$lib/types/comprobante';
  import { FileText, Check, ClipboardList } from '$lib/components/icons';

  type Props = {
    comprobante: Comprobante;
  };

  let { comprobante }: Props = $props();

  // Lógica encapsulada: determinar qué piezas tiene
  const hasFile = $derived(!!comprobante.file || !!comprobante.final?.fileId);
  const hasFinal = $derived(!!comprobante.final);
  const hasExpected = $derived(!!comprobante.expected || !!comprobante.final?.expectedInvoiceId);
</script>

<div class="indicators">
  <span class="indicator file" class:empty={!hasFile} title={hasFile ? 'Tiene archivo (PDF)' : ''}>
    {#if hasFile}<FileText size={14} />{/if}
  </span>
  <span class="indicator final" class:empty={!hasFinal} title={hasFinal ? 'Factura creada' : ''}>
    {#if hasFinal}<Check size={14} />{/if}
  </span>
  <span
    class="indicator expected"
    class:empty={!hasExpected}
    title={hasExpected ? 'Vinculada con AFIP' : ''}
  >
    {#if hasExpected}<ClipboardList size={14} />{/if}
  </span>
</div>

<style>
  .indicators {
    display: inline-flex;
    gap: var(--spacing-1);
    align-items: center;
  }

  .indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.25em;
    text-align: center;
  }

  .indicator.empty {
    visibility: hidden;
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
</style>
