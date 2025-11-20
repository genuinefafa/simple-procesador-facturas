<script lang="ts">
	import { onMount } from 'svelte';
	import { toast } from '$lib/toast.svelte';

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

	interface PendingFile {
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
	let pendingFiles: PendingFile[] = $state([]);
	let pendingFilesStats = $state({ total: 0, pending: 0, reviewing: 0, processed: 0, failed: 0 });
	let loading = $state(false);
	let error = $state<string | null>(null);
	let uploading = $state(false);
	let processing = $state(false);
	let uploadedFiles: File[] = $state([]);
	let selectedInvoices = $state<Set<number>>(new Set());
	let selectedPendingFiles = $state<Set<number>>(new Set());
	let activeTab = $state<'upload' | 'pending' | 'review'>('upload');

	onMount(async () => {
		await loadInvoices();
		await loadPendingFiles();
	});

	async function loadPendingFiles() {
		loading = true;
		try {
			const response = await fetch('/api/pending-files?limit=100');
			const data = await response.json();

			if (data.success) {
				pendingFiles = data.data;
				pendingFilesStats = data.stats;
			} else {
				error = data.error || 'Error al cargar archivos pendientes';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error de conexión';
		} finally {
			loading = false;
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
				error = data.error || 'Error al cargar facturas';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error de conexión';
		} finally {
			loading = false;
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
		error = null;

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

			// 2. Process uploaded files
			processing = true;
			const pendingFileIds = uploadData.files.map((f: any) => f.id);
			const processResponse = await fetch('/api/invoices/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pendingFileIds })
			});
			const processData = await processResponse.json();

			if (!processData.success) {
				throw new Error(processData.error || 'Error al procesar facturas');
			}

			// 3. Clear uploaded files and reload
			uploadedFiles = [];
			await loadInvoices();
			await loadPendingFiles();
			activeTab = 'pending';

			// Show success message
			toast.success(
				`Procesadas ${processData.stats.successful}/${processData.stats.total} facturas`
			);
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error desconocido';
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

		try {
			const response = await fetch('/api/invoices/export', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ invoiceIds: Array.from(selectedInvoices) })
			});
			const data = await response.json();

			if (data.success) {
				toast.success(`Exportadas ${data.stats.successful}/${data.stats.total} facturas`);
				clearSelection();
			} else {
				toast.error(`Error: ${data.error}`);
			}
		} catch (err) {
			toast.error(`Error al exportar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
		}
	}

	function getConfidenceColor(confidence: number | null): string {
		if (!confidence) return 'text-gray-400';
		if (confidence >= 90) return 'text-green-600';
		if (confidence >= 70) return 'text-yellow-600';
		return 'text-red-600';
	}

	function togglePendingFileSelection(id: number) {
		if (selectedPendingFiles.has(id)) {
			selectedPendingFiles.delete(id);
		} else {
			selectedPendingFiles.add(id);
		}
		selectedPendingFiles = selectedPendingFiles;
	}

	function selectAllPendingFiles() {
		selectedPendingFiles = new Set(pendingFiles.map((pf) => pf.id));
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
		error = null;

		try {
			const response = await fetch('/api/invoices/process', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ pendingFileIds: Array.from(selectedPendingFiles) })
			});
			const data = await response.json();

			if (data.success) {
				toast.success(`Procesadas ${data.stats.successful}/${data.stats.total} facturas`);
				clearPendingFileSelection();
				await loadPendingFiles();
				await loadInvoices();
			} else {
				toast.error(`Error: ${data.error}`);
			}
		} catch (err) {
			toast.error(`Error al procesar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
		} finally {
			processing = false;
		}
	}

	async function deletePendingFile(id: number) {
		if (!confirm('¿Estás seguro de eliminar este archivo?')) {
			return;
		}

		try {
			const response = await fetch(`/api/pending-files/${id}`, {
				method: 'DELETE'
			});
			const data = await response.json();

			if (data.success) {
				toast.success('Archivo eliminado correctamente');
				await loadPendingFiles();
			} else {
				toast.error(`Error: ${data.error}`);
			}
		} catch (err) {
			toast.error(`Error al eliminar: ${err instanceof Error ? err.message : 'Error desconocido'}`);
		}
	}

	function getStatusBadgeClass(status: string): string {
		switch (status) {
			case 'pending':
				return 'badge-pending';
			case 'reviewing':
				return 'badge-reviewing';
			case 'processed':
				return 'badge-processed';
			case 'failed':
				return 'badge-failed';
			default:
				return '';
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

<div class="container">
	<header>
		<h1>🧾 Procesador de Facturas</h1>
		<p class="subtitle">Flujo completo: Upload → Procesar → Revisar → Exportar</p>
	</header>

	<nav class="tabs">
		<button class="tab" class:active={activeTab === 'upload'} onclick={() => (activeTab = 'upload')}>
			📤 1. Subir Archivos
		</button>
		<button
			class="tab"
			class:active={activeTab === 'pending'}
			onclick={() => (activeTab = 'pending')}
		>
			📂 2. Archivos Pendientes
			{#if pendingFilesStats.pending + pendingFilesStats.reviewing > 0}
				<span class="badge">{pendingFilesStats.pending + pendingFilesStats.reviewing}</span>
			{/if}
		</button>
		<button class="tab" class:active={activeTab === 'review'} onclick={() => (activeTab = 'review')}>
			📋 3. Revisar y Exportar
		</button>
	</nav>

	{#if error}
		<div class="error">
			<p>❌ {error}</p>
			<button class="btn btn-secondary" onclick={() => (error = null)}>Cerrar</button>
		</div>
	{/if}

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
		{:else if activeTab === 'pending'}
			<!-- PENDING FILES SECTION -->
			<div class="stats-bar">
				<div class="stat">
					<span class="stat-value">{pendingFilesStats.total}</span>
					<span class="stat-label">Total</span>
				</div>
				<div class="stat">
					<span class="stat-value">{pendingFilesStats.pending}</span>
					<span class="stat-label">Pendientes</span>
				</div>
				<div class="stat">
					<span class="stat-value">{pendingFilesStats.reviewing}</span>
					<span class="stat-label">En Revisión</span>
				</div>
				<div class="stat">
					<span class="stat-value">{pendingFilesStats.processed}</span>
					<span class="stat-label">Procesados</span>
				</div>
				<div class="stat">
					<span class="stat-value">{pendingFilesStats.failed}</span>
					<span class="stat-label">Errores</span>
				</div>
			</div>

			{#if pendingFiles.length > 0}
				<div class="bulk-actions">
					<button class="btn btn-secondary" onclick={selectAllPendingFiles}>
						✓ Seleccionar todos
					</button>
					<button class="btn btn-secondary" onclick={clearPendingFileSelection}>
						✕ Limpiar selección
					</button>
					<button
						class="btn btn-primary"
						onclick={processPendingFiles}
						disabled={selectedPendingFiles.size === 0 || processing}
					>
						{#if processing}
							⏳ Procesando...
						{:else}
							🔄 Procesar seleccionados ({selectedPendingFiles.size})
						{/if}
					</button>
				</div>
			{/if}

			{#if loading}
				<div class="loading">
					<p>⏳ Cargando archivos pendientes...</p>
				</div>
			{:else if pendingFiles.length === 0}
				<div class="empty">
					<p>📭 No hay archivos pendientes</p>
					<button class="btn btn-primary" onclick={() => (activeTab = 'upload')}>
						📤 Subir archivos
					</button>
				</div>
			{:else}
				<div class="invoice-list">
					{#each pendingFiles as pf (pf.id)}
						<div
							class="invoice-card pending-file-card"
							class:selected={selectedPendingFiles.has(pf.id)}
						>
							<label class="checkbox-label">
								<input
									type="checkbox"
									checked={selectedPendingFiles.has(pf.id)}
									onchange={() => togglePendingFileSelection(pf.id)}
								/>
							</label>

							<div class="invoice-header">
								<div>
									<h3>{pf.originalFilename}</h3>
									<span class="status-badge {getStatusBadgeClass(pf.status)}">
										{getStatusText(pf.status)}
									</span>
								</div>
								<div class="confidence {getConfidenceColor(pf.extractionConfidence)}">
									{pf.extractionConfidence?.toFixed(0) || '?'}%
								</div>
							</div>

							<div class="invoice-details">
								<div class="detail">
									<span class="label">CUIT:</span>
									<span class="value">
										{pf.extractedCuit || '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Fecha:</span>
									<span class="value">
										{pf.extractedDate || '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Total:</span>
									<span class="value">
										{pf.extractedTotal !== null
											? `$${pf.extractedTotal.toLocaleString('es-AR')}`
											: '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Tipo:</span>
									<span class="value">
										{pf.extractedType || '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Punto Venta:</span>
									<span class="value">
										{pf.extractedPointOfSale !== null ? pf.extractedPointOfSale : '❌ No detectado'}
									</span>
								</div>
								<div class="detail">
									<span class="label">Número:</span>
									<span class="value">
										{pf.extractedInvoiceNumber !== null
											? pf.extractedInvoiceNumber
											: '❌ No detectado'}
									</span>
								</div>
							</div>

							{#if pf.extractionErrors}
								<div class="extraction-errors">
									<p class="error-title">⚠️ Errores de extracción:</p>
									<p class="error-text">{pf.extractionErrors}</p>
								</div>
							{/if}

							<div class="actions">
								{#if pf.status === 'processed' && pf.invoiceId}
									<a href="/annotate/{pf.invoiceId}" class="btn btn-secondary btn-sm">
										📝 Ver Factura
									</a>
								{:else}
									<a href="/pending-files/{pf.id}/edit" class="btn btn-primary btn-sm">
										✏️ Editar
									</a>
									<button
										class="btn btn-secondary btn-sm"
										onclick={() => {
											selectedPendingFiles = new Set([pf.id]);
											processPendingFiles();
										}}
									>
										🔄 Procesar
									</button>
								{/if}
								<button class="btn btn-secondary btn-sm" onclick={() => deletePendingFile(pf.id)}>
									🗑️ Eliminar
								</button>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		{:else if activeTab === 'review'}
			<!-- REVIEW SECTION -->
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

	/* UPLOAD SECTION */
	.upload-section {
		max-width: 800px;
		margin: 0 auto;
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
		margin-bottom: 2rem;
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

	.btn-sm {
		padding: 0.5rem 1rem;
		font-size: 0.9rem;
	}

	/* TAB BADGE */
	.badge {
		display: inline-block;
		background: #ef4444;
		color: white;
		font-size: 0.75rem;
		font-weight: bold;
		padding: 0.25rem 0.5rem;
		border-radius: 12px;
		margin-left: 0.5rem;
	}

	/* STATUS BADGES */
	.status-badge {
		display: inline-block;
		padding: 0.4rem 0.8rem;
		border-radius: 6px;
		font-size: 0.85rem;
		font-weight: 500;
		margin-top: 0.5rem;
	}

	.badge-pending {
		background: #fef3c7;
		color: #92400e;
	}

	.badge-reviewing {
		background: #dbeafe;
		color: #1e40af;
	}

	.badge-processed {
		background: #d1fae5;
		color: #065f46;
	}

	.badge-failed {
		background: #fee2e2;
		color: #991b1b;
	}

	/* PENDING FILE CARD */
	.pending-file-card .invoice-details {
		grid-template-columns: repeat(3, 1fr);
	}

	.extraction-errors {
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 8px;
		padding: 1rem;
		margin-top: 1rem;
		margin-bottom: 1rem;
	}

	.error-title {
		font-weight: 600;
		color: #dc2626;
		margin: 0 0 0.5rem 0;
	}

	.error-text {
		color: #991b1b;
		margin: 0;
		font-size: 0.9rem;
	}
</style>
