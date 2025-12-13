<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, Toaster } from 'svelte-sonner';
  import { PageHeader, UploadSection } from '$lib/components';

  let activeTab = $state<'excel' | 'upload'>('upload');
  let uploading = $state(false);
  let processing = $state(false);
  let excelImportResult = $state<any>(null);
  let importBatches = $state<any[]>([]);

  onMount(async () => {
    // Cargar historial de importaciones
    await loadImportBatches();
  });

  async function loadImportBatches() {
    try {
      const response = await fetch('/api/expected-invoices');
      const data = await response.json();
      if (data.success && data.batches) {
        importBatches = data.batches;
      }
    } catch (err) {
      console.error('Error loading import batches:', err);
    }
  }

  async function uploadAndProcess(files: File[]) {
    if (files.length === 0) return;

    uploading = true;
    const uploadToastId = toast.loading(`Subiendo ${files.length} archivo(s)...`);

    try {
      // 1. Upload files
      const formData = new FormData();
      files.forEach((file) => {
        formData.append('files', file);
      });

      const uploadResponse = await fetch('/api/invoices/upload', {
        method: 'POST',
        body: formData,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Error al subir archivos');
      }

      toast.success('Archivos subidos correctamente', { id: uploadToastId });

      // 2. Process uploaded files
      processing = true;
      const processToastId = toast.loading('Procesando facturas...');

      const pendingFileIds = uploadData.files.map((f: any) => f.pendingFileId);
      const processResponse = await fetch('/api/invoices/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pendingFileIds }),
      });
      const processData = await processResponse.json();

      if (!processData.success) {
        throw new Error(processData.error || 'Error al procesar facturas');
      }

      const { stats } = processData;

      if (stats.processed > 0) {
        toast.success(`${stats.processed} factura(s) procesada(s) automáticamente`, {
          id: processToastId,
        });
      } else {
        toast.dismiss(processToastId);
      }

      if (stats.pending > 0) {
        toast.info(`${stats.pending} archivo(s) requieren revisión manual`);
      }

      // Redirect to revisar
      window.location.href = '/revisar';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido', {
        id: uploadToastId,
      });
    } finally {
      uploading = false;
      processing = false;
    }
  }

  async function handleExcelUpload(file: File) {
    const toastId = toast.loading('Importando Excel...');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/expected-invoices/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      excelImportResult = data;

      if (data.success) {
        toast.success(`Importadas ${data.imported} facturas`, { id: toastId });
        await loadImportBatches();
      } else {
        toast.error(data.error || 'Error al importar', { id: toastId });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error al importar', { id: toastId });
    }
  }
</script>

<svelte:head>
  <title>Importar - Procesador de Facturas</title>
</svelte:head>

<Toaster position="top-right" richColors />

<div class="import-container">
  <PageHeader
    title="📥 Importar Archivos"
    subtitle="Importa facturas desde archivos PDF/imágenes o desde Excel AFIP"
  />

  <!-- TABS -->
  <div class="tabs-container">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'upload'}
        onclick={() => (activeTab = 'upload')}
      >
        📤 Subir PDFs
      </button>
      <button
        class="tab"
        class:active={activeTab === 'excel'}
        onclick={() => (activeTab = 'excel')}
      >
        📊 Importar Excel
      </button>
    </div>
  </div>

  <!-- CONTENT -->
  <div class="tab-content">
    {#if activeTab === 'upload'}
      <!-- UPLOAD TAB -->
      <UploadSection onUpload={uploadAndProcess} isLoading={uploading || processing} />
    {:else if activeTab === 'excel'}
      <!-- EXCEL TAB -->
      <div class="excel-section">
        <div class="section-header">
          <h2>📥 Importar Excel AFIP</h2>
          <p class="help-text">
            Importá el Excel o CSV de AFIP con las facturas esperadas. El sistema las usará para
            validar y auto-completar los datos de los PDFs.
          </p>
        </div>

        <div class="template-download-section">
          <div class="template-info">
            <strong>¿Primera vez?</strong> Descargá el template de ejemplo para ver el formato esperado
          </div>
          <div class="template-buttons">
            <a
              href="/api/expected-invoices/template?format=xlsx"
              download="template-facturas-afip.xlsx"
              class="btn btn-secondary"
            >
              📊 Descargar Template Excel
            </a>
            <a
              href="/api/expected-invoices/template?format=csv"
              download="template-facturas-afip.csv"
              class="btn btn-secondary"
            >
              📄 Descargar Template CSV
            </a>
          </div>
        </div>

        <button
          type="button"
          class="dropzone excel-dropzone"
          ondragover={(e) => {
            e.preventDefault();
            e.currentTarget.classList.add('dragover');
          }}
          ondragleave={(e) => {
            e.currentTarget.classList.remove('dragover');
          }}
          ondrop={async (e) => {
            e.preventDefault();
            e.currentTarget.classList.remove('dragover');
            const files = Array.from(e.dataTransfer?.files || []);
            if (files.length > 0) {
              await handleExcelUpload(files[0]);
            }
          }}
          onclick={() => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.xlsx,.xls,.csv';
            input.onchange = async (e) => {
              const file = (e.target as HTMLInputElement).files?.[0];
              if (file) {
                await handleExcelUpload(file);
              }
            };
            input.click();
          }}
        >
          <p class="dropzone-icon">📊</p>
          <p class="dropzone-text">Click o arrastrá un archivo Excel/CSV</p>
          <p class="dropzone-hint">Formatos: .xlsx, .xls, .csv</p>
        </button>

        {#if excelImportResult}
          <div class="import-result">
            {#if excelImportResult.success}
              <div class="alert alert-success">
                <h3>✅ Importación exitosa</h3>
                <p>
                  <strong>{excelImportResult.imported}</strong> facturas importadas
                  {#if excelImportResult.skipped > 0}
                    <br /><em>{excelImportResult.skipped} saltadas (duplicadas)</em>
                  {/if}
                  {#if excelImportResult.errors.length > 0}
                    <br /><strong class="text-error"
                      >{excelImportResult.errors.length} errores</strong
                    >
                  {/if}
                </p>
              </div>

              {#if excelImportResult.errors.length > 0}
                <details class="error-details">
                  <summary>Ver errores ({excelImportResult.errors.length})</summary>
                  <ul>
                    {#each excelImportResult.errors as error}
                      <li>Fila {error.row}: {error.error}</li>
                    {/each}
                  </ul>
                </details>
              {/if}
            {:else}
              <div class="alert alert-error">
                <p>❌ Error al importar: {excelImportResult.error}</p>
              </div>
            {/if}
          </div>
        {/if}

        {#if importBatches.length > 0}
          <div class="import-history">
            <h3>📚 Últimas importaciones</h3>
            <div class="batches-list">
              {#each importBatches as batch}
                <div class="batch-card">
                  <div class="batch-header">
                    <strong>📄 {batch.filename}</strong>
                    <span class="batch-date"
                      >{new Date(batch.importDate).toLocaleString('es-AR')}</span
                    >
                  </div>
                  <div class="batch-stats">
                    <span class="stat-badge">Total: {batch.totalRows}</span>
                    <span class="stat-badge success">Importadas: {batch.importedRows}</span>
                    {#if batch.skippedRows > 0}
                      <span class="stat-badge warning">Saltadas: {batch.skippedRows}</span>
                    {/if}
                    {#if batch.errorRows > 0}
                      <span class="stat-badge error">Errores: {batch.errorRows}</span>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .import-container {
    max-width: 1000px;
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

  /* TABS */
  .tabs-container {
    margin-bottom: 2rem;
  }

  .tabs {
    display: flex;
    gap: 0.5rem;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab {
    background: none;
    border: none;
    padding: 1rem 2rem;
    font-size: 1rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    border-bottom: 3px solid transparent;
    transition: all 0.2s;
  }

  .tab:hover {
    color: #2563eb;
  }

  .tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
  }

  .tab-content {
    animation: fadeIn 0.2s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* UPLOAD SECTION */
  .upload-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* EXCEL SECTION */
  .excel-section {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .section-header {
    text-align: center;
    margin-bottom: 1rem;
  }

  .section-header h2 {
    margin: 0 0 0.5rem 0;
    font-size: 1.5rem;
  }

  .help-text {
    margin: 0;
    color: #666;
    font-size: 0.95rem;
  }

  /* DROPZONE */
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

  .dropzone.dragover {
    border-color: #2563eb;
    background: #eff6ff;
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

  /* FILE LIST */
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

  /* UPLOAD ACTIONS */
  .upload-actions {
    display: flex;
    gap: 1rem;
  }

  .btn-large {
    flex: 1;
    font-size: 1.1rem;
    padding: 1rem 2rem;
  }

  /* TEMPLATE SECTION */
  .template-download-section {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    border-radius: 12px;
    padding: 1.5rem;
    color: white;
  }

  .template-info {
    margin-bottom: 1rem;
    font-size: 1rem;
    text-align: center;
  }

  .template-info strong {
    font-weight: 600;
    font-size: 1.1rem;
  }

  .template-buttons {
    display: flex;
    justify-content: center;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .template-buttons .btn {
    background: white;
    color: #667eea;
    padding: 0.75rem 1.5rem;
    border-radius: 8px;
    font-weight: 600;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    text-decoration: none;
  }

  .template-buttons .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  }

  /* ALERTS */
  .alert {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .alert h3 {
    margin: 0 0 0.5rem 0;
  }

  .alert p {
    margin: 0;
  }

  .alert-success {
    background: #dcfce7;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .alert-error {
    background: #fee2e2;
    border: 1px solid #fecaca;
    color: #991b1b;
  }

  .text-error {
    color: #dc2626;
  }

  .error-details {
    margin-bottom: 1rem;
    padding: 0.75rem;
    background: white;
    border-radius: 8px;
    border: 1px solid #e5e7eb;
  }

  .error-details summary {
    cursor: pointer;
    font-weight: 500;
    padding: 0.5rem;
  }

  .error-details ul {
    margin: 0.75rem 0 0 0;
    padding-left: 1.5rem;
  }

  .error-details li {
    margin-bottom: 0.5rem;
  }

  /* IMPORT HISTORY */
  .import-history {
    margin-top: 2rem;
  }

  .import-history h3 {
    margin: 0 0 1rem 0;
    font-size: 1.2rem;
  }

  .batches-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 1rem;
  }

  .batch-card {
    background: white;
    border-radius: 12px;
    padding: 1rem;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .batch-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.75rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid #e5e7eb;
  }

  .batch-header strong {
    font-size: 1rem;
  }

  .batch-date {
    font-size: 0.85rem;
    color: #64748b;
  }

  .batch-stats {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .stat-badge {
    font-size: 0.8rem;
    padding: 0.25rem 0.75rem;
    border-radius: 12px;
    background: #f3f4f6;
    color: #374151;
  }

  .stat-badge.success {
    background: #dcfce7;
    color: #166534;
  }

  .stat-badge.warning {
    background: #fef3c7;
    color: #92400e;
  }

  .stat-badge.error {
    background: #fee2e2;
    color: #991b1b;
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
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
</style>
