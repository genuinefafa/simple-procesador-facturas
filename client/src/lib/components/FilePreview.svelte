<script lang="ts">
  type Props = {
    src: string;
    filename: string;
    showZoom?: boolean;
    maxHeight?: string;
    onError?: () => void;
  };

  let { src, filename, showZoom = false, maxHeight, onError }: Props = $props();

  let zoomLevel = $state(100);

  function zoomIn() {
    zoomLevel = Math.min(zoomLevel + 25, 200);
  }

  function zoomOut() {
    zoomLevel = Math.max(zoomLevel - 25, 50);
  }

  function resetZoom() {
    zoomLevel = 100;
  }

  // Detectar el tipo de archivo
  const isPdf = $derived(filename.toLowerCase().endsWith('.pdf'));
  const isImage = $derived(
    filename.toLowerCase().match(/\.(jpg|jpeg|png|tif|tiff|webp|heic|heif)$/)
  );
</script>

<div class="file-preview-wrapper">
  {#if showZoom && isImage}
    <div class="zoom-controls">
      <button class="zoom-btn" onclick={zoomOut} title="Alejar" disabled={zoomLevel <= 50}>
        −
      </button>
      <span class="zoom-label">{zoomLevel}%</span>
      <button class="zoom-btn" onclick={zoomIn} title="Acercar" disabled={zoomLevel >= 200}>
        +
      </button>
      <button class="zoom-btn" onclick={resetZoom} title="Restablecer">⟲</button>
    </div>
  {/if}

  {#if isPdf}
    <!-- PDF: usa el toolbar nativo con zoom integrado -->
    <iframe
      src="{src}#navpanes=0"
      title="Preview de {filename}"
      class="pdf-preview"
      onerror={onError}
    ></iframe>
  {:else if isImage}
    <!-- Imágenes: contenedor con scroll propio y zoom por CSS -->
    <div class="image-container" style:max-height={maxHeight}>
      <div class="image-content" style="transform: scale({zoomLevel / 100}); transform-origin: center;">
        <img
          {src}
          alt="Preview de {filename}"
          class="image-preview"
          onerror={onError}
        />
      </div>
    </div>
  {:else}
    <div class="preview-error">
      <p>Vista previa no disponible</p>
      <p class="filename">{filename}</p>
    </div>
  {/if}
</div>

<style>
  .file-preview-wrapper {
    position: relative;
    background: #f8fafc;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem;
    background: white;
    border-bottom: 1px solid #e5e7eb;
    justify-content: center;
  }

  .zoom-btn {
    width: 32px;
    height: 32px;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    background: white;
    cursor: pointer;
    font-size: 1.2rem;
    font-weight: 600;
    color: #374151;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .zoom-btn:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .zoom-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .zoom-label {
    min-width: 50px;
    text-align: center;
    font-size: 0.9rem;
    font-weight: 500;
    color: #6b7280;
  }

  /* PDF: renderizado directo sin transformaciones */
  .pdf-preview {
    flex: 1;
    width: 100%;
    border: none;
    background: white;
    min-height: 400px;
  }

  /* Imágenes: contenedor con scroll propio */
  .image-container {
    flex: 1;
    overflow: auto;
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 400px;
    background: #f8fafc;
  }

  .image-content {
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.2s ease;
  }

  .image-preview {
    max-width: 100%;
    height: auto;
    object-fit: contain;
    display: block;
  }

  .preview-error {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem;
    color: #64748b;
  }

  .preview-error .filename {
    font-family: monospace;
    font-size: 0.9rem;
    color: #94a3b8;
    margin-top: 0.5rem;
    word-break: break-all;
  }
</style>
