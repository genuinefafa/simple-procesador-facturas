<script lang="ts">
  /**
   * Dialog for selecting file reprocessing method.
   * Extracted from SourceComparison for Single Responsibility.
   */

  import Dialog from './ui/Dialog.svelte';

  export type ExtractionMethod = 'ocr' | 'pdf_text' | 'qr';

  type Props = {
    /** Whether the dialog is open */
    open: boolean;
    /** Callback when a method is selected */
    onselect: (method: ExtractionMethod) => void;
    /** Callback when dialog is closed */
    onclose: () => void;
    /** Whether processing is in progress */
    processing?: boolean;
  };

  let { open = $bindable(), onselect, onclose, processing = false }: Props = $props();

  function handleSelect(method: ExtractionMethod) {
    onselect(method);
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      onclose();
    }
  }
</script>

<Dialog bind:open title="Reprocesar archivo" onOpenChange={handleOpenChange}>
  <p class="dialog-text">Elegí el método de extracción:</p>

  <div class="method-options">
    <button
      type="button"
      class="method-option"
      onclick={() => handleSelect('ocr')}
      disabled={processing}
    >
      <span class="method-icon">🔍</span>
      <span class="method-name">OCR</span>
      <span class="method-desc">Reconocimiento óptico de caracteres (imágenes)</span>
    </button>

    <button
      type="button"
      class="method-option"
      onclick={() => handleSelect('pdf_text')}
      disabled={processing}
    >
      <span class="method-icon">📄</span>
      <span class="method-name">PDF Text</span>
      <span class="method-desc">Extraer texto embebido del PDF</span>
    </button>

    <button
      type="button"
      class="method-option"
      onclick={() => handleSelect('qr')}
      disabled={processing}
    >
      <span class="method-icon">📱</span>
      <span class="method-name">QR</span>
      <span class="method-desc">Leer código QR de AFIP</span>
    </button>
  </div>
</Dialog>

<style>
  .dialog-text {
    margin: 0 0 var(--spacing-3);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
  }

  .method-options {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-2);
  }

  .method-option {
    display: flex;
    align-items: center;
    gap: var(--spacing-3);
    padding: var(--spacing-3);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    cursor: pointer;
    text-align: left;
    transition: all var(--transition-fast);
  }

  .method-option:hover:not(:disabled) {
    border-color: var(--color-primary-300);
    background: var(--color-primary-50);
  }

  .method-option:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .method-icon {
    font-size: var(--font-size-xl);
  }

  .method-name {
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .method-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  @media (max-width: 640px) {
    .method-desc {
      display: none;
    }
  }
</style>
