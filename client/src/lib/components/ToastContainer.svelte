<script lang="ts">
	import { toast, type Toast } from '../toast.svelte';

	let toasts = $derived(toast.list);

	function getIcon(type: Toast['type']) {
		switch (type) {
			case 'success':
				return '✅';
			case 'error':
				return '❌';
			case 'warning':
				return '⚠️';
			case 'info':
				return 'ℹ️';
		}
	}

	function getColorClass(type: Toast['type']) {
		switch (type) {
			case 'success':
				return 'toast-success';
			case 'error':
				return 'toast-error';
			case 'warning':
				return 'toast-warning';
			case 'info':
				return 'toast-info';
		}
	}
</script>

<div class="toast-container">
	{#each toasts as t (t.id)}
		<div class="toast {getColorClass(t.type)}" role="alert">
			<span class="toast-icon">{getIcon(t.type)}</span>
			<span class="toast-message">{t.message}</span>
			<button class="toast-close" onclick={() => toast.remove(t.id)} aria-label="Cerrar">
				✕
			</button>
		</div>
	{/each}
</div>

<style>
	.toast-container {
		position: fixed;
		top: 1rem;
		right: 1rem;
		z-index: 9999;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		pointer-events: none;
	}

	.toast {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 1rem 1.25rem;
		border-radius: 8px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		min-width: 300px;
		max-width: 500px;
		pointer-events: auto;
		animation: slideIn 0.3s ease-out;
		font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
	}

	@keyframes slideIn {
		from {
			transform: translateX(100%);
			opacity: 0;
		}
		to {
			transform: translateX(0);
			opacity: 1;
		}
	}

	.toast-icon {
		font-size: 1.25rem;
		flex-shrink: 0;
	}

	.toast-message {
		flex: 1;
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.toast-close {
		background: none;
		border: none;
		font-size: 1.25rem;
		cursor: pointer;
		padding: 0;
		width: 1.5rem;
		height: 1.5rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		flex-shrink: 0;
		transition: background-color 0.2s;
	}

	.toast-close:hover {
		background-color: rgba(0, 0, 0, 0.1);
	}

	.toast-success {
		background: #f0fdf4;
		color: #166534;
		border: 1px solid #bbf7d0;
	}

	.toast-error {
		background: #fef2f2;
		color: #991b1b;
		border: 1px solid #fecaca;
	}

	.toast-warning {
		background: #fffbeb;
		color: #92400e;
		border: 1px solid #fde68a;
	}

	.toast-info {
		background: #eff6ff;
		color: #1e40af;
		border: 1px solid #bfdbfe;
	}
</style>
