<script lang="ts">
  /**
   * Indicadores de completitud para comprobantes.
   *
   * Muestra íconos indicando qué piezas tiene asociadas:
   * - 📄 Archivo físico (PDF)
   * - ✓ Factura creada
   * - 📋 Vinculada con expected (AFIP)
   *
   * El componente encapsula la lógica de determinar qué tiene cada comprobante.
   * Solo necesita recibir el comprobante, no las flags calculadas.
   */

  import type { Comprobante } from '$lib/types/comprobante';

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
  {#if hasFile}
    <span class="indicator file" title="Tiene archivo (PDF)">📄</span>
  {/if}
  {#if hasFinal}
    <span class="indicator final" title="Factura creada">✓</span>
  {/if}
  {#if hasExpected}
    <span class="indicator expected" title="Vinculada con AFIP">📋</span>
  {/if}
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
    font-size: var(--font-size-sm);
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
