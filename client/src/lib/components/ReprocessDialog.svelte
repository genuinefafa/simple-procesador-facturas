<script lang="ts">
  /**
   * Dialog for selecting file reprocessing method.
   * Extracted from SourceComparison for Single Responsibility.
   * Shows which methods already have extractions and warns before overwriting.
   */

  import Dialog from './ui/Dialog.svelte';
  import { Check } from 'lucide-svelte';

  export type ExtractionMethod = 'ocr' | 'pdf_text' | 'qr';

  type Props = {
    /** Whether the dialog is open */
    open: boolean;
    /** Methods that already have extractions */
    existingMethods?: string[];
    /** Callback when a method is selected */
    onselect: (method: ExtractionMethod) => void;
    /** Callback when dialog is closed */
    onclose: () => void;
    /** Whether processing is in progress */
    processing?: boolean;
  };

  let {
    open = $bindable(),
    existingMethods = [],
    onselect,
    onclose,
    processing = false,
  }: Props = $props();

  // Normalize method names for comparison
  function hasExisting(method: ExtractionMethod): boolean {
    const normalized = method.toUpperCase();
    return existingMethods.some((m) => m?.toUpperCase() === normalized);
  }

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
      class:has-existing={hasExisting('ocr')}
      onclick={() => handleSelect('ocr')}
      disabled={processing}
    >
      <span class="method-icon">🔍</span>
      <span class="method-name">
        OCR
        {#if hasExisting('ocr')}
          <span class="existing-badge" title="Ya existe una extracción con este método">
            <Check size={12} />
          </span>
        {/if}
      </span>
      <span class="method-desc">Reconocimiento óptico de caracteres (imágenes)</span>
    </button>

    <button
      type="button"
      class="method-option"
      class:has-existing={hasExisting('pdf_text')}
      onclick={() => handleSelect('pdf_text')}
      disabled={processing}
    >
      <span class="method-icon">📄</span>
      <span class="method-name">
        PDF Text
        {#if hasExisting('pdf_text')}
          <span class="existing-badge" title="Ya existe una extracción con este método">
            <Check size={12} />
          </span>
        {/if}
      </span>
      <span class="method-desc">Extraer texto embebido del PDF</span>
    </button>

    <button
      type="button"
      class="method-option"
      class:has-existing={hasExisting('qr')}
      onclick={() => handleSelect('qr')}
      disabled={processing}
    >
      <span class="method-icon">📱</span>
      <span class="method-name">
        QR
        {#if hasExisting('qr')}
          <span class="existing-badge" title="Ya existe una extracción con este método">
            <Check size={12} />
          </span>
        {/if}
      </span>
      <span class="method-desc">Leer código QR de AFIP/ARCA</span>
    </button>
  </div>

  {#if existingMethods.length > 0}
    <p class="existing-note">
      <Check size={12} /> indica que ya existe una extracción. Reprocesar la reemplazará.
    </p>
  {/if}
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

  .method-option.has-existing {
    border-color: var(--color-success-200);
    background: var(--color-success-50);
  }

  .method-option.has-existing:hover:not(:disabled) {
    border-color: var(--color-success-300);
    background: var(--color-success-100);
  }

  .method-icon {
    font-size: var(--font-size-xl);
    flex-shrink: 0;
  }

  .method-name {
    display: inline-flex;
    align-items: center;
    gap: var(--spacing-1);
    font-weight: var(--font-weight-medium);
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
  }

  .method-desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  .existing-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1rem;
    height: 1rem;
    background: var(--color-success-500);
    color: white;
    border-radius: var(--radius-full);
    flex-shrink: 0;
  }

  .existing-note {
    display: flex;
    align-items: center;
    gap: var(--spacing-1);
    margin-top: var(--spacing-3);
    padding: var(--spacing-2);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    background: var(--color-surface-alt);
    border-radius: var(--radius-sm);
  }

  @media (max-width: 640px) {
    .method-desc {
      display: none;
    }
  }
</style>
