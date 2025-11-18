<script lang="ts">
	import { onMount } from 'svelte';

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

	let invoices: PendingInvoice[] = $state([]);
	let loading = $state(true);
	let error = $state<string | null>(null);

	onMount(async () => {
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
	});

	function getConfidenceColor(confidence: number | null): string {
		if (!confidence) return 'text-gray-400';
		if (confidence >= 90) return 'text-green-600';
		if (confidence >= 70) return 'text-yellow-600';
		return 'text-red-600';
	}
</script>

<div class="container">
	<header>
		<h1>🧾 Procesador de Facturas</h1>
		<p class="subtitle">Sistema de anotación y entrenamiento</p>
	</header>

	<main>
		<div class="stats-bar">
			<div class="stat">
				<span class="stat-value">{invoices.length}</span>
				<span class="stat-label">Facturas pendientes</span>
			</div>
			<div class="stat">
				<span class="stat-value">
					{invoices.filter((inv) => (inv.extractionConfidence || 0) < 70).length}
				</span>
				<span class="stat-label">Baja confianza</span>
			</div>
		</div>

		{#if loading}
			<div class="loading">
				<p>⏳ Cargando facturas...</p>
			</div>
		{:else if error}
			<div class="error">
				<p>❌ {error}</p>
			</div>
		{:else if invoices.length === 0}
			<div class="empty">
				<p>✅ No hay facturas pendientes de revisión</p>
			</div>
		{:else}
			<div class="invoice-list">
				{#each invoices as invoice (invoice.id)}
					<div class="invoice-card">
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
									{invoice.total !== null ? `$${invoice.total.toLocaleString('es-AR')}` : '❌ No detectado'}
								</span>
							</div>
							<div class="detail">
								<span class="label">Archivo:</span>
								<span class="value file">{invoice.originalFile.split('/').pop()}</span>
							</div>
						</div>

						<div class="actions">
							<a href="/annotate/{invoice.id}" class="btn btn-primary"> 📝 Anotar </a>
							<button class="btn btn-secondary">✓ Aprobar</button>
						</div>
					</div>
				{/each}
			</div>
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
		margin-bottom: 3rem;
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

	.stats-bar {
		display: flex;
		gap: 2rem;
		justify-content: center;
		margin-bottom: 2rem;
	}

	.stat {
		background: white;
		padding: 1.5rem 2rem;
		border-radius: 12px;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		text-align: center;
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

	.loading,
	.error,
	.empty {
		text-align: center;
		padding: 3rem;
		font-size: 1.2rem;
	}

	.error {
		color: #dc2626;
	}

	.invoice-list {
		display: grid;
		gap: 1.5rem;
	}

	.invoice-card {
		background: white;
		border-radius: 12px;
		padding: 1.5rem;
		box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
		transition: transform 0.2s, box-shadow 0.2s;
	}

	.invoice-card:hover {
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
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

	.btn-primary {
		background: #2563eb;
		color: white;
	}

	.btn-primary:hover {
		background: #1d4ed8;
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-secondary:hover {
		background: #e5e7eb;
	}
</style>
