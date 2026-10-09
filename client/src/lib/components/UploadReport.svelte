<script lang="ts">
  import { goto } from '$app/navigation';
  import ReportPanel from '$lib/components/ReportPanel.svelte';
  import { Upload, CheckCircle, AlertTriangle, XCircle, ArrowRight } from '$lib/components/icons';

  interface UploadedFile {
    fileId: number;
    name: string;
    size: number;
    hashPreview?: string;
  }

  interface ErrorFile {
    name: string;
    error: string;
    type?: 'duplicate';
    duplicateType?: 'file' | 'invoice';
    duplicateId?: number;
    duplicateFilename?: string;
  }

  interface Props {
    uploadedFiles: UploadedFile[];
    errors: ErrorFile[];
    onClose: () => void;
  }

  let { uploadedFiles, errors, onClose }: Props = $props();

  const successCount = $derived(uploadedFiles.length);
  const duplicateCount = $derived(errors.filter((e) => e.type === 'duplicate').length);
  const errorCount = $derived(errors.length - duplicateCount);

  function handleComprobanteClick(type: 'file' | 'invoice', id: number) {
    const comprobanteId = type === 'file' ? `file:${id}` : `factura:${id}`;
    goto(`/comprobantes/${comprobanteId}`);
  }
</script>

<ReportPanel title="Resultado de importación" {onClose}>
  {#snippet icon()}<Upload size={18} />{/snippet}

  <div class="summary">
    {#if successCount > 0}
      <div class="summary-item success">
        <span class="icon"><CheckCircle size={18} /></span>
        <span
          >{successCount} archivo{successCount !== 1 ? 's' : ''} procesado{successCount !== 1
            ? 's'
            : ''} correctamente</span
        >
      </div>
    {/if}

    {#if duplicateCount > 0}
      <div class="summary-item warning">
        <span class="icon"><AlertTriangle size={18} /></span>
        <span
          >{duplicateCount} archivo{duplicateCount !== 1 ? 's duplicado' : ' duplicado'} (ya existe{duplicateCount !==
          1
            ? 'n'
            : ''})</span
        >
      </div>
    {/if}

    {#if errorCount > 0}
      <div class="summary-item error">
        <span class="icon"><XCircle size={18} /></span>
        <span
          >{errorCount} archivo{errorCount !== 1 ? 's' : ''} con error{errorCount !== 1
            ? 'es'
            : ''}</span
        >
      </div>
    {/if}
  </div>

  {#if duplicateCount > 0}
    <div class="section">
      <h4>Duplicados detectados:</h4>
      <ul class="file-list">
        {#each errors.filter((e) => e.type === 'duplicate') as err}
          <li class="duplicate-item">
            <span class="filename">{err.name}</span>
            <span class="arrow"><ArrowRight size={14} /></span>
            {#if err.duplicateType && err.duplicateId}
              <button
                class="link-button"
                onclick={() => handleComprobanteClick(err.duplicateType!, err.duplicateId!)}
              >
                {err.duplicateType === 'file' ? 'archivo' : 'factura'}:{err.duplicateId}
              </button>
            {:else}
              <span class="duplicate-info">{err.error}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if successCount > 0}
    <div class="section">
      <h4>Nuevos archivos creados:</h4>
      <ul class="file-list">
        {#each uploadedFiles as file}
          <li class="success-item">
            <span class="filename">{file.name}</span>
            <span class="arrow"><ArrowRight size={14} /></span>
            <button class="link-button" onclick={() => handleComprobanteClick('file', file.fileId)}>
              file:{file.fileId}
            </button>
            {#if file.hashPreview}
              <span class="hash">{file.hashPreview}...</span>
            {/if}
          </li>
        {/each}
      </ul>
    </div>
  {/if}

  {#if errorCount > 0}
    <div class="section">
      <h4>Errores:</h4>
      <ul class="file-list">
        {#each errors.filter((e) => e.type !== 'duplicate') as err}
          <li class="error-item">
            <span class="filename">{err.name}</span>
            <span class="error-message">{err.error}</span>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</ReportPanel>
