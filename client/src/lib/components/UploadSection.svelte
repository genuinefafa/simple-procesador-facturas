<script lang="ts">
  import { toast } from 'svelte-sonner';

  interface Props {
    onUpload: (files: File[]) => void;
    isLoading?: boolean;
  }

  let { onUpload, isLoading = false }: Props = $props();

  let uploadedFiles: File[] = $state([]);

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    if (event.dataTransfer?.files) {
      const allowedTypes = [
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/tiff',
        'image/webp',
        'image/heic',
        'image/heif',
      ];
      const newFiles = Array.from(event.dataTransfer.files).filter(
        (file) =>
          allowedTypes.includes(file.type) ||
          /\.(pdf|jpe?g|png|tiff?|webp|heic|heif)$/i.test(file.name)
      );
      uploadedFiles = [...uploadedFiles, ...newFiles];
    }
  }

  function handleFileInput(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const newFiles = Array.from(target.files);
      uploadedFiles = [...uploadedFiles, ...newFiles];
    }
  }

  function removeFile(index: number) {
    uploadedFiles = uploadedFiles.filter((_, i) => i !== index);
  }

  function handleUpload() {
    if (uploadedFiles.length === 0) {
      toast.warning('Seleccioná al menos un archivo');
      return;
    }
    onUpload(uploadedFiles);
  }
</script>

<div class="upload-section">
  <div class="dropzone" ondragover={handleDragOver} ondrop={handleDrop} role="button" tabindex="0">
    <p class="dropzone-icon">📁</p>
    <p class="dropzone-text">Arrastrá archivos aquí</p>
    <p class="dropzone-hint">o hacé click para seleccionar</p>
    <p class="dropzone-formats">Formatos: PDF, JPG, PNG, TIFF, WEBP, HEIC (máx 10MB c/u)</p>
    <input
      type="file"
      multiple
      accept=".pdf,.jpg,.jpeg,.png,.tif,.tiff,.webp,.heic,.heif"
      onchange={handleFileInput}
      class="file-input"
    />
  </div>

  {#if uploadedFiles.length > 0}
    <div class="file-list">
      <h3>Archivos seleccionados ({uploadedFiles.length})</h3>
      {#each uploadedFiles as file, index (index)}
        <div class="file-item">
          <span class="file-icon">
            {file.type === 'application/pdf' ? '📄' : '🖼️'}
          </span>
          <span class="file-name">{file.name}</span>
          <span class="file-size">{(file.size / 1024).toFixed(0)} KB</span>
          <button class="btn-remove" onclick={() => removeFile(index)}>✕</button>
        </div>
      {/each}
    </div>

    <div class="upload-actions">
      <button class="btn btn-primary btn-large" onclick={handleUpload} disabled={isLoading}>
        {#if isLoading}
          ⏳ Procesando...
        {:else}
          🚀 Subir y Procesar ({uploadedFiles.length} archivos)
        {/if}
      </button>
      <button class="btn btn-secondary" onclick={() => (uploadedFiles = [])} disabled={isLoading}>
        🗑️ Limpiar todo
      </button>
    </div>
  {/if}
</div>

<style>
  .upload-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .dropzone {
    position: relative;
    border: 3px dashed #cbd5e1;
    border-radius: 12px;
    padding: 4rem 2rem;
    text-align: center;
    background: white;
    transition: all 0.3s;
    cursor: pointer;
  }

  .dropzone:hover {
    border-color: #2563eb;
    background: #f8fafc;
  }

  .dropzone-icon {
    font-size: 4rem;
    margin: 0;
  }

  .dropzone-text {
    font-size: 1.5rem;
    font-weight: 600;
    color: #1e293b;
    margin: 1rem 0 0.5rem 0;
  }

  .dropzone-hint {
    color: #64748b;
    margin: 0;
  }

  .dropzone-formats {
    font-size: 0.9rem;
    color: #94a3b8;
    margin-top: 1rem;
  }

  .file-input {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .file-list {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
  }

  .file-list h3 {
    margin: 0 0 1rem 0;
    color: #1e293b;
  }

  .file-item {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.75rem;
    border-bottom: 1px solid #f1f5f9;
  }

  .file-item:last-child {
    border-bottom: none;
  }

  .file-icon {
    font-size: 1.5rem;
  }

  .file-name {
    flex: 1;
    font-weight: 500;
    color: #334155;
  }

  .file-size {
    color: #64748b;
    font-size: 0.9rem;
    font-family: monospace;
  }

  .btn-remove {
    background: #fee2e2;
    color: #dc2626;
    border: none;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .btn-remove:hover {
    background: #fecaca;
  }

  .upload-actions {
    display: flex;
    gap: 1rem;
  }

  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    display: inline-block;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    background: #2563eb;
    color: white;
  }

  .btn-primary:hover:not(:disabled) {
    background: #1d4ed8;
  }

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .btn-large {
    flex: 1;
    font-size: 1.1rem;
    padding: 1rem 2rem;
  }
</style>
