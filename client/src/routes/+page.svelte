<svelte:head>
	<title>Procesador de Facturas</title>
</svelte:head>

<script lang="ts">
	import { onMount } from 'svelte';
	import { toast, Toaster } from 'svelte-sonner';

	interface PendingInvoice {
		id: number;
		emitterCuit: string;
		emitterName: string;
		emitterAlias: string | null;
		issueDate: string;
		invoiceType: string;
		fullInvoiceNumber: string;
		total: number | null;
		originalFile: string;
		extractionConfidence: number | null;
		requiresReview: boolean;
		manuallyValidated: boolean;
	}

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
		extractionErrors: string | null;
		status: 'pending' | 'reviewing' | 'processed' | 'failed';
		invoiceId: number | null;
		createdAt: string;
		updatedAt: string;
	}

	let invoices: PendingInvoice[] = $state([]);
	let pendingFilesToReview: PendingFileItem[] = $state([]);
	let pendingFilesStats = $state({ total: 0, pending: 0, reviewing: 0, processed: 0, failed: 0 });
	let loading = $state(false);
	let uploading = $state(false);
	let processing = $state(false);
	let uploadedFiles: File[] = $state([]);
	let selectedInvoices = $state<Set<number>>(new Set());
	let selectedPendingFiles = $state<Set<number>>(new Set());
	let activeTab = $state<'upload' | 'review' | 'invoices' | 'excel'>('upload');
	let reviewFilter = $state<'pending' | 'all'>('pending'); // Filtro para tab Revisar

	// Estado para edición inline
	let editingFile = $state<number | null>(null);
	let editFormData = $state<Record<number, Partial<PendingFileItem>>>({});

	// Estado para importación de Excel
	let excelImportResult = $state<any>(null);
	let importBatches = $state<any[]>([]);

	// Estado para matches de expected invoices
	let matchesData = $state<Record<number, any>>({});

	onMount(async () => {
		await loadInvoices();
		await loadPendingFilesToReview();
		await loadImportBatches();
	});

	// Manejar errores de carga de archivos con información detallada
	async function handleFileLoadError(fileId: number, filename: string) {
		try {
			// Intentar obtener detalles del error desde el servidor
			const response = await fetch(`/api/pending-files/${fileId}/file`);
			if (!response.ok) {
				const errorData = await response.json();
				console.error('❌ Error cargando archivo:', errorData);
				toast.error(
					`No se pudo cargar "${filename}": ${errorData.error || 'Error desconocido'}`,
					{ duration: 5000 }
				);
			}
		} catch (err) {
			console.error('❌ Error verificando archivo:', err);
			toast.error(`Error al cargar "${filename}": No se pudo conectar con el servidor`, {
				duration: 5000
			});
		}
	}

	async function loadInvoices() {
		loading = true;
		try {
			const response = await fetch('/api/invoices/pending');
			const data = await response.json();

			if (data.success) {
				invoices = data.invoices;
			} else {
				toast.error(data.error || 'Error al cargar facturas');
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Error de conexión');
		} finally {
			loading = false;
		}
	}

	async function loadPendingFilesToReview() {
		loading = true;
		try {
			// Cargar según el filtro activo
			const statusFilter = reviewFilter === 'pending' ? 'status=pending,failed' : 'limit=100';
			const response = await fetch(`/api/pending-files?${statusFilter}`);
			const data = await response.json();

			if (data.success) {
				pendingFilesToReview = data.pendingFiles || [];
				pendingFilesStats = data.stats || { total: 0, pending: 0, reviewing: 0, processed: 0, failed: 0 };

				// Inicializar editFormData para cada archivo
				pendingFilesToReview.forEach((pf: PendingFileItem) => {
					if (!editFormData[pf.id]) {
						editFormData[pf.id] = {
							extractedCuit: pf.extractedCuit,
							extractedDate: pf.extractedDate,
							extractedTotal: pf.extractedTotal,
							extractedType: pf.extractedType,
							extractedPointOfSale: pf.extractedPointOfSale,
							extractedInvoiceNumber: pf.extractedInvoiceNumber
						};
					}
				});

				// Cargar matches de expected invoices para cada archivo
				await loadMatchesForPendingFiles(pendingFilesToReview);
			} else {
				toast.error('Error al cargar archivos pendientes');
			}
		} catch (err) {
			toast.error('Error de conexión');
		} finally {
			loading = false;
		}
	}

	async function loadMatchesForPendingFiles(files: PendingFileItem[]) {
		// Cargar matches para cada archivo en paralelo
		const matchPromises = files.map(async (pf) => {
			try {
				const response = await fetch(`/api/pending-files/${pf.id}/matches`);
				const data = await response.json();
				if (data.success) {
					matchesData[pf.id] = data;
				}
			} catch (err) {
				console.error(`Error cargando matches para archivo ${pf.id}:`, err);
			}
		});

		await Promise.all(matchPromises);
		// Trigger reactivity
		matchesData = matchesData;
	}

	async function changeReviewFilter(newFilter: 'pending' | 'all') {
		reviewFilter = newFilter;
		await loadPendingFilesToReview();
	}

	async function loadImportBatches() {
		try {
			const response = await fetch('/api/expected-invoices', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'listBatches' })
			});
			const data = await response.json();

			if (data.success) {
				importBatches = data.batches || [];
			}
		} catch (err) {
			console.error('Error cargando lotes de importación:', err);
		}
	}

	async function handleExcelUpload(file: File) {
		toast.loading('Importando Excel...', { id: 'excel-upload' });

		try {
			const formData = new FormData();
			formData.append('file', file);

			const response = await fetch('/api/expected-invoices/import', {
				method: 'POST',
				body: formData
			});

			const result = await response.json();
			excelImportResult = result;

			if (result.success) {
				toast.success(`Importación exitosa: ${result.imported} facturas`, {
					id: 'excel-upload'
				});
				await loadImportBatches();
			} else {
				toast.error(`Error: ${result.error}`, { id: 'excel-upload' });
			}
		} catch (err) {
			toast.error('Error al importar Excel', { id: 'excel-upload' });
			excelImportResult = {
				success: false,
				error: 'Error de conexión'
			};
		}
	}

	async function deletePendingFile(id: number) {
		// Usar toast para confirmar (esto es temporal, idealmente usar un modal)
		toast.warning('Hacé click en "Eliminar" de nuevo para confirmar');

		try {
			const response = await fetch(`/api/pending-files/${id}`, {
				method: 'DELETE'
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
		editingFile = id;
	}

	function cancelEditing() {
		editingFile = null;
	}

	async function saveAndFinalize(id: number) {
		const formData = editFormData[id];
		if (!formData) return;

		try {
			// Actualizar datos extraídos
			const updateResponse = await fetch(`/api/pending-files/${id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(formData)
			});

			if (!updateResponse.ok) {
				toast.error('Error al actualizar datos');
				return;
			}

			// Intentar finalizar
			const finalizeResponse = await fetch(`/api/pending-files/${id}/finalize`, {
				method: 'POST'
			});
			const data = await finalizeResponse.json();

			if (data.success) {
				toast.success('¡Factura procesada correctamente!');
				await loadPendingFilesToReview();
				await loadInvoices();
				editingFile = null;
			} else {
				toast.error(data.error || 'Error al procesar');
			}
		} catch (err) {
			toast.error('Error al guardar');
		}
	}

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer) {
			event.dataTransfer.dropEffect = 'copy';
		}
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		if (event.dataTransfer?.files) {
			const newFiles = Array.from(event.dataTransfer.files).filter((file) =>
				['application/pdf', 'image/jpeg', 'image/png'].includes(file.type)
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

	async function uploadAndProcess() {
		if (uploadedFiles.length === 0) return;

		uploading = true;
		const uploadToastId = toast.loading(`Subiendo ${uploadedFiles.length} archivo(s)...`);

		try {
			// 1. Upload files
			const formData = new FormData();
			uploadedFiles.forEach((file) => {
				formData.append('files', file);
			});

			const uploadResponse = await fetch('/api/invoices/upload', {
				method: 'POST',
				body: formData
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
				body: JSON.stringify({ pendingFileIds })
			});
			const processData = await processResponse.json();

			if (!processData.success) {
				throw new Error(processData.error || 'Error al procesar facturas');
			}

			const { stats } = processData;

			// Mostrar resultado del procesamiento
			if (stats.processed > 0) {
				toast.success(`${stats.processed} factura(s) procesada(s) automáticamente`, { id: processToastId });
			} else {
				toast.dismiss(processToastId);
			}

			if (stats.pending > 0) {
				toast.info(`${stats.pending} archivo(s) requieren revisión manual`);
			}

			// 3. Clear uploaded files and reload
			uploadedFiles = [];
			await loadInvoices();
			await loadPendingFilesToReview();

			// Navegar automáticamente a revisar
			activeTab = 'review';

		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Error desconocido', { id: uploadToastId });
		} finally {
			uploading = false;
			processing = false;
		}
	}

	function toggleSelection(id: number) {
		if (selectedInvoices.has(id)) {
			selectedInvoices.delete(id);
		} else {
			selectedInvoices.add(id);
		}
		selectedInvoices = selectedInvoices; // Trigger reactivity
	}

	function selectAll() {
		selectedInvoices = new Set(invoices.map((inv) => inv.id));
	}

	function clearSelection() {
		selectedInvoices = new Set();
	}

	async function exportSelected() {
		if (selectedInvoices.size === 0) {
			toast.warning('Seleccioná al menos una factura para exportar');
			return;
		}

		const toastId = toast.loading('Exportando facturas...');

		try {
			const response = await fetch('/api/invoices/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ invoiceIds: Array.from(selectedInvoices) })
			});
			const data = await response.json();

			if (data.success) {
				toast.success(`Exportadas ${data.stats.successful}/${data.stats.total} facturas`, { id: toastId });
				clearSelection();
			} else {
				toast.error(data.error || 'Error al exportar', { id: toastId });
			}
		} catch (err) {
			toast.error(err instanceof Error ? err.message : 'Error al exportar', { id: toastId });
		}
	}

	function getConfidenceColor(confidence: number | null): string {
		if (!confidence) return 'text-gray-400';
		if (confidence >= 90) return 'text-green-600';
		if (confidence >= 70) return 'text-yellow-600';
		return 'text-red-600';
	}

	// Funciones para pending files (selección múltiple)
	function togglePendingFileSelection(id: number) {
		if (selectedPendingFiles.has(id)) {
			selectedPendingFiles.delete(id);
		} else {
			selectedPendingFiles.add(id);
		}
		selectedPendingFiles = selectedPendingFiles;
	}

	function selectAllPendingFiles() {
		selectedPendingFiles = new Set(pendingFilesToReview.map((pf) => pf.id));
	}

	function clearPendingFileSelection() {
		selectedPendingFiles = new Set();
	}

	async function processPendingFiles() {
		if (selectedPendingFiles.size === 0) {
			toast.warning('Seleccioná al menos un archivo para procesar');
			return;
		}

		processing = true;
		const toastId = toast.loading('Procesando archivos seleccionados...');

		try {
			const response = await fetch('/api/invoices/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pendingFileIds: Array.from(selectedPendingFiles) })
			});
			const data = await response.json();

			if (data.success) {
				const stats = data.stats;
				if (stats.processed > 0) {
					toast.success(`Procesadas ${stats.processed}/${stats.total} facturas`, { id: toastId });
				} else {
					toast.dismiss(toastId);
				}

				if (stats.pending > 0) {
					toast.info(`${stats.pending} archivo(s) requieren revisión manual`);
				}

				clearPendingFileSelection();
				await loadPendingFilesToReview();
				await loadInvoices();
			} else {
				toast.error(data.error || 'Error al procesar', { id: toastId });
			}
		} catch (err) {
			toast.error('Error al procesar archivos', { id: toastId });
		} finally {
			processing = false;
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'status-pending';
			case 'reviewing':
				return 'status-reviewing';
			case 'processed':
				return 'status-processed';
			case 'failed':
				return 'status-failed';
			default:
				return 'status-pending';
		}
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
</script>

<Toaster position="top-right" richColors />

<div class="container">
	<header>
		<h1>🧾 Procesador de Facturas</h1>
		<p class="subtitle">Subí archivos → Revisá y corregí → Confirmá</p>
	</header>

	<nav class="tabs">
		<button class="tab" class:active={activeTab === 'excel'} onclick={() => (activeTab = 'excel')}>
			📥 Importar Excel
		</button>
		<button class="tab" class:active={activeTab === 'upload'} onclick={() => (activeTab = 'upload')}>
			📤 Subir PDFs
		</button>
		<button class="tab" class:active={activeTab === 'review'} onclick={() => (activeTab = 'review')}>
			✏️ Revisar Archivos
			{#if (pendingFilesStats?.pending || 0) + (pendingFilesStats?.failed || 0) > 0}
				<span class="badge">{(pendingFilesStats?.pending || 0) + (pendingFilesStats?.failed || 0)}</span>
			{/if}
		</button>
		<button class="tab" class:active={activeTab === 'invoices'} onclick={() => (activeTab = 'invoices')}>
			📋 Facturas
		</button>
	</nav>

	<main>
		{#if activeTab === 'upload'}
			<!-- UPLOAD SECTION -->
			<section class="upload-section">
				<div
					class="dropzone"
					ondragover={handleDragOver}
					ondrop={handleDrop}
					role="button"
					tabindex="0"
				>
					<p class="dropzone-icon">📁</p>
					<p class="dropzone-text">Arrastrá archivos aquí</p>
					<p class="dropzone-hint">o hacé click para seleccionar</p>
					<p class="dropzone-formats">Formatos: PDF, JPG, PNG (máx 10MB c/u)</p>
					<input
						type="file"
						multiple
						accept=".pdf,.jpg,.jpeg,.png"
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
						<button
							class="btn btn-primary btn-large"
							onclick={uploadAndProcess}
							disabled={uploading || processing}
						>
							{#if uploading}
								⏳ Subiendo archivos...
							{:else if processing}
								⚙️ Procesando facturas...
							{:else}
								🚀 Subir y Procesar ({uploadedFiles.length} archivos)
							{/if}
						</button>
						<button class="btn btn-secondary" onclick={() => (uploadedFiles = [])}>
							🗑️ Limpiar todo
						</button>
					</div>
				{/if}
			</section>
		{:else if activeTab === 'review'}
			<!-- REVIEW SECTION - Revisar archivos subidos con edición inline y matches de Excel -->

			<!-- Estadísticas -->
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

			<!-- Filtros -->
			<div class="filter-bar">
				<div class="filter-buttons">
					<button
						class="filter-btn"
						class:active={reviewFilter === 'pending'}
						onclick={() => changeReviewFilter('pending')}
					>
						🔍 Solo para revisar ({(pendingFilesStats?.pending || 0) + (pendingFilesStats?.failed || 0)})
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

			<div class="review-header">
				<h2>Revisá y corregí los datos detectados</h2>
				<p class="hint">
					Editá los campos que no se detectaron correctamente.
					{#if reviewFilter === 'pending'}
						Mostrando solo archivos pendientes y con errores.
					{:else}
						Mostrando todos los archivos (pendientes, procesados y en revisión).
					{/if}
				</p>
			</div>

			{#if loading}
				<div class="loading">
					<p>⏳ Cargando...</p>
				</div>
			{:else if pendingFilesToReview.length === 0}
				<div class="empty">
					<p>✅ No hay archivos para revisar</p>
					<button class="btn btn-primary" onclick={() => (activeTab = 'upload')}>
						📤 Subir archivos
					</button>
				</div>
			{:else}
				<div class="review-list">
					{#each pendingFilesToReview as file (file.id)}
						<div class="review-card" class:editing={editingFile === file.id}>
							<div class="review-card-header">
								<div>
									<h3>📄 {file.originalFilename}</h3>
									<p class="meta">
										Subido: {new Date(file.uploadDate).toLocaleString('es-AR')} •
										{file.fileSize ? `${(file.fileSize / 1024).toFixed(0)} KB` : ''}
									</p>
								</div>
								{#if file.extractionConfidence !== null}
									<div class="confidence-badge {getConfidenceColor(file.extractionConfidence)}">
										{file.extractionConfidence}% confianza
									</div>
								{/if}
							</div>

							<div class="review-card-content">
								<!-- PREVIEW DEL ARCHIVO -->
								<div class="file-preview">
									{#if file.originalFilename.toLowerCase().endsWith('.pdf')}
										<iframe
											src="/api/pending-files/{file.id}/file"
											title="Preview de {file.originalFilename}"
											class="pdf-iframe"
											onerror={() => handleFileLoadError(file.id, file.originalFilename)}
										></iframe>
									{:else if file.originalFilename.toLowerCase().match(/\.(jpg|jpeg|png)$/)}
										<img
											src="/api/pending-files/{file.id}/file"
											alt="Preview de {file.originalFilename}"
											class="image-preview"
											onerror={() => handleFileLoadError(file.id, file.originalFilename)}
										/>
									{:else}
										<div class="preview-error">
											<p>⚠️ Vista previa no disponible</p>
											<p class="filename">{file.originalFilename}</p>
										</div>
									{/if}

									<!-- Mostrar SIEMPRE qué se detectó y qué no -->
									<div class="detected-overlay">
										<h4>🔍 Detección automática</h4>

										{#if file.extractionConfidence !== null}
											<div class="confidence-display" class:low={file.extractionConfidence < 50} class:medium={file.extractionConfidence >= 50 && file.extractionConfidence < 80} class:high={file.extractionConfidence >= 80}>
												Confianza: {file.extractionConfidence}%
											</div>
										{/if}

										<div class="detected-list">
											<div class="detected-item" class:missing={!file.extractedCuit}>
												{file.extractedCuit ? '✓' : '❌'} CUIT: {file.extractedCuit || 'No detectado'}
											</div>
											<div class="detected-item" class:missing={!file.extractedDate}>
												{file.extractedDate ? '✓' : '❌'} Fecha: {file.extractedDate || 'No detectado'}
											</div>
											<div class="detected-item" class:missing={!file.extractedType}>
												{file.extractedType ? '✓' : '❌'} Tipo: {file.extractedType || 'No detectado'}
											</div>
											<div class="detected-item" class:missing={file.extractedPointOfSale !== null && file.extractedPointOfSale !== undefined}>
												{file.extractedPointOfSale !== null && file.extractedPointOfSale !== undefined ? '✓' : '❌'} P.Venta: {file.extractedPointOfSale ?? 'No detectado'}
											</div>
											<div class="detected-item" class:missing={file.extractedInvoiceNumber !== null && file.extractedInvoiceNumber !== undefined}>
												{file.extractedInvoiceNumber !== null && file.extractedInvoiceNumber !== undefined ? '✓' : '❌'} Número: {file.extractedInvoiceNumber ?? 'No detectado'}
											</div>
											<div class="detected-item" class:missing={!file.extractedTotal}>
												{file.extractedTotal ? '✓' : '❌'} Total: {file.extractedTotal ? `$${file.extractedTotal.toLocaleString('es-AR')}` : 'No detectado'}
											</div>
										</div>

										{#if file.extractionErrors}
											<div class="extraction-errors-overlay">
												⚠️ {file.extractionErrors}
											</div>
										{/if}
									</div>
								</div>

								<!-- DATOS / FORMULARIO -->
								<div class="file-data">
									<!-- MATCH INFORMATION FROM EXCEL -->
									{#if matchesData[file.id]}
										{@const matchData = matchesData[file.id]}
										{#if matchData.hasExactMatch && matchData.exactMatch}
											<div class="excel-match-card exact-match">
												<h4>✅ Match exacto encontrado en Excel AFIP</h4>
												<div class="excel-match-data">
													<div class="match-item">
														<span class="match-label">CUIT:</span>
														<span class="match-value">{matchData.exactMatch.cuit}</span>
													</div>
													{#if matchData.exactMatch.emitterName}
														<div class="match-item">
															<span class="match-label">Razón Social:</span>
															<span class="match-value">{matchData.exactMatch.emitterName}</span>
														</div>
													{/if}
													<div class="match-item">
														<span class="match-label">Fecha:</span>
														<span class="match-value">{matchData.exactMatch.issueDate}</span>
													</div>
													<div class="match-item">
														<span class="match-label">Tipo:</span>
														<span class="match-value">{matchData.exactMatch.invoiceType}</span>
													</div>
													<div class="match-item">
														<span class="match-label">Punto Venta:</span>
														<span class="match-value">{matchData.exactMatch.pointOfSale}</span>
													</div>
													<div class="match-item">
														<span class="match-label">Número:</span>
														<span class="match-value">{matchData.exactMatch.invoiceNumber}</span>
													</div>
													{#if matchData.exactMatch.total}
														<div class="match-item">
															<span class="match-label">Total:</span>
															<span class="match-value">
																${matchData.exactMatch.total.toLocaleString('es-AR')}
															</span>
														</div>
													{/if}
													{#if matchData.exactMatch.cae}
														<div class="match-item">
															<span class="match-label">CAE:</span>
															<span class="match-value">{matchData.exactMatch.cae}</span>
														</div>
													{/if}
												</div>
												<p class="match-hint">
													💡 Los datos del Excel se usarán automáticamente al procesar este archivo
												</p>
											</div>
										{:else if matchData.candidates && matchData.candidates.length > 0}
											<div class="excel-match-card candidates-match">
												<h4>🔍 {matchData.candidates.length} posibles matches en Excel AFIP</h4>
												<p class="match-hint">
													No hay match exacto, pero encontramos facturas similares por CUIT y fecha/monto:
												</p>
												<div class="candidates-list">
													{#each matchData.candidates as candidate}
														<div class="candidate-item">
															<div class="candidate-header">
																<strong>
																	{candidate.invoiceType}-{candidate.pointOfSale
																		.toString()
																		.padStart(4, '0')}-{candidate.invoiceNumber
																		.toString()
																		.padStart(8, '0')}
																</strong>
																{#if candidate.matchConfidence}
																	<span class="confidence-mini">{candidate.matchConfidence}% confianza</span
																	>
																{/if}
															</div>
															<div class="candidate-details">
																<span>{candidate.emitterName || candidate.cuit}</span>
																<span>Fecha: {candidate.issueDate}</span>
																{#if candidate.total}
																	<span>Total: ${candidate.total.toLocaleString('es-AR')}</span>
																{/if}
															</div>
														</div>
													{/each}
												</div>
												<p class="match-hint">
													⚠️ Revisá manualmente cuál es la factura correcta antes de procesar
												</p>
											</div>
										{:else}
											<div class="excel-match-card no-match">
												<h4>ℹ️ Sin match en Excel AFIP</h4>
												<p class="match-hint">
													No se encontró esta factura en el Excel importado. Verificá los datos extraídos
													del PDF.
												</p>
											</div>
										{/if}
									{/if}

									{#if editingFile === file.id}
										<!-- MODO EDICIÓN -->
										<div class="edit-form">
											<div class="form-grid">
												<div class="form-field">
													<label for="cuit-{file.id}">CUIT *</label>
													<input
														id="cuit-{file.id}"
														type="text"
														bind:value={editFormData[file.id].extractedCuit}
														placeholder="XX-XXXXXXXX-X"
													/>
													<span class="hint-text">Formato: 20-12345678-9</span>
												</div>

												<div class="form-field">
													<label for="date-{file.id}">Fecha emisión *</label>
													<input
														id="date-{file.id}"
														type="date"
														bind:value={editFormData[file.id].extractedDate}
													/>
												</div>

												<div class="form-field">
													<label for="type-{file.id}">Tipo *</label>
													<select id="type-{file.id}" bind:value={editFormData[file.id].extractedType}>
														<option value="">Seleccionar...</option>
														<option value="A">A</option>
														<option value="B">B</option>
														<option value="C">C</option>
														<option value="E">E</option>
														<option value="M">M</option>
													</select>
												</div>

												<div class="form-field">
													<label for="pos-{file.id}">Punto de venta *</label>
													<input
														id="pos-{file.id}"
														type="number"
														bind:value={editFormData[file.id].extractedPointOfSale}
														placeholder="0001"
													/>
												</div>

												<div class="form-field">
													<label for="num-{file.id}">Número *</label>
													<input
														id="num-{file.id}"
														type="number"
														bind:value={editFormData[file.id].extractedInvoiceNumber}
														placeholder="00000001"
													/>
												</div>

												<div class="form-field">
													<label for="total-{file.id}">Total</label>
													<input
														id="total-{file.id}"
														type="number"
														step="0.01"
														bind:value={editFormData[file.id].extractedTotal}
														placeholder="0.00"
													/>
												</div>
											</div>

											<div class="form-actions">
												<button class="btn btn-primary" onclick={() => saveAndFinalize(file.id)}>
													✅ Confirmar y Procesar
												</button>
												<button class="btn btn-secondary" onclick={cancelEditing}>
													❌ Cancelar
												</button>
												<button class="btn btn-sm btn-danger" onclick={() => deletePendingFile(file.id)}>
													🗑️ Eliminar
												</button>
											</div>
										</div>
									{:else}
										<!-- MODO VISTA -->
										<div class="data-display">
											<div class="data-grid-compact">
												<div class="data-item">
													<span class="label">CUIT:</span>
													<span class="value" class:missing={!file.extractedCuit}>
														{file.extractedCuit || '❌ No detectado'}
													</span>
												</div>
												<div class="data-item">
													<span class="label">Fecha:</span>
													<span class="value" class:missing={!file.extractedDate}>
														{file.extractedDate || '❌ No detectado'}
													</span>
												</div>
												<div class="data-item">
													<span class="label">Tipo:</span>
													<span class="value" class:missing={!file.extractedType}>
														{file.extractedType || '❌'}
													</span>
												</div>
												<div class="data-item">
													<span class="label">P.Venta:</span>
													<span class="value" class:missing={file.extractedPointOfSale === null}>
														{file.extractedPointOfSale ?? '❌'}
													</span>
												</div>
												<div class="data-item">
													<span class="label">Número:</span>
													<span class="value" class:missing={file.extractedInvoiceNumber === null}>
														{file.extractedInvoiceNumber ?? '❌'}
													</span>
												</div>
												<div class="data-item">
													<span class="label">Total:</span>
													<span class="value" class:missing={!file.extractedTotal}>
														{file.extractedTotal ? `$${file.extractedTotal.toLocaleString('es-AR')}` : '❌'}
													</span>
												</div>
											</div>

											{#if file.extractionErrors}
												<div class="extraction-errors-compact">
													⚠️ {file.extractionErrors}
												</div>
											{/if}

											<div class="view-actions">
												<button class="btn btn-primary" onclick={() => startEditing(file.id)}>
													✏️ Editar
												</button>
												<button class="btn btn-sm btn-secondary" onclick={() => deletePendingFile(file.id)}>
													🗑️ Eliminar
												</button>
											</div>
										</div>
									{/if}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'excel'}
			<!-- EXCEL IMPORT SECTION - Importar Excel de AFIP -->
			<section class="excel-import-section">
				<div class="section-header">
					<h2>📥 Importar Excel AFIP</h2>
					<p class="help-text">
						Importá el Excel o CSV de AFIP con las facturas esperadas. El sistema las usará para
						validar y auto-completar los datos de los PDFs.
					</p>
				</div>

				<div class="template-download-section">
					<div class="template-info">
						<strong>¿Primera vez?</strong> Descargá el template de ejemplo para ver el formato
						esperado
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
			</section>
		{:else if activeTab === 'invoices'}
			<!-- INVOICES SECTION - Listado de facturas finales -->
			<div class="stats-bar">
				<div class="stat">
					<span class="stat-value">{invoices.length}</span>
					<span class="stat-label">Facturas totales</span>
				</div>
				<div class="stat">
					<span class="stat-value">
						{invoices.filter((inv) => (inv.extractionConfidence || 0) < 70).length}
					</span>
					<span class="stat-label">Baja confianza</span>
				</div>
				<div class="stat">
					<span class="stat-value">{selectedInvoices.size}</span>
					<span class="stat-label">Seleccionadas</span>
				</div>
			</div>

			{#if invoices.length > 0}
				<div class="bulk-actions">
					<button class="btn btn-secondary" onclick={selectAll}>✓ Seleccionar todas</button>
					<button class="btn btn-secondary" onclick={clearSelection}>✕ Limpiar selección</button>
					<button
						class="btn btn-primary"
						onclick={exportSelected}
						disabled={selectedInvoices.size === 0}
					>
						📦 Exportar seleccionadas ({selectedInvoices.size})
					</button>
				</div>
			{/if}

			{#if loading}
				<div class="loading">
					<p>⏳ Cargando facturas...</p>
				</div>
			{:else if invoices.length === 0}
				<div class="empty">
					<p>📭 No hay facturas procesadas</p>
					<button class="btn btn-primary" onclick={() => (activeTab = 'upload')}>
						📤 Subir archivos
					</button>
				</div>
			{:else}
				<div class="invoice-list">
					{#each invoices as invoice (invoice.id)}
						<div class="invoice-card" class:selected={selectedInvoices.has(invoice.id)}>
							<label class="checkbox-label">
								<input
									type="checkbox"
									checked={selectedInvoices.has(invoice.id)}
									onchange={() => toggleSelection(invoice.id)}
								/>
							</label>

							<div class="invoice-header">
								<div>
									<h3>{invoice.fullInvoiceNumber}</h3>
									<p class="emitter">
										{invoice.emitterName}
										{#if invoice.emitterAlias}
											<span class="alias">({invoice.emitterAlias})</span>
										{/if}
									</p>
									<p class="cuit">{invoice.emitterCuit}</p>
								</div>
								<div class="confidence {getConfidenceColor(invoice.extractionConfidence)}">
									{invoice.extractionConfidence?.toFixed(0) || '?'}%
								</div>
							</div>

							<div class="invoice-details">
								<div class="detail">
									<span class="label">Fecha:</span>
									<span class="value">{invoice.issueDate}</span>
								</div>
								<div class="detail">
									<span class="label">Total:</span>
									<span class="value">
										{invoice.total !== null
											? `$${invoice.total.toLocaleString('es-AR')}`
											: '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Archivo:</span>
									<span class="value file">{invoice.originalFile.split('/').pop()}</span>
								</div>
							</div>

							<div class="actions">
								<a href="/annotate/{invoice.id}" class="btn btn-secondary"> 📝 Anotar </a>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{/if}
	</main>
</div>

<style>
	:global(body) {
		margin: 0;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell,
			sans-serif;
		background: #f5f5f5;
		color: #333;
	}

	.container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2.5rem;
		margin: 0 0 0.5rem 0;
		color: #2563eb;
	}

	.subtitle {
		color: #666;
		font-size: 1.1rem;
	}

	/* TABS */
	.tabs {
		display: flex;
		gap: 0.5rem;
		margin-bottom: 2rem;
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

	.badge {
		display: inline-block;
		background: #ef4444;
		color: white;
		font-size: 0.75rem;
		font-weight: 600;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		margin-left: 0.5rem;
	}

	/* UPLOAD SECTION */
	.upload-section {
		max-width: 800px;
		margin: 0 auto;
	}

	/* TEMPLATE DOWNLOAD SECTION */
	.template-download-section {
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
		border-radius: 12px;
		padding: 1.5rem;
		margin-bottom: 2rem;
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
		text-decoration: none;
		padding: 0.75rem 1.5rem;
		border-radius: 8px;
		font-weight: 600;
		transition: all 0.2s;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.template-buttons .btn:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
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
		margin-top: 1.5rem;
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
		margin-top: 1.5rem;
	}

	.btn-large {
		flex: 1;
		font-size: 1.1rem;
		padding: 1rem 2rem;
	}

	/* STATS */
	.stats-bar {
		display: flex;
		gap: 1.5rem;
		justify-content: center;
		margin-bottom: 1.5rem;
	}

	.stat {
		background: white;
		padding: 1.5rem 2rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		text-align: center;
		min-width: 150px;
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
		background: #f8fafc;
	}

	.filter-btn.active {
		border-color: #2563eb;
		background: #2563eb;
		color: white;
		font-weight: 600;
	}

	/* BULK ACTIONS */
	.bulk-actions {
		display: flex;
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.bulk-actions .btn {
		flex: 0 0 auto;
	}

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 3rem;
		font-size: 1.2rem;
		background: white;
		border-radius: 12px;
	}

	.error {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}

	.empty {
		color: #64748b;
	}

	/* INVOICE LIST */
	.invoice-list {
		display: grid;
		gap: 1.5rem;
	}

	.invoice-card {
		position: relative;
		background: white;
		border-radius: 12px;
		padding: 1.5rem 1.5rem 1.5rem 4rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transition: all 0.2s;
	}

	.invoice-card.selected {
		background: #eff6ff;
		border: 2px solid #2563eb;
	}

	.invoice-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	}

	.checkbox-label {
		position: absolute;
		left: 1.5rem;
		top: 1.5rem;
	}

	.checkbox-label input {
		width: 1.2rem;
		height: 1.2rem;
		cursor: pointer;
	}

	.invoice-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.invoice-header h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.3rem;
		color: #111;
	}

	.emitter {
		margin: 0.3rem 0;
		font-weight: 500;
		color: #374151;
	}

	.alias {
		color: #6b7280;
		font-size: 0.9rem;
	}

	.cuit {
		margin: 0.3rem 0;
		font-size: 0.9rem;
		color: #6b7280;
		font-family: monospace;
	}

	.confidence {
		font-size: 2rem;
		font-weight: bold;
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

	.invoice-details {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1.5rem;
	}

	.detail {
		display: flex;
		flex-direction: column;
	}

	.label {
		font-size: 0.85rem;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}

	.value {
		font-size: 1rem;
		color: #111;
		font-weight: 500;
	}

	.file {
		font-family: monospace;
		font-size: 0.9rem;
	}

	.actions {
		display: flex;
		gap: 1rem;
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

	.btn-secondary:hover {
		background: #e5e7eb;
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

	/* REVIEW SECTION */
	.review-header {
		text-align: center;
		margin-bottom: 2rem;
	}

	.review-header h2 {
		font-size: 1.8rem;
		margin: 0 0 0.5rem 0;
		color: #1e293b;
	}

	.review-header .hint {
		color: #64748b;
		font-size: 1rem;
	}

	.review-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		max-width: 900px;
		margin: 0 auto;
	}

	.review-card {
		background: white;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		border: 2px solid #e5e7eb;
		transition: all 0.2s;
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
		color: #1e293b;
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

	/* FORM STYLES */
	.edit-form {
		margin-top: 1rem;
	}

	.form-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.form-field {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-field label {
		font-weight: 600;
		color: #374151;
		font-size: 0.9rem;
	}

	.form-field input,
	.form-field select {
		padding: 0.75rem;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		font-size: 1rem;
		transition: all 0.2s;
	}

	.form-field input:focus,
	.form-field select:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.hint-text {
		font-size: 0.85rem;
		color: #64748b;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		padding-top: 1rem;
		border-top: 2px solid #f1f5f9;
	}

	/* DATA DISPLAY */
	.data-display {
		margin-top: 1rem;
	}

	.data-grid-compact {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.extraction-errors-compact {
		padding: 0.75rem 1rem;
		background: #fef2f2;
		border-left: 3px solid #ef4444;
		border-radius: 6px;
		color: #991b1b;
		font-size: 0.9rem;
		margin-bottom: 1rem;
	}

	.view-actions {
		display: flex;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 2px solid #f1f5f9;
	}

	/* PENDING FILES SECTION */
	.pending-file-list {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.pending-file-card {
		background: white;
		border-radius: 12px;
		padding: 1.5rem 1.5rem 1.5rem 4rem; /* Más padding-left para el checkbox */
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
		border: 2px solid #e5e7eb;
	}

	.pending-file-card.failed {
		border-color: #fecaca;
		background: #fef2f2;
	}

	.pending-file-header {
		display: flex;
		justify-content: space-between;
		align-items: flex-start;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.upload-date,
	.file-size {
		font-size: 0.9rem;
		color: #64748b;
		margin: 0.25rem 0;
	}

	.status-badge {
		padding: 0.5rem 1rem;
		border-radius: 6px;
		font-weight: 500;
		font-size: 0.9rem;
	}

	.status-pending {
		background: #fef3c7;
		color: #92400e;
	}

	.status-failed {
		background: #fecaca;
		color: #991b1b;
	}

	.status-reviewing {
		background: #dbeafe;
		color: #1e40af;
	}

	.status-processed {
		background: #d1fae5;
		color: #065f46;
	}

	.data-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.data-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.data-item .label {
		font-size: 0.85rem;
		color: #64748b;
		font-weight: 500;
	}

	.data-item .value {
		font-size: 1rem;
		color: #1e293b;
		font-weight: 500;
	}

	.data-item .value.missing {
		color: #ef4444;
		font-weight: 400;
	}

	.confidence-info,
	.extraction-errors {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.5rem;
	}

	.extraction-errors {
		padding: 0.75rem;
		background: #fef2f2;
		border-radius: 6px;
		border-left: 3px solid #ef4444;
	}

	.pending-file-actions {
		display: flex;
		gap: 0.75rem;
		flex-wrap: wrap;
	}

	/* TWO-COLUMN LAYOUT FOR REVIEW */
	.review-card-content {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 1.5rem;
		margin-top: 1rem;
	}

	.review-card.editing .review-card-content {
		grid-template-columns: 1.5fr 1fr;
	}

	@media (max-width: 1200px) {
		.review-card-content {
			grid-template-columns: 1fr;
		}
	}

	/* FILE PREVIEW */
	.file-preview {
		position: relative;
		background: #f8fafc;
		border: 2px solid #e5e7eb;
		border-radius: 8px;
		overflow: hidden;
		min-height: 500px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.pdf-iframe {
		width: 100%;
		height: 600px;
		border: none;
		background: white;
	}

	.image-preview {
		max-width: 100%;
		max-height: 600px;
		object-fit: contain;
		display: block;
		margin: 0 auto;
	}

	.preview-error {
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

	/* DETECTED OVERLAY */
	.detected-overlay {
		position: absolute;
		top: 1rem;
		right: 1rem;
		background: rgba(255, 255, 255, 0.97);
		border: 2px solid #3b82f6;
		border-radius: 8px;
		padding: 1rem;
		max-width: 280px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		z-index: 10;
	}

	.detected-overlay h4 {
		margin: 0 0 0.5rem 0;
		font-size: 0.9rem;
		color: #1e293b;
		font-weight: 600;
	}

	.confidence-display {
		font-size: 0.85rem;
		font-weight: 600;
		padding: 0.5rem;
		border-radius: 4px;
		margin-bottom: 0.75rem;
		text-align: center;
	}

	.confidence-display.low {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}

	.confidence-display.medium {
		background: #fef3c7;
		color: #ca8a04;
		border: 1px solid #fde68a;
	}

	.confidence-display.high {
		background: #dcfce7;
		color: #16a34a;
		border: 1px solid #bbf7d0;
	}

	.detected-list {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}

	.detected-item {
		font-size: 0.8rem;
		font-weight: 500;
		padding: 0.35rem 0.5rem;
		border-radius: 4px;
		background: #f0fdf4;
		color: #059669;
	}

	.detected-item.missing {
		background: #fef2f2;
		color: #dc2626;
	}

	.extraction-errors-overlay {
		margin-top: 0.75rem;
		padding: 0.5rem;
		background: #fef2f2;
		border-left: 3px solid #ef4444;
		border-radius: 4px;
		color: #991b1b;
		font-size: 0.75rem;
		line-height: 1.3;
	}

	/* FILE DATA COLUMN */
	.file-data {
		display: flex;
		flex-direction: column;
	}

	/* EXCEL MATCH CARDS */
	.excel-match-card {
		margin-bottom: 1.5rem;
		padding: 1.25rem;
		border-radius: 10px;
		border: 2px solid;
	}

	.excel-match-card h4 {
		margin: 0 0 1rem 0;
		font-size: 1.05rem;
		font-weight: 600;
	}

	.excel-match-card.exact-match {
		background: #f0fdf4;
		border-color: #22c55e;
	}

	.excel-match-card.exact-match h4 {
		color: #15803d;
	}

	.excel-match-card.candidates-match {
		background: #fffbeb;
		border-color: #f59e0b;
	}

	.excel-match-card.candidates-match h4 {
		color: #b45309;
	}

	.excel-match-card.no-match {
		background: #eff6ff;
		border-color: #3b82f6;
	}

	.excel-match-card.no-match h4 {
		color: #1e40af;
	}

	.excel-match-data {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 0.75rem;
		margin-bottom: 1rem;
	}

	.match-item {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.match-label {
		font-size: 0.8rem;
		font-weight: 500;
		color: #64748b;
		text-transform: uppercase;
		letter-spacing: 0.5px;
	}

	.match-value {
		font-size: 0.95rem;
		font-weight: 600;
		color: #1e293b;
	}

	.match-hint {
		margin: 0.75rem 0 0 0;
		padding: 0.75rem;
		background: rgba(255, 255, 255, 0.7);
		border-radius: 6px;
		font-size: 0.9rem;
		color: #475569;
		line-height: 1.5;
	}

	.candidates-list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
	}

	.candidate-item {
		padding: 0.75rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.candidate-item:hover {
		border-color: #f59e0b;
		box-shadow: 0 2px 4px rgba(245, 158, 11, 0.1);
	}

	.candidate-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 0.5rem;
	}

	.candidate-header strong {
		font-family: monospace;
		font-size: 0.95rem;
		color: #1e293b;
	}

	.confidence-mini {
		font-size: 0.75rem;
		padding: 0.25rem 0.5rem;
		background: #fef3c7;
		color: #b45309;
		border-radius: 4px;
		font-weight: 600;
	}

	.candidate-details {
		display: flex;
		gap: 1rem;
		flex-wrap: wrap;
		font-size: 0.85rem;
		color: #64748b;
	}

	.candidate-details span {
		display: inline-block;
	}
</style>
