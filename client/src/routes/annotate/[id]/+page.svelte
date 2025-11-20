<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import * as pdfjsLib from 'pdfjs-dist';
	import { toast } from '$lib/toast.svelte';

	// Configure PDF.js worker - usar el worker del paquete npm
	pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
		'pdfjs-dist/build/pdf.worker.min.mjs',
		import.meta.url
	).toString();

	interface Zone {
		id?: number;
		field: string;
		x: number;
		y: number;
		width: number;
		height: number;
		extractedValue?: string;
	}

	interface InvoiceData {
		id: number;
		emitterName: string;
		emitterAlias: string | null;
		fullInvoiceNumber: string;
		issueDate: string;
		total: number | null;
		originalFile: string;
		extractionConfidence: number | null;
	}

	interface ExtractedValues {
		cuit?: string;
		fecha?: string;
		tipo?: string;
		punto_venta?: string;
		numero?: string;
		total?: string;
	}

	let invoice: InvoiceData | null = $state(null);
	let zones: Zone[] = $state([]);
	let extractedValues: ExtractedValues = $state({});
	let loading = $state(true);
	let error = $state<string | null>(null);
	let saving = $state(false);

	// Canvas state
	let canvas: HTMLCanvasElement | null = $state(null);
	let imageElement: HTMLImageElement | null = $state(null);
	let ctx: CanvasRenderingContext2D | null = null;
	let isDrawing = $state(false);
	let startX = 0;
	let startY = 0;
	let currentX = 0;
	let currentY = 0;
	let selectedField = $state('cuit');

	const fieldOptions = [
		{ value: 'cuit', label: 'CUIT', color: '#ef4444' },
		{ value: 'fecha', label: 'Fecha', color: '#3b82f6' },
		{ value: 'tipo', label: 'Tipo', color: '#8b5cf6' },
		{ value: 'punto_venta', label: 'Punto de Venta', color: '#10b981' },
		{ value: 'numero', label: 'Número', color: '#f59e0b' },
		{ value: 'total', label: 'Total', color: '#ec4899' }
	];

	function getFieldColor(field: string): string {
		return fieldOptions.find((f) => f.value === field)?.color || '#6b7280';
	}

	function getFieldLabel(field: string): string {
		return fieldOptions.find((f) => f.value === field)?.label || field;
	}

	function getExtractedValue(field: string): string | undefined {
		return extractedValues[field as keyof ExtractedValues];
	}

	// onMount solo carga los datos
	onMount(async () => {
		try {
			const invoiceId = $page.params.id;
			const response = await fetch(`/api/invoices/${invoiceId}`);
			const data = await response.json();

			if (data.success) {
				invoice = data.invoice;
				zones = data.zones || [];
				extractedValues = data.extractedValues || {};
			} else {
				error = data.error || 'Error al cargar factura';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error de conexión';
		} finally {
			loading = false;
		}
	});

	// $effect reacciona cuando canvas e invoice están disponibles
	$effect(() => {
		if (canvas && invoice && !imageElement) {
			loadImage();
		}
	});

	async function loadImage() {
		if (!invoice || !canvas) return;

		const fileUrl = `/api/files/${encodeURIComponent(invoice.originalFile)}`;
		const isPDF = invoice.originalFile.toLowerCase().endsWith('.pdf');

		try {
			if (isPDF) {
				await loadPDF(fileUrl);
			} else {
				await loadRegularImage(fileUrl);
			}
		} catch (err) {
			error = 'Error al cargar el archivo de la factura';
			console.error('Error cargando imagen:', err);
		}
	}

	async function loadPDF(url: string) {
		const loadingTask = pdfjsLib.getDocument(url);
		const pdf = await loadingTask.promise;

		// Get first page
		const page = await pdf.getPage(1);

		// Set canvas size based on viewport
		const viewport = page.getViewport({ scale: 1.5 });

		if (!canvas) return;

		canvas.width = viewport.width;
		canvas.height = viewport.height;
		ctx = canvas.getContext('2d');

		// Render PDF page to canvas
		await page.render({
			canvasContext: ctx!,
			viewport: viewport
		} as any).promise;

		// Create a temporary image element from the rendered canvas
		// so we can redraw it later with annotations
		const img = new Image();
		img.src = canvas.toDataURL();
		await new Promise((resolve) => {
			img.onload = resolve;
		});
		imageElement = img;

		redraw();
	}

	async function loadRegularImage(url: string) {
		return new Promise<void>((resolve, reject) => {
			const img = new Image();
			img.onload = () => {
				imageElement = img;
				if (canvas) {
					canvas.width = img.width;
					canvas.height = img.height;
					ctx = canvas.getContext('2d');
					redraw();
				}
				resolve();
			};
			img.onerror = () => {
				reject(new Error('Failed to load image'));
			};
			img.src = url;
		});
	}

	function redraw() {
		if (!ctx || !imageElement) return;

		// Clear canvas
		ctx.clearRect(0, 0, canvas!.width, canvas!.height);

		// Draw image
		ctx.drawImage(imageElement, 0, 0);

		// Draw existing zones
		zones.forEach((zone) => {
			drawZone(zone.x, zone.y, zone.width, zone.height, getFieldColor(zone.field), false);
		});

		// Draw current zone being drawn
		if (isDrawing) {
			const width = currentX - startX;
			const height = currentY - startY;
			drawZone(startX, startY, width, height, getFieldColor(selectedField), true);
		}
	}

	function drawZone(
		x: number,
		y: number,
		width: number,
		height: number,
		color: string,
		isDraft: boolean
	) {
		if (!ctx) return;

		ctx.strokeStyle = color;
		ctx.lineWidth = isDraft ? 3 : 2;
		ctx.setLineDash(isDraft ? [5, 5] : []);
		ctx.strokeRect(x, y, width, height);

		ctx.fillStyle = color + '20'; // 20 = 12% opacity
		ctx.fillRect(x, y, width, height);

		ctx.setLineDash([]);
	}

	function handleMouseDown(e: MouseEvent) {
		if (!canvas) return;

		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		startX = (e.clientX - rect.left) * scaleX;
		startY = (e.clientY - rect.top) * scaleY;
		currentX = startX;
		currentY = startY;
		isDrawing = true;
	}

	function handleMouseMove(e: MouseEvent) {
		if (!isDrawing || !canvas) return;

		const rect = canvas.getBoundingClientRect();
		const scaleX = canvas.width / rect.width;
		const scaleY = canvas.height / rect.height;

		currentX = (e.clientX - rect.left) * scaleX;
		currentY = (e.clientY - rect.top) * scaleY;

		redraw();
	}

	function handleMouseUp() {
		if (!isDrawing) return;

		isDrawing = false;

		const width = currentX - startX;
		const height = currentY - startY;

		// Only add zone if it has meaningful size
		if (Math.abs(width) > 10 && Math.abs(height) > 10) {
			// Normalize coordinates (in case user dragged from bottom-right to top-left)
			const x = width < 0 ? currentX : startX;
			const y = height < 0 ? currentY : startY;

			zones.push({
				field: selectedField,
				x: Math.round(x),
				y: Math.round(y),
				width: Math.round(Math.abs(width)),
				height: Math.round(Math.abs(height))
			});

			redraw();
		}
	}

	function deleteZone(index: number) {
		zones.splice(index, 1);
		redraw();
	}

	async function saveAnnotations() {
		if (!invoice || zones.length === 0) {
			toast.warning('Debe anotar al menos una zona antes de guardar');
			return;
		}

		saving = true;
		try {
			const response = await fetch('/api/annotations', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					invoiceId: invoice.id,
					zones
				})
			});

			const data = await response.json();

			if (data.success) {
				toast.success('Anotaciones guardadas correctamente');
				// Redirect back to main page
				window.location.href = '/';
			} else {
				error = data.error || 'Error al guardar anotaciones';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error de conexión';
		} finally {
			saving = false;
		}
	}
</script>

<div class="container">
	<header>
		<div class="header-content">
			<a href="/" class="back-link">← Volver</a>
			<h1>Anotar Factura</h1>
		</div>
	</header>

	{#if loading}
		<div class="loading">
			<p>⏳ Cargando factura...</p>
		</div>
	{:else if error}
		<div class="error">
			<p>❌ {error}</p>
		</div>
	{:else if invoice}
		<div class="annotation-workspace">
			<div class="sidebar">
				<div class="invoice-info">
					<h3>{invoice.fullInvoiceNumber}</h3>
					<p class="emitter">{invoice.emitterName}</p>
					<p class="date">Fecha: {invoice.issueDate}</p>
					{#if invoice.total}
						<p class="total">Total: ${invoice.total.toLocaleString('es-AR')}</p>
					{/if}
					{#if invoice.extractionConfidence}
						<p class="confidence">Confianza: {invoice.extractionConfidence.toFixed(0)}%</p>
					{/if}
				</div>

				<div class="field-selector">
					<h4>Campo a anotar</h4>
					{#each fieldOptions as option}
						<label class="field-option">
							<input
								type="radio"
								name="field"
								value={option.value}
								bind:group={selectedField}
							/>
							<span class="field-color" style="background-color: {option.color}"></span>
							<div class="field-info">
								<span class="field-name">{option.label}</span>
								{#if getExtractedValue(option.value)}
									<span class="field-value">"{getExtractedValue(option.value)}"</span>
								{/if}
							</div>
						</label>
					{/each}
				</div>

				<div class="zones-list">
					<h4>Zonas anotadas ({zones.length})</h4>
					{#if zones.length === 0}
						<p class="empty">No hay zonas anotadas aún</p>
					{:else}
						{#each zones as zone, i}
							<div class="zone-item">
								<div class="zone-info">
									<span
										class="zone-color"
										style="background-color: {getFieldColor(zone.field)}"
									></span>
									<div class="zone-details">
										<span class="zone-label">{getFieldLabel(zone.field)}</span>
										{#if zone.extractedValue || getExtractedValue(zone.field)}
											<span class="zone-value">"{zone.extractedValue || getExtractedValue(zone.field)}"</span>
										{/if}
									</div>
								</div>
								<button class="delete-btn" onclick={() => deleteZone(i)}>✕</button>
							</div>
						{/each}
					{/if}
				</div>

				<div class="actions">
					<button class="btn btn-primary" onclick={saveAnnotations} disabled={saving}>
						{saving ? '⏳ Guardando...' : '💾 Guardar anotaciones'}
					</button>
					<a href="/" class="btn btn-secondary">Cancelar</a>
				</div>
			</div>

			<div class="canvas-container">
				<div class="instructions">
					<p>
						<strong>Instrucciones:</strong> Seleccione un campo a la izquierda y luego arrastre
						sobre la imagen para dibujar un rectángulo sobre el valor correspondiente.
					</p>
				</div>
				<canvas
					bind:this={canvas}
					onmousedown={handleMouseDown}
					onmousemove={handleMouseMove}
					onmouseup={handleMouseUp}
					onmouseleave={() => (isDrawing = false)}
				></canvas>
			</div>
		</div>
	{/if}
</div>

<style>
	.container {
		max-width: 100%;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: #f5f5f5;
	}

	header {
		background: white;
		padding: 1rem 2rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
	}

	.header-content {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.back-link {
		text-decoration: none;
		color: #2563eb;
		font-weight: 500;
	}

	.back-link:hover {
		text-decoration: underline;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
		color: #111;
	}

	.loading,
	.error {
		text-align: center;
		padding: 3rem;
		font-size: 1.2rem;
	}

	.error {
		color: #dc2626;
	}

	.annotation-workspace {
		flex: 1;
		display: flex;
		overflow: hidden;
	}

	.sidebar {
		width: 320px;
		background: white;
		padding: 1.5rem;
		overflow-y: auto;
		box-shadow: 2px 0 4px rgba(0, 0, 0, 0.1);
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.invoice-info {
		padding-bottom: 1rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.invoice-info h3 {
		margin: 0 0 0.5rem 0;
		font-size: 1.2rem;
		color: #111;
	}

	.emitter {
		margin: 0.3rem 0;
		font-weight: 500;
		color: #374151;
	}

	.date,
	.total,
	.confidence {
		margin: 0.3rem 0;
		font-size: 0.9rem;
		color: #6b7280;
	}

	.field-selector h4,
	.zones-list h4 {
		margin: 0 0 1rem 0;
		font-size: 1rem;
		color: #111;
	}

	.field-option {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem;
		cursor: pointer;
		border-radius: 4px;
		transition: background 0.2s;
	}

	.field-option:hover {
		background: #f3f4f6;
	}

	.field-info {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		flex: 1;
	}

	.field-name {
		font-weight: 500;
		color: #374151;
	}

	.field-value {
		font-size: 0.8rem;
		color: #6b7280;
		font-style: italic;
	}

	.field-color,
	.zone-color {
		width: 16px;
		height: 16px;
		border-radius: 3px;
		flex-shrink: 0;
	}

	.zones-list {
		flex: 1;
		overflow-y: auto;
	}

	.empty {
		color: #9ca3af;
		font-size: 0.9rem;
		text-align: center;
		padding: 1rem;
	}

	.zone-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0.5rem;
		border-radius: 4px;
		background: #f9fafb;
		margin-bottom: 0.5rem;
	}

	.zone-info {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		flex: 1;
		min-width: 0;
	}

	.zone-details {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
		min-width: 0;
		flex: 1;
	}

	.zone-label {
		font-size: 0.9rem;
		color: #374151;
		font-weight: 500;
	}

	.zone-value {
		font-size: 0.8rem;
		color: #6b7280;
		font-style: italic;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.delete-btn {
		background: none;
		border: none;
		color: #dc2626;
		cursor: pointer;
		font-size: 1.2rem;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
		transition: background 0.2s;
	}

	.delete-btn:hover {
		background: #fee2e2;
	}

	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		padding-top: 1rem;
		border-top: 2px solid #e5e7eb;
	}

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
		text-align: center;
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

	.canvas-container {
		flex: 1;
		padding: 1.5rem;
		overflow: auto;
		display: flex;
		flex-direction: column;
		align-items: center;
	}

	.instructions {
		background: white;
		padding: 1rem 1.5rem;
		border-radius: 8px;
		margin-bottom: 1rem;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
		max-width: 800px;
		width: 100%;
	}

	.instructions p {
		margin: 0;
		color: #374151;
	}

	canvas {
		border: 2px solid #e5e7eb;
		background: white;
		cursor: crosshair;
		box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
		max-width: 100%;
		height: auto;
	}
</style>
