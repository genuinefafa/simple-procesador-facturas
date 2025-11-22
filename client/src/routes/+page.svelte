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

	/**
	 * Selecciona un candidato del Excel y auto-completa los datos del formulario
	 */
	function selectCandidate(fileId: number, candidateIndex: number) {
		const matchInfo = matchesData[fileId];
		if (!matchInfo?.candidates?.[candidateIndex]) return;

		const candidate = matchInfo.candidates[candidateIndex];

		// Actualizar el formulario de edición con los datos del candidato
		editFormData[fileId] = {
			...editFormData[fileId],
			extractedCuit: candidate.cuit,
			extractedDate: candidate.issueDate,
			extractedType: candidate.invoiceType,
			extractedPointOfSale: candidate.pointOfSale,
			extractedInvoiceNumber: candidate.invoiceNumber,
			extractedTotal: candidate.total,
		};

		// Actualizar también matchesData para reflejar el candidato seleccionado
		matchesData[fileId] = {
			...matchInfo,
			bestMatch: candidate,
			selectedCandidateIndex: candidateIndex,
		};

		// Trigger reactivity
		matchesData = matchesData;
		editFormData = editFormData;

		toast.success(`Candidato seleccionado: ${candidate.invoiceType}-${candidate.pointOfSale}-${candidate.invoiceNumber}`);
	}

	/**
	 * Aplica los datos del mejor match del Excel al formulario
	 */
	function applyExcelData(fileId: number) {
		const matchInfo = matchesData[fileId];
		const excelData = matchInfo?.exactMatch || matchInfo?.bestMatch || matchInfo?.candidates?.[0];
		if (!excelData) {
			toast.error('No hay datos del Excel para aplicar');
			return;
		}

		editFormData[fileId] = {
			...editFormData[fileId],
			extractedCuit: excelData.cuit,
			extractedDate: excelData.issueDate,
			extractedType: excelData.invoiceType,
			extractedPointOfSale: excelData.pointOfSale,
			extractedInvoiceNumber: excelData.invoiceNumber,
			extractedTotal: excelData.total,
		};

		editFormData = editFormData;
		toast.success('Datos del Excel aplicados');
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
						{@const matchInfo = matchesData[file.id]}
						{@const excelData = matchInfo?.exactMatch || matchInfo?.bestMatch || matchInfo?.candidates?.[0] || null}
						{@const matchScore = excelData?.matchScore ?? (matchInfo?.hasExactMatch ? 100 : 0)}
						{@const hasPartialMatches = (matchInfo?.candidates?.length || 0) > 0}
						{@const ocrConfidence = matchInfo?.ocrConfidence ?? file.extractionConfidence ?? 0}
						{@const cuitMatch = file.extractedCuit && excelData?.cuit && file.extractedCuit === excelData.cuit}
						{@const dateMatch = file.extractedDate && excelData?.issueDate && file.extractedDate === excelData.issueDate}
						{@const typeMatch = file.extractedType && excelData?.invoiceType && file.extractedType === excelData.invoiceType}
						{@const posMatch = file.extractedPointOfSale != null && excelData?.pointOfSale != null && file.extractedPointOfSale === excelData.pointOfSale}
						{@const numMatch = file.extractedInvoiceNumber != null && excelData?.invoiceNumber != null && file.extractedInvoiceNumber === excelData.invoiceNumber}
						{@const totalMatch = file.extractedTotal != null && excelData?.total != null && Math.abs(file.extractedTotal - excelData.total) < 0.01}
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
								<!-- PREVIEW DEL ARCHIVO (sin overlay) -->
								<div class="file-preview clean">
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
											<p>Vista previa no disponible</p>
											<p class="filename">{file.originalFilename}</p>
										</div>
									{/if}
								</div>

								<!-- DATOS COMPARATIVOS -->
								<div class="file-data">
									<!-- Tabla de comparación -->
									<div class="comparison-section">
										<h4>Comparación de datos</h4>

										<!-- Métricas de confianza -->
										<div class="confidence-metrics">
											<div class="confidence-bar" class:low={ocrConfidence < 50} class:medium={ocrConfidence >= 50 && ocrConfidence < 80} class:high={ocrConfidence >= 80}>
												<span class="metric-label">Detección PDF:</span>
												<span class="metric-value">{ocrConfidence}%</span>
											</div>
											{#if excelData}
												<div class="confidence-bar fisco" class:low={matchScore < 50} class:medium={matchScore >= 50 && matchScore < 80} class:high={matchScore >= 80}>
													<span class="metric-label">Coincidencia Fisco:</span>
													<span class="metric-value">{matchScore}%</span>
													{#if matchInfo?.hasExactMatch}
														<span class="match-badge exact">Exacto</span>
													{:else if matchScore >= 75}
														<span class="match-badge good">Parcial</span>
													{:else}
														<span class="match-badge low">Bajo</span>
													{/if}
												</div>
											{:else}
												<div class="confidence-bar fisco none">
													<span class="metric-label">Coincidencia Fisco:</span>
													<span class="metric-value">Sin match</span>
												</div>
											{/if}
										</div>

										<!-- Selector de candidatos si hay múltiples -->
										{#if hasPartialMatches && matchInfo.candidates.length > 1}
											<div class="candidates-selector">
												<label>
													<span class="selector-label">{matchInfo.candidates.length} candidatos encontrados:</span>
													<select onchange={(e) => selectCandidate(file.id, parseInt(e.currentTarget.value))}>
														{#each matchInfo.candidates as candidate, idx}
															<option value={idx}>
																{candidate.invoiceType}-{String(candidate.pointOfSale).padStart(4, '0')}-{String(candidate.invoiceNumber).padStart(8, '0')} ({candidate.matchScore}% match)
															</option>
														{/each}
													</select>
												</label>
											</div>
										{/if}

										<table class="comparison-table">
											<thead>
												<tr>
													<th>Campo</th>
													<th>Detectado (PDF)</th>
													<th>Excel AFIP</th>
													<th></th>
												</tr>
											</thead>
											<tbody>
												<!-- CUIT -->
												<tr class:match={cuitMatch} class:no-match={file.extractedCuit && excelData?.cuit && !cuitMatch} class:missing={!file.extractedCuit}>
													<td class="field-name">CUIT</td>
													<td class="detected-value">{file.extractedCuit || '—'}</td>
													<td class="excel-value">{excelData?.cuit || '—'}</td>
													<td class="status-cell">
														{#if !file.extractedCuit}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if !excelData?.cuit}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if cuitMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="No coincide: PDF={file.extractedCuit}, Excel={excelData.cuit}">⚠</span>
														{/if}
													</td>
												</tr>

												<!-- Fecha -->
												<tr class:match={dateMatch} class:no-match={file.extractedDate && excelData?.issueDate && !dateMatch} class:missing={!file.extractedDate}>
													<td class="field-name">Fecha</td>
													<td class="detected-value">{file.extractedDate || '—'}</td>
													<td class="excel-value">{excelData?.issueDate || '—'}</td>
													<td class="status-cell">
														{#if !file.extractedDate}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if !excelData?.issueDate}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if dateMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="No coincide: PDF={file.extractedDate}, Excel={excelData.issueDate}">⚠</span>
														{/if}
													</td>
												</tr>

												<!-- Tipo -->
												<tr class:match={typeMatch} class:no-match={file.extractedType && excelData?.invoiceType && !typeMatch} class:missing={!file.extractedType}>
													<td class="field-name">Tipo</td>
													<td class="detected-value">{file.extractedType || '—'}</td>
													<td class="excel-value">{excelData?.invoiceType || '—'}</td>
													<td class="status-cell">
														{#if !file.extractedType}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if !excelData?.invoiceType}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if typeMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="No coincide: PDF={file.extractedType}, Excel={excelData.invoiceType}">⚠</span>
														{/if}
													</td>
												</tr>

												<!-- Punto de Venta -->
												<tr class:match={posMatch} class:no-match={file.extractedPointOfSale != null && excelData?.pointOfSale != null && !posMatch} class:missing={file.extractedPointOfSale == null}>
													<td class="field-name">P. Venta</td>
													<td class="detected-value">{file.extractedPointOfSale ?? '—'}</td>
													<td class="excel-value">{excelData?.pointOfSale ?? '—'}</td>
													<td class="status-cell">
														{#if file.extractedPointOfSale == null}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if excelData?.pointOfSale == null}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if posMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="No coincide: PDF={file.extractedPointOfSale}, Excel={excelData.pointOfSale}">⚠</span>
														{/if}
													</td>
												</tr>

												<!-- Número -->
												<tr class:match={numMatch} class:no-match={file.extractedInvoiceNumber != null && excelData?.invoiceNumber != null && !numMatch} class:missing={file.extractedInvoiceNumber == null}>
													<td class="field-name">Número</td>
													<td class="detected-value">{file.extractedInvoiceNumber ?? '—'}</td>
													<td class="excel-value">{excelData?.invoiceNumber ?? '—'}</td>
													<td class="status-cell">
														{#if file.extractedInvoiceNumber == null}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if excelData?.invoiceNumber == null}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if numMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="No coincide: PDF={file.extractedInvoiceNumber}, Excel={excelData.invoiceNumber}">⚠</span>
														{/if}
													</td>
												</tr>

												<!-- Total -->
												<tr class:match={totalMatch} class:no-match={file.extractedTotal != null && excelData?.total != null && !totalMatch} class:missing={file.extractedTotal == null}>
													<td class="field-name">Total</td>
													<td class="detected-value">{file.extractedTotal != null ? `$${file.extractedTotal.toLocaleString('es-AR')}` : '—'}</td>
													<td class="excel-value">{excelData?.total != null ? `$${excelData.total.toLocaleString('es-AR')}` : '—'}</td>
													<td class="status-cell">
														{#if file.extractedTotal == null}
															<span class="status-icon missing" title="No detectado en PDF">❌</span>
														{:else if excelData?.total == null}
															<span class="status-icon no-excel" title="Sin datos de Excel">⚪</span>
														{:else if totalMatch}
															<span class="status-icon ok" title="Coincide">✓</span>
														{:else}
															<span class="status-icon error" title="Diferencia: PDF=${file.extractedTotal}, Excel=${excelData.total}">⚠</span>
														{/if}
													</td>
												</tr>
											</tbody>
										</table>

										<!-- Leyenda -->
										<div class="comparison-legend">
											<span><span class="status-icon ok">✓</span> Coincide</span>
											<span><span class="status-icon error">⚠</span> Difiere</span>
											<span><span class="status-icon missing">❌</span> No detectado</span>
											<span><span class="status-icon no-excel">⚪</span> Sin Excel</span>
										</div>

										{#if file.extractionErrors}
											<div class="extraction-errors-compact">
												⚠️ {file.extractionErrors}
											</div>
										{/if}
									</div>

									<!-- Acciones -->
									<div class="review-actions">
										{#if excelData}
											<button class="btn btn-secondary" onclick={() => applyExcelData(file.id)} title="Usar datos del Excel">
												📋 Aplicar Excel
											</button>
										{/if}
										<button class="btn btn-primary" onclick={() => startEditing(file.id)}>
											✏️ Editar datos
										</button>
										<button class="btn btn-success" onclick={() => saveAndFinalize(file.id)}
											disabled={!file.extractedCuit || !file.extractedType || file.extractedPointOfSale == null || file.extractedInvoiceNumber == null || !file.extractedDate}>
											✅ Confirmar y procesar
										</button>
										<button class="btn btn-sm btn-danger" onclick={() => deletePendingFile(file.id)}>
											🗑️
										</button>
									</div>

									<!-- Modal de edición (solo si está editando) -->
									{#if editingFile === file.id}
										<div class="edit-modal">
											<h4>Editar datos</h4>
											<div class="edit-form-compact">
												<div class="form-row">
													<label>
														CUIT
														<input type="text" bind:value={editFormData[file.id].extractedCuit} placeholder="XX-XXXXXXXX-X" />
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
														<input type="number" bind:value={editFormData[file.id].extractedInvoiceNumber} />
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

	/* FILE DATA COLUMN */
	.file-data {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	/* COMPARISON SECTION */
	.comparison-section {
		background: white;
		border-radius: 8px;
		padding: 1rem;
	}

	.comparison-section h4 {
		margin: 0 0 0.75rem 0;
		font-size: 1rem;
		color: #374151;
		font-weight: 600;
	}

	.confidence-bar {
		padding: 0.5rem 0.75rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 600;
		margin-bottom: 0.75rem;
		text-align: center;
	}

	.confidence-bar.low {
		background: #fef2f2;
		color: #dc2626;
	}

	.confidence-bar.medium {
		background: #fef3c7;
		color: #b45309;
	}

	.confidence-bar.high {
		background: #dcfce7;
		color: #16a34a;
	}

	.confidence-bar.fisco.none {
		background: #f3f4f6;
		color: #6b7280;
	}

	/* CONFIDENCE METRICS */
	.confidence-metrics {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1rem;
	}

	.confidence-metrics .confidence-bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0;
		padding: 0.4rem 0.75rem;
	}

	.confidence-metrics .metric-label {
		font-weight: 500;
	}

	.confidence-metrics .metric-value {
		font-weight: 700;
	}

	.match-badge {
		font-size: 0.7rem;
		padding: 0.15rem 0.4rem;
		border-radius: 4px;
		margin-left: 0.5rem;
		text-transform: uppercase;
	}

	.match-badge.exact {
		background: #16a34a;
		color: white;
	}

	.match-badge.good {
		background: #2563eb;
		color: white;
	}

	.match-badge.low {
		background: #dc2626;
		color: white;
	}

	/* CANDIDATES SELECTOR */
	.candidates-selector {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: #eff6ff;
		border-radius: 6px;
		border: 1px solid #bfdbfe;
	}

	.candidates-selector label {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.candidates-selector .selector-label {
		font-size: 0.85rem;
		font-weight: 600;
		color: #1e40af;
	}

	.candidates-selector select {
		padding: 0.5rem;
		border: 1px solid #93c5fd;
		border-radius: 4px;
		font-size: 0.85rem;
		background: white;
	}

	.btn-secondary {
		background: #6b7280;
		color: white;
	}

	.btn-secondary:hover {
		background: #4b5563;
	}

	/* COMPARISON TABLE */
	.comparison-table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	.comparison-table th {
		text-align: left;
		padding: 0.5rem;
		font-size: 0.75rem;
		font-weight: 600;
		color: #6b7280;
		text-transform: uppercase;
		border-bottom: 2px solid #e5e7eb;
	}

	.comparison-table td {
		padding: 0.5rem;
		border-bottom: 1px solid #f3f4f6;
	}

	.comparison-table tr:last-child td {
		border-bottom: none;
	}

	.comparison-table tr.match {
		background: #f0fdf4;
	}

	.comparison-table tr.no-match {
		background: #fef2f2;
	}

	.comparison-table tr.missing {
		background: #fefce8;
	}

	.comparison-table .field-name {
		font-weight: 600;
		color: #374151;
		width: 80px;
	}

	.comparison-table .detected-value {
		font-family: monospace;
		color: #1e293b;
	}

	.comparison-table .excel-value {
		font-family: monospace;
		color: #6366f1;
	}

	.comparison-table .status-cell {
		width: 30px;
		text-align: center;
	}

	.status-icon {
		font-size: 1rem;
		cursor: help;
	}

	.status-icon.ok {
		color: #16a34a;
	}

	.status-icon.error {
		color: #dc2626;
	}

	.status-icon.missing {
		color: #f59e0b;
	}

	.status-icon.no-excel {
		color: #9ca3af;
	}

	/* COMPARISON LEGEND */
	.comparison-legend {
		display: flex;
		gap: 1rem;
		justify-content: center;
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
		font-size: 0.75rem;
		color: #6b7280;
	}

	.comparison-legend span {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	/* REVIEW ACTIONS */
	.review-actions {
		display: flex;
		gap: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid #e5e7eb;
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
		cursor: not-allowed;
	}

	/* EDIT MODAL */
	.edit-modal {
		background: #f8fafc;
		border: 2px solid #2563eb;
		border-radius: 8px;
		padding: 1rem;
	}

	.edit-modal h4 {
		margin: 0 0 0.75rem 0;
		color: #2563eb;
		font-size: 0.95rem;
	}

	.edit-form-compact .form-row {
		display: flex;
		gap: 0.75rem;
		margin-bottom: 0.75rem;
		flex-wrap: wrap;
	}

	.edit-form-compact label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		font-size: 0.8rem;
		font-weight: 500;
		color: #374151;
		flex: 1;
		min-width: 100px;
	}

	.edit-form-compact input,
	.edit-form-compact select {
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

	/* FILE PREVIEW CLEAN (without overlay) */
	.file-preview.clean {
		position: relative;
	}
</style>
