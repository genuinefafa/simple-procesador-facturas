<script lang="ts">
  import { goto } from '$app/navigation';

  interface UploadedFile {
    pendingFileId: number;
    name: string;
    size: number;
    hashPreview?: string;
  }

  interface ErrorFile {
    name: string;
    error: string;
    type?: 'duplicate';
    duplicateType?: 'pending' | 'invoice';
    duplicateId?: number;
    duplicateFilename?: string;
  }

  interface Props {
    uploadedFiles: UploadedFile[];
    errors: ErrorFile[];
    onClose: () => void;
  }

  let { uploadedFiles, errors, onClose }: Props = $props();

  const successCount = uploadedFiles.length;
  const duplicateCount = errors.filter((e) => e.type === 'duplicate').length;
  const errorCount = errors.length - duplicateCount;

  function handleComprobanteClick(type: 'pending' | 'invoice', id: number) {
    const comprobanteId = type === 'pending' ? `pending:${id}` : `factura:${id}`;
    goto(`/comprobantes/${comprobanteId}`);
  }
</script>

<div class="upload-report">
  <div class="header">
    <h3>📤 Resultado de importación</h3>
    <button class="close-btn" onclick={onClose} aria-label="Cerrar">×</button>
  </div>

  <div class="summary">
    {#if successCount > 0}
      <div class="summary-item success">
        <span class="icon">✅</span>
        <span
          >{successCount} archivo{successCount !== 1 ? 's' : ''} procesado{successCount !== 1
            ? 's'
            : ''} correctamente</span
        >
      </div>
    {/if}

    {#if duplicateCount > 0}
      <div class="summary-item warning">
        <span class="icon">⚠️</span>
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
        <span class="icon">❌</span>
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
            <span class="arrow">→</span>
            {#if err.duplicateType && err.duplicateId}
              <button
                class="link-button"
                onclick={() => handleComprobanteClick(err.duplicateType!, err.duplicateId!)}
              >
                {err.duplicateType === 'pending' ? 'pendiente' : 'factura'}:{err.duplicateId}
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
      <h4>Nuevos pendientes creados:</h4>
      <ul class="file-list">
        {#each uploadedFiles as file}
          <li class="success-item">
            <span class="filename">{file.name}</span>
            <span class="arrow">→</span>
            <button
              class="link-button"
              onclick={() => handleComprobanteClick('pending', file.pendingFileId)}
            >
              pending:{file.pendingFileId}
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
</div>

<style>
  .upload-report {
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border);
  }

  .header h3 {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 1.5rem;
    cursor: pointer;
    color: var(--color-text-secondary);
    padding: 0;
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: background-color 0.2s;
  }

  .close-btn:hover {
    background-color: var(--color-border);
  }

  .summary {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }

  .summary-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-radius: 4px;
    font-weight: 500;
  }

  .summary-item.success {
    background-color: #d4edda;
    color: #155724;
  }

  .summary-item.warning {
    background-color: #fff3cd;
    color: #856404;
  }

  .summary-item.error {
    background-color: #f8d7da;
    color: #721c24;
  }

  .section {
    margin-top: 1.5rem;
  }

  .section h4 {
    margin: 0 0 0.75rem 0;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  .file-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .file-list li {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.5rem;
    font-size: 0.85rem;
    border-left: 3px solid transparent;
  }

  .duplicate-item {
    background-color: #fff8e1;
    border-left-color: #ffc107;
  }

  .success-item {
    background-color: #e8f5e9;
    border-left-color: #4caf50;
  }

  .error-item {
    background-color: #ffebee;
    border-left-color: #f44336;
  }

  .filename {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.8rem;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .arrow {
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .link-button {
    background: none;
    border: none;
    color: #1976d2;
    cursor: pointer;
    text-decoration: underline;
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.85rem;
    padding: 0;
  }

  .link-button:hover {
    color: #1565c0;
  }

  .hash {
    font-family: 'Monaco', 'Menlo', monospace;
    font-size: 0.75rem;
    color: var(--color-text-secondary);
    margin-left: auto;
  }

  .duplicate-info {
    font-size: 0.85rem;
    color: var(--color-text-secondary);
  }

  .error-message {
    font-size: 0.85rem;
    color: #c62828;
    margin-top: 0.25rem;
  }
</style>
