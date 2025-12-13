<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, Toaster } from 'svelte-sonner';

  interface PendingFileItem {
    id: number;
    originalFilename: string;
    filePath: string;
    fileSize: number | null;
    uploadDate: string;
    extractedCuit: string | null;
    extractedDate: string | null;
    extractedTotal: number | null;
    extractedType: string | null;
    extractedPointOfSale: number | null;
    extractedInvoiceNumber: number | null;
    extractionConfidence: number | null;
    extractionMethod: string | null;
    extractionErrors: string | null;
    status: 'pending' | 'reviewing' | 'processed' | 'failed';
    invoiceId: number | null;
    createdAt: string;
    updatedAt: string;
  }

  let pendingFilesToReview: PendingFileItem[] = $state([]);
  let pendingFilesStats = $state({ total: 0, pending: 0, reviewing: 0, processed: 0, failed: 0 });
  let loading = $state(false);
  let reviewFilter = $state<'pending' | 'all'>('pending');
  let selectedPendingFiles = $state<Set<number>>(new Set());
  let processing = $state(false);

  // Estado para edición
  let editingFile = $state<number | null>(null);
  let editFormData = $state<Record<number, Partial<PendingFileItem>>>({});

  // Estado para matches de Excel
  let matchesData = $state<Record<number, any>>({});

  onMount(async () => {
    await loadPendingFilesToReview();
  });

  async function loadPendingFilesToReview() {
    loading = true;
    try {
      const response = await fetch('/api/pending-files');
      const data = await response.json();

      if (data.success) {
        const filesToShow =
          reviewFilter === 'pending'
            ? data.files.filter((f: any) => ['pending', 'failed'].includes(f.status))
            : data.files;

        pendingFilesToReview = filesToShow;
        pendingFilesStats = data.stats;

        // Cargar matches para cada archivo
        for (const file of pendingFilesToReview) {
          await loadMatchesForFile(file.id);
        }
      }
    } catch (err) {
      toast.error('Error al cargar archivos');
    } finally {
      loading = false;
    }
  }

  async function loadMatchesForFile(fileId: number) {
    try {
      const response = await fetch(`/api/pending-files/${fileId}/matches`);
      const data = await response.json();
      if (data.success) {
        matchesData[fileId] = data.matches;
      }
    } catch (err) {
      // Silenciar errores de matches
    }
  }

  async function reprocessPendingFile(id: number) {
    const toastId = toast.loading('Reprocesando...');

    try {
      const response = await fetch(`/api/pending-files/${id}/reprocess`, {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        toast.success(`✅ Reprocesado: ${data.extraction.confidence}% confianza`, { id: toastId });
        await loadPendingFilesToReview();
      } else {
        toast.error(data.error || 'Error al reprocesar', { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al reprocesar', { id: toastId });
    }
  }

  async function deletePendingFile(id: number) {
    toast.warning('Hacé click en "Eliminar" de nuevo para confirmar');

    try {
      const response = await fetch(`/api/pending-files/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json();

      if (data.success) {
        await loadPendingFilesToReview();
        toast.success('Archivo eliminado correctamente');
      } else {
        toast.error(data.error || 'Error al eliminar');
      }
    } catch (err) {
      toast.error('Error al eliminar archivo');
    }
  }

  function startEditing(id: number) {
    const file = pendingFilesToReview.find((f) => f.id === id);
    if (file) {
      editFormData[id] = { ...file };
      editingFile = id;
    }
  }

  function cancelEditing() {
    editingFile = null;
  }

  async function saveAndFinalize(id: number) {
    const formData = editFormData[id];
    if (!formData) return;

    try {
      const updateResponse = await fetch(`/api/pending-files/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!updateResponse.ok) {
        toast.error('Error al actualizar datos');
        return;
      }

      const finalizeResponse = await fetch(`/api/pending-files/${id}/finalize`, {
        method: 'POST',
      });
      const data = await finalizeResponse.json();

      if (data.success) {
        toast.success('¡Factura procesada correctamente!');
        await loadPendingFilesToReview();
        editingFile = null;
      } else {
        toast.error(data.error || 'Error al procesar');
      }
    } catch (err) {
      toast.error('Error al guardar');
    }
  }

  function changeReviewFilter(filter: 'pending' | 'all') {
    reviewFilter = filter;
    loadPendingFilesToReview();
  }

  function togglePendingFileSelection(id: number) {
    if (selectedPendingFiles.has(id)) {
      selectedPendingFiles.delete(id);
    } else {
      selectedPendingFiles.add(id);
    }
    selectedPendingFiles = selectedPendingFiles;
  }

  function getStatusText(status: string): string {
    switch (status) {
      case 'pending':
        return '🟡 Pendiente';
      case 'reviewing':
        return '🔵 En Revisión';
      case 'processed':
        return '✅ Procesado';
      case 'failed':
        return '❌ Error';
      default:
        return status;
    }
  }

  function getConfidenceColor(confidence: number | null): string {
    if (!confidence) return 'text-gray-400';
    if (confidence >= 90) return 'text-green-600';
    if (confidence >= 70) return 'text-yellow-600';
    return 'text-red-600';
  }

  function getExtractionMethodLabel(method: string | null): string {
    switch (method) {
      case 'PDF_TEXT':
        return '📄 PDF (texto)';
      case 'OCR':
        return '🔍 OCR (imagen)';
      case 'PDF_TEXT+OCR':
        return '📄🔍 PDF+OCR';
      case 'TEMPLATE':
        return '📋 Template';
      case 'MANUAL':
        return '✏️ Manual';
      default:
        return '❓ Desconocido';
    }
  }
</script>

<svelte:head>
  <title>Revisar - Procesador de Facturas</title>
</svelte:head>

<Toaster position="top-right" richColors />

<div class="review-container">
  <div class="page-header">
    <h1>✏️ Revisar Archivos</h1>
    <p class="subtitle">Revisa y corrige los datos detectados antes de confirmar</p>
  </div>

  <!-- STATS -->
  <div class="stats-bar">
    <div class="stat">
      <span class="stat-value">{pendingFilesStats?.total || 0}</span>
      <span class="stat-label">Total</span>
    </div>
    <div class="stat">
      <span class="stat-value">{pendingFilesStats?.pending || 0}</span>
      <span class="stat-label">Pendientes</span>
    </div>
    <div class="stat">
      <span class="stat-value">{pendingFilesStats?.reviewing || 0}</span>
      <span class="stat-label">En Revisión</span>
    </div>
    <div class="stat">
      <span class="stat-value">{pendingFilesStats?.processed || 0}</span>
      <span class="stat-label">Procesados</span>
    </div>
    <div class="stat">
      <span class="stat-value">{pendingFilesStats?.failed || 0}</span>
      <span class="stat-label">Errores</span>
    </div>
  </div>

  <!-- FILTROS -->
  <div class="filter-bar">
    <div class="filter-buttons">
      <button
        class="filter-btn"
        class:active={reviewFilter === 'pending'}
        onclick={() => changeReviewFilter('pending')}
      >
        🔍 Solo para revisar ({(pendingFilesStats?.pending || 0) +
          (pendingFilesStats?.failed || 0)})
      </button>
      <button
        class="filter-btn"
        class:active={reviewFilter === 'all'}
        onclick={() => changeReviewFilter('all')}
      >
        📋 Todos los archivos ({pendingFilesStats?.total || 0})
      </button>
    </div>
  </div>

  <!-- CONTENIDO -->
  {#if loading}
    <div class="loading">
      <p>⏳ Cargando archivos...</p>
    </div>
  {:else if pendingFilesToReview.length === 0}
    <div class="empty">
      <p>✅ No hay archivos para revisar</p>
      <a href="/importar" class="btn btn-primary">📥 Importar archivos</a>
    </div>
  {:else}
    <div class="review-list">
      {#each pendingFilesToReview as file (file.id)}
        {@const matchInfo = matchesData[file.id]}
        <div class="review-card">
          <div class="review-card-header">
            <div>
              <h3>📄 {file.originalFilename}</h3>
              <p class="meta">
                Subido: {new Date(file.uploadDate).toLocaleString('es-AR')} •
                {file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : ''} •
                {getStatusText(file.status)}
              </p>
            </div>
            {#if file.extractionConfidence !== null}
              <div class={`confidence-badge ${getConfidenceColor(file.extractionConfidence)}`}>
                {file.extractionConfidence}% confianza
              </div>
            {/if}
          </div>

          <!-- PREVIEW -->
          <div class="file-preview">
            {#if file.originalFilename.toLowerCase().endsWith('.pdf')}
              <iframe
                src="/api/pending-files/{file.id}/file"
                title="Preview de {file.originalFilename}"
                class="pdf-iframe"
              ></iframe>
            {:else if file.originalFilename.toLowerCase().match(/\.(jpg|jpeg|png|tif|tiff|webp|heic|heif)$/)}
              <img
                src="/api/pending-files/{file.id}/file"
                alt="Preview de {file.originalFilename}"
                class="image-preview"
              />
            {:else}
              <div class="preview-error">
                <p>Vista previa no disponible</p>
              </div>
            {/if}
          </div>

          <!-- DATOS EXTRAÍDOS -->
          <div class="extracted-data">
            <div class="data-grid">
              <div class="data-item">
                <span class="label">CUIT:</span>
                <span class="value">{file.extractedCuit || '❌ No detectado'}</span>
              </div>
              <div class="data-item">
                <span class="label">Fecha:</span>
                <span class="value">{file.extractedDate || '❌ No detectado'}</span>
              </div>
              <div class="data-item">
                <span class="label">Tipo:</span>
                <span class="value">{file.extractedType || '❌ No detectado'}</span>
              </div>
              <div class="data-item">
                <span class="label">P. Venta:</span>
                <span class="value">{file.extractedPointOfSale ?? '❌ No detectado'}</span>
              </div>
              <div class="data-item">
                <span class="label">Número:</span>
                <span class="value">{file.extractedInvoiceNumber ?? '❌ No detectado'}</span>
              </div>
              <div class="data-item">
                <span class="label">Total:</span>
                <span class="value">
                  {file.extractedTotal != null
                    ? `$${file.extractedTotal.toLocaleString('es-AR')}`
                    : '❌ No detectado'}
                </span>
              </div>
            </div>

            {#if file.extractionMethod}
              <div class="extraction-method">
                <span class="label">Método:</span>
                <span class="badge">{getExtractionMethodLabel(file.extractionMethod)}</span>
              </div>
            {/if}

            {#if file.extractionErrors}
              <div class="extraction-errors">
                ⚠️ {file.extractionErrors}
              </div>
            {/if}
          </div>

          <!-- ACCIONES -->
          <div class="review-actions">
            <button
              class="btn btn-secondary"
              onclick={() => reprocessPendingFile(file.id)}
              title="Volver a procesar"
            >
              🔄 Reprocesar
            </button>
            <button class="btn btn-primary" onclick={() => startEditing(file.id)}>
              ✏️ Editar datos
            </button>
            <button
              class="btn btn-success"
              onclick={() => saveAndFinalize(file.id)}
              disabled={!file.extractedCuit ||
                !file.extractedType ||
                file.extractedPointOfSale == null ||
                file.extractedInvoiceNumber == null ||
                !file.extractedDate}
            >
              ✅ Confirmar
            </button>
            <button class="btn btn-danger btn-sm" onclick={() => deletePendingFile(file.id)}>
              🗑️ Eliminar
            </button>
          </div>

          <!-- MODAL DE EDICIÓN -->
          {#if editingFile === file.id}
            <div class="edit-modal">
              <h4>Editar datos</h4>
              <div class="edit-form">
                <div class="form-row">
                  <label>
                    CUIT
                    <input
                      type="text"
                      bind:value={editFormData[file.id].extractedCuit}
                      placeholder="XX-XXXXXXXX-X"
                    />
                  </label>
                  <label>
                    Fecha
                    <input type="date" bind:value={editFormData[file.id].extractedDate} />
                  </label>
                </div>
                <div class="form-row">
                  <label>
                    Tipo
                    <select bind:value={editFormData[file.id].extractedType}>
                      <option value="">-</option>
                      <option value="A">A</option>
                      <option value="B">B</option>
                      <option value="C">C</option>
                      <option value="E">E</option>
                      <option value="M">M</option>
                    </select>
                  </label>
                  <label>
                    P. Venta
                    <input type="number" bind:value={editFormData[file.id].extractedPointOfSale} />
                  </label>
                  <label>
                    Número
                    <input
                      type="number"
                      bind:value={editFormData[file.id].extractedInvoiceNumber}
                    />
                  </label>
                  <label>
                    Total
                    <input type="number" step="0.01" bind:value={editFormData[file.id].extractedTotal} />
                  </label>
                </div>
                <div class="edit-actions">
                  <button class="btn btn-primary btn-sm" onclick={() => saveAndFinalize(file.id)}>
                    Guardar
                  </button>
                  <button class="btn btn-secondary btn-sm" onclick={cancelEditing}>
                    Cancelar
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .review-container {
    max-width: 1200px;
    margin: 0 auto;
  }

  .page-header {
    margin-bottom: 2rem;
    text-align: center;
  }

  .page-header h1 {
    margin: 0 0 0.5rem 0;
    font-size: 2rem;
  }

  .subtitle {
    margin: 0;
    color: #666;
    font-size: 1rem;
  }

  /* STATS */
  .stats-bar {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }

  .stat {
    background: white;
    padding: 1.5rem 2rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    text-align: center;
    min-width: 120px;
  }

  .stat-value {
    display: block;
    font-size: 2.5rem;
    font-weight: bold;
    color: #2563eb;
  }

  .stat-label {
    display: block;
    font-size: 0.9rem;
    color: #666;
    margin-top: 0.5rem;
  }

  /* FILTER BAR */
  .filter-bar {
    display: flex;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .filter-buttons {
    display: flex;
    gap: 1rem;
    background: white;
    padding: 0.5rem;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    flex-wrap: wrap;
  }

  .filter-btn {
    padding: 0.75rem 1.5rem;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #64748b;
    font-size: 0.95rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .filter-btn:hover {
    border-color: #2563eb;
    color: #2563eb;
  }

  .filter-btn.active {
    border-color: #2563eb;
    background: #2563eb;
    color: white;
  }

  /* LOADING/EMPTY */
  .loading,
  .empty {
    text-align: center;
    padding: 3rem;
    font-size: 1.2rem;
    background: white;
    border-radius: 12px;
  }

  .empty {
    color: #64748b;
  }

  /* REVIEW LIST */
  .review-list {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .review-card {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    border: 2px solid #e5e7eb;
  }

  .review-card:hover {
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  .review-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid #f1f5f9;
  }

  .review-card-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.2rem;
  }

  .meta {
    font-size: 0.9rem;
    color: #64748b;
    margin: 0;
  }

  .confidence-badge {
    padding: 0.5rem 1rem;
    border-radius: 6px;
    font-weight: 600;
    font-size: 0.9rem;
    white-space: nowrap;
  }

  .text-green-600 {
    color: #16a34a;
  }
  .text-yellow-600 {
    color: #ca8a04;
  }
  .text-red-600 {
    color: #dc2626;
  }
  .text-gray-400 {
    color: #9ca3af;
  }

  /* FILE PREVIEW */
  .file-preview {
    position: relative;
    background: #f8fafc;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    overflow: hidden;
    min-height: 300px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 1rem;
  }

  .pdf-iframe {
    width: 100%;
    height: 500px;
    border: none;
    background: white;
  }

  .image-preview {
    max-width: 100%;
    max-height: 500px;
    object-fit: contain;
  }

  .preview-error {
    text-align: center;
    color: #64748b;
  }

  /* EXTRACTED DATA */
  .extracted-data {
    margin-bottom: 1rem;
  }

  .data-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .data-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .label {
    font-size: 0.85rem;
    color: #6b7280;
    font-weight: 500;
  }

  .value {
    font-size: 0.95rem;
    color: #111;
    font-weight: 500;
    font-family: monospace;
  }

  .extraction-method {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-bottom: 0.5rem;
  }

  .badge {
    display: inline-block;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    background: #dbeafe;
    color: #1e40af;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .extraction-errors {
    padding: 0.75rem 1rem;
    background: #fef2f2;
    border-left: 3px solid #ef4444;
    border-radius: 6px;
    color: #991b1b;
    font-size: 0.9rem;
  }

  /* ACTIONS */
  .review-actions {
    display: flex;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid #e5e7eb;
    flex-wrap: wrap;
  }

  /* EDIT MODAL */
  .edit-modal {
    background: #f8fafc;
    border: 2px solid #2563eb;
    border-radius: 8px;
    padding: 1rem;
    margin-top: 1rem;
  }

  .edit-modal h4 {
    margin: 0 0 0.75rem 0;
    color: #2563eb;
  }

  .edit-form .form-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
    flex-wrap: wrap;
  }

  .edit-form label {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    flex: 1;
    min-width: 120px;
  }

  .edit-form input,
  .edit-form select {
    padding: 0.5rem;
    border: 1px solid #d1d5db;
    border-radius: 4px;
    font-size: 0.9rem;
  }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* BUTTONS */
  .btn {
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
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
    background: #6b7280;
    color: white;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }

  .btn-success {
    background: #16a34a;
    color: white;
  }

  .btn-success:hover:not(:disabled) {
    background: #15803d;
  }

  .btn-success:disabled {
    background: #86efac;
  }

  .btn-danger {
    background: #ef4444;
    color: white;
  }

  .btn-danger:hover:not(:disabled) {
    background: #dc2626;
  }

  .btn-sm {
    padding: 0.5rem 1rem;
    font-size: 0.9rem;
  }
</style>
