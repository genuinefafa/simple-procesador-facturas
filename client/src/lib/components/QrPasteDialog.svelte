<script lang="ts">
  /**
   * Dialog para pegar manualmente una URL de QR AFIP/ARCA cuando el scanner
   * automático (zxing-wasm) no pudo decodificar el código.
   *
   * Caso típico: tickets térmicos Coto muy degradados que iOS/Android sí leen
   * pero zxing-wasm no. Ver issue #173.
   */

  import Dialog from './ui/Dialog.svelte';
  import Button from './ui/Button.svelte';

  type Props = {
    open: boolean;
    onsubmit: (qrUrl: string) => Promise<void> | void;
    onclose: () => void;
    processing?: boolean;
    /** Error del último intento (se muestra bajo el textarea) */
    errorMessage?: string | null;
  };

  let {
    open = $bindable(),
    onsubmit,
    onclose,
    processing = false,
    errorMessage = null,
  }: Props = $props();

  let qrUrl = $state('');

  const isValidPrefix = $derived(
    qrUrl.trim().startsWith('https://www.afip.gob.ar/fe/qr/') ||
      qrUrl.trim().startsWith('https://www.arca.gob.ar/fe/qr/') ||
      qrUrl.trim().startsWith('https://servicioscf.afip.gob.ar/') ||
      qrUrl.trim().startsWith('https://serviciosweb.afip.gob.ar/')
  );

  const canSubmit = $derived(qrUrl.trim().length > 0 && isValidPrefix && !processing);

  async function handleSubmit() {
    if (!canSubmit) return;
    await onsubmit(qrUrl.trim());
  }

  function handleOpenChange(isOpen: boolean) {
    if (!isOpen) {
      qrUrl = '';
      onclose();
    }
  }
</script>

<Dialog
  bind:open
  title="Pegar URL de QR"
  description="Si escaneaste el QR con otra app (iOS/Android) y copiaste el link, pegalo acá."
  onOpenChange={handleOpenChange}
>
  <div class="form">
    <label for="qr-url" class="label">URL del QR AFIP/ARCA</label>
    <textarea
      id="qr-url"
      class="textarea"
      bind:value={qrUrl}
      placeholder="https://www.arca.gob.ar/fe/qr/?p=..."
      rows="4"
      disabled={processing}
      spellcheck="false"
      autocapitalize="off"
    ></textarea>

    {#if qrUrl.trim().length > 0 && !isValidPrefix}
      <p class="hint warning">
        La URL debe empezar con <code>https://www.afip.gob.ar/fe/qr/</code> o
        <code>https://www.arca.gob.ar/fe/qr/</code>.
      </p>
    {/if}

    {#if errorMessage}
      <p class="hint error">{errorMessage}</p>
    {/if}

    <div class="actions">
      <Button variant="secondary" onclick={() => handleOpenChange(false)} disabled={processing}>
        Cancelar
      </Button>
      <Button variant="primary" onclick={handleSubmit} disabled={!canSubmit}>
        {processing ? 'Procesando…' : 'Procesar URL'}
      </Button>
    </div>
  </div>
</Dialog>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-3);
  }

  .label {
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
    color: var(--color-text-secondary);
  }

  .textarea {
    width: 100%;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    padding: var(--spacing-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-surface);
    color: var(--color-text-primary);
    resize: vertical;
    word-break: break-all;
  }

  .textarea:focus-visible {
    outline: 2px solid var(--color-primary-500);
    outline-offset: 1px;
    border-color: var(--color-primary-500);
  }

  .hint {
    margin: 0;
    font-size: var(--font-size-xs);
    line-height: var(--line-height-normal);
  }

  .hint.warning {
    color: var(--color-warning-700);
  }

  .hint.error {
    color: var(--color-danger-700);
  }

  .hint code {
    font-family: var(--font-family-mono);
    background: var(--color-surface-alt);
    padding: 0 var(--spacing-1);
    border-radius: var(--radius-sm);
  }

  .actions {
    display: flex;
    gap: var(--spacing-2);
    justify-content: flex-end;
    margin-top: var(--spacing-2);
  }
</style>
