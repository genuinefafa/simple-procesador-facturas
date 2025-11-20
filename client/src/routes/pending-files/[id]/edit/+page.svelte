<script lang="ts">
	import { goto } from '$app/navigation';

	interface Props {
		data: {
			pendingFile: {
				id: number;
				originalFilename: string;
				filePath: string;
				extractedCuit: string | null;
				extractedDate: string | null;
				extractedTotal: number | null;
				extractedType: string | null;
				extractedPointOfSale: number | null;
				extractedInvoiceNumber: number | null;
				extractionConfidence: number | null;
				extractionErrors: string | null;
				status: string;
			};
		};
	}

	let { data }: Props = $props();
	let pendingFile = data.pendingFile;

	// Campos del formulario
	let cuit = $state(pendingFile.extractedCuit || '');
	let fecha = $state(pendingFile.extractedDate || '');
	let total = $state(pendingFile.extractedTotal?.toString() || '');
	let tipo = $state(pendingFile.extractedType || '');
	let puntoVenta = $state(pendingFile.extractedPointOfSale?.toString() || '');
	let numeroComprobante = $state(pendingFile.extractedInvoiceNumber?.toString() || '');

	let saving = $state(false);
	let processing = $state(false);
	let error = $state<string | null>(null);
	let success = $state<string | null>(null);

	async function handleSave() {
		saving = true;
		error = null;
		success = null;

		try {
			const response = await fetch(`/api/pending-files/${pendingFile.id}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					extractedCuit: cuit || null,
					extractedDate: fecha || null,
					extractedTotal: total ? parseFloat(total) : null,
					extractedType: tipo || null,
					extractedPointOfSale: puntoVenta ? parseInt(puntoVenta, 10) : null,
					extractedInvoiceNumber: numeroComprobante ? parseInt(numeroComprobante, 10) : null
				})
			});

			const data = await response.json();

			if (data.success) {
				success = 'Datos guardados correctamente';
			} else {
				error = data.error || 'Error al guardar';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error desconocido';
		} finally {
			saving = false;
		}
	}

	async function handleSaveAndProcess() {
		await handleSave();

		if (error) {
			return;
		}

		processing = true;

		try {
			const response = await fetch(`/api/pending-files/${pendingFile.id}/finalize`, {
				method: 'POST'
			});

			const data = await response.json();

			if (data.success) {
				alert('✅ Archivo procesado correctamente');
				goto('/');
			} else {
				error = data.error || 'Error al procesar';
			}
		} catch (err) {
			error = err instanceof Error ? err.message : 'Error desconocido';
		} finally {
			processing = false;
		}
	}

	function handleCancel() {
		goto('/');
	}

	function formatCuit(value: string): string {
		// Formato: XX-XXXXXXXX-X
		const numbers = value.replace(/\D/g, '');
		if (numbers.length <= 2) return numbers;
		if (numbers.length <= 10) return `${numbers.slice(0, 2)}-${numbers.slice(2)}`;
		return `${numbers.slice(0, 2)}-${numbers.slice(2, 10)}-${numbers.slice(10, 11)}`;
	}

	function handleCuitInput(event: Event) {
		const target = event.target as HTMLInputElement;
		const formatted = formatCuit(target.value);
		cuit = formatted;
	}
</script>

<div class="container">
	<header>
		<h1>✏️ Editar Archivo Pendiente</h1>
		<p class="subtitle">{pendingFile.originalFilename}</p>
	</header>

	{#if error}
		<div class="alert alert-error">
			❌ {error}
		</div>
	{/if}

	{#if success}
		<div class="alert alert-success">
			✅ {success}
		</div>
	{/if}

	<div class="form-container">
		<form onsubmit={(e) => e.preventDefault()}>
			<div class="form-section">
				<h2>Datos del Emisor</h2>

				<div class="form-group">
					<label for="cuit">
						CUIT <span class="required">*</span>
					</label>
					<input
						id="cuit"
						type="text"
						bind:value={cuit}
						oninput={handleCuitInput}
						placeholder="20-12345678-9"
						maxlength="13"
						required
					/>
					<small class="hint">Formato: XX-XXXXXXXX-X</small>
				</div>
			</div>

			<div class="form-section">
				<h2>Datos del Comprobante</h2>

				<div class="form-row">
					<div class="form-group">
						<label for="tipo">
							Tipo <span class="required">*</span>
						</label>
						<select id="tipo" bind:value={tipo} required>
							<option value="">Seleccionar...</option>
							<option value="A">A</option>
							<option value="B">B</option>
							<option value="C">C</option>
							<option value="E">E</option>
							<option value="M">M</option>
							<option value="X">X</option>
						</select>
					</div>

					<div class="form-group">
						<label for="puntoVenta">
							Punto de Venta <span class="required">*</span>
						</label>
						<input
							id="puntoVenta"
							type="number"
							bind:value={puntoVenta}
							placeholder="1"
							min="1"
							max="99999"
							required
						/>
					</div>

					<div class="form-group">
						<label for="numeroComprobante">
							Número <span class="required">*</span>
						</label>
						<input
							id="numeroComprobante"
							type="number"
							bind:value={numeroComprobante}
							placeholder="12345678"
							min="1"
							max="99999999"
							required
						/>
					</div>
				</div>

				<div class="form-row">
					<div class="form-group">
						<label for="fecha">
							Fecha de Emisión <span class="required">*</span>
						</label>
						<input id="fecha" type="date" bind:value={fecha} required />
					</div>

					<div class="form-group">
						<label for="total">Total</label>
						<input
							id="total"
							type="number"
							bind:value={total}
							placeholder="1000.50"
							step="0.01"
							min="0"
						/>
					</div>
				</div>
			</div>

			<div class="form-actions">
				<button type="button" class="btn btn-secondary" onclick={handleCancel}>
					❌ Cancelar
				</button>
				<button
					type="button"
					class="btn btn-primary"
					onclick={handleSave}
					disabled={saving || processing}
				>
					{#if saving}
						⏳ Guardando...
					{:else}
						💾 Guardar
					{/if}
				</button>
				<button
					type="button"
					class="btn btn-success"
					onclick={handleSaveAndProcess}
					disabled={saving || processing || !cuit || !tipo || !puntoVenta || !numeroComprobante || !fecha}
				>
					{#if processing}
						⏳ Procesando...
					{:else}
						✅ Guardar y Procesar
					{/if}
				</button>
			</div>
		</form>
	</div>

	<div class="info-box">
		<h3>ℹ️ Información</h3>
		<ul>
			<li>Los campos marcados con <span class="required">*</span> son obligatorios para procesar</li>
			<li>Podés guardar los cambios sin procesar y hacerlo más tarde</li>
			<li>El botón "Guardar y Procesar" validará los datos y creará la factura</li>
		</ul>
	</div>
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
		max-width: 900px;
		margin: 0 auto;
		padding: 2rem;
	}

	header {
		text-align: center;
		margin-bottom: 2rem;
	}

	h1 {
		font-size: 2rem;
		margin: 0 0 0.5rem 0;
		color: #2563eb;
	}

	.subtitle {
		color: #666;
		font-size: 1rem;
		font-family: monospace;
	}

	.alert {
		padding: 1rem;
		border-radius: 8px;
		margin-bottom: 1.5rem;
	}

	.alert-error {
		background: #fef2f2;
		color: #dc2626;
		border: 1px solid #fecaca;
	}

	.alert-success {
		background: #f0fdf4;
		color: #16a34a;
		border: 1px solid #bbf7d0;
	}

	.form-container {
		background: white;
		border-radius: 12px;
		padding: 2rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		margin-bottom: 1.5rem;
	}

	.form-section {
		margin-bottom: 2rem;
	}

	.form-section h2 {
		font-size: 1.3rem;
		color: #374151;
		margin: 0 0 1rem 0;
		padding-bottom: 0.5rem;
		border-bottom: 2px solid #e5e7eb;
	}

	.form-row {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1rem;
		margin-bottom: 1rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	label {
		font-weight: 500;
		color: #374151;
		font-size: 0.95rem;
	}

	.required {
		color: #dc2626;
	}

	input,
	select {
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 1rem;
		transition: all 0.2s;
	}

	input:focus,
	select:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	input:disabled,
	select:disabled {
		background: #f3f4f6;
		cursor: not-allowed;
	}

	.hint {
		color: #6b7280;
		font-size: 0.85rem;
		margin-top: -0.25rem;
	}

	.form-actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
		padding-top: 1.5rem;
		border-top: 1px solid #e5e7eb;
		margin-top: 2rem;
	}

	.btn {
		padding: 0.75rem 1.5rem;
		border: none;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
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

	.btn-success {
		background: #16a34a;
		color: white;
	}

	.btn-success:hover:not(:disabled) {
		background: #15803d;
	}

	.info-box {
		background: #eff6ff;
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.info-box h3 {
		margin: 0 0 1rem 0;
		color: #1e40af;
		font-size: 1.1rem;
	}

	.info-box ul {
		margin: 0;
		padding-left: 1.5rem;
	}

	.info-box li {
		margin-bottom: 0.5rem;
		color: #1e40af;
	}
</style>
