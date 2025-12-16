<script lang="ts">
  import { onMount } from 'svelte';
  import { toast, Toaster } from 'svelte-sonner';
  import { PageHeader, UploadSection } from '$lib/components';

  let activeTab = $state<'excel' | 'upload'>('upload');
  let uploading = $state(false);
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
      // 1. Upload files (NO auto-process)
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

      toast.success(`${uploadData.files?.length || 0} archivo(s) subidos correctamente`, {
        id: uploadToastId,
      });

      // Redirect to Comprobantes hub
      window.location.href = '/comprobantes';
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido', {
        id: uploadToastId,
      });
    } finally {
      uploading = false;
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
        const parts = [];
        if (data.imported > 0) parts.push(`${data.imported} nuevas`);
        if (data.updated > 0) parts.push(`${data.updated} actualizadas`);
        if (data.unchanged > 0) parts.push(`${data.unchanged} sin cambios`);

        toast.success(`Facturas: ${parts.join(', ')}`, { id: toastId });
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
      <UploadSection onUpload={uploadAndProcess} isLoading={uploading} />
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
                <div class="import-summary">
                  {#if excelImportResult.imported > 0}
                    <div class="summary-item">
                      <strong>{excelImportResult.imported}</strong>
                      <span>nuevas facturas</span>
                    </div>
                  {/if}
                  {#if excelImportResult.updated > 0}
                    <div class="summary-item">
                      <strong>{excelImportResult.updated}</strong>
                      <span>actualizadas</span>
                    </div>
                  {/if}
                  {#if excelImportResult.unchanged > 0}
                    <div class="summary-item">
                      <strong>{excelImportResult.unchanged}</strong>
                      <span>sin cambios</span>
                    </div>
                  {/if}
                  {#if excelImportResult.errors.length > 0}
                    <div class="summary-item error">
                      <strong>{excelImportResult.errors.length}</strong>
                      <span>errores</span>
                    </div>
                  {/if}
                </div>
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

  .import-summary {
    display: flex;
    gap: 1.5rem;
    flex-wrap: wrap;
    margin-top: 0.5rem;
  }

  .summary-item {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .summary-item strong {
    font-size: 1.5rem;
    font-weight: 700;
  }

  .summary-item span {
    font-size: 0.875rem;
    opacity: 0.8;
  }

  .summary-item.error strong {
    color: #dc2626;
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

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
  }

  .btn-secondary:hover:not(:disabled) {
    background: #e5e7eb;
  }
</style>
