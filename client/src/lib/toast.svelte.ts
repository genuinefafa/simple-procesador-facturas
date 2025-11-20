/**
 * Sistema simple de Toast Notifications
 * Sin dependencias externas, usando Svelte 5 runes
 */

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
	id: number;
	type: ToastType;
	message: string;
	duration: number;
}

class ToastStore {
	private toasts = $state<Toast[]>([]);
	private nextId = 0;

	get list() {
		return this.toasts;
	}

	private add(type: ToastType, message: string, duration = 4000) {
		const id = this.nextId++;
		const toast: Toast = { id, type, message, duration };

		this.toasts = [...this.toasts, toast];

		// Auto-remover después del duration
		setTimeout(() => {
			this.remove(id);
		}, duration);

		return id;
	}

	remove(id: number) {
		this.toasts = this.toasts.filter((t) => t.id !== id);
	}

	success(message: string, duration?: number) {
		return this.add('success', message, duration);
	}

	error(message: string, duration?: number) {
		return this.add('error', message, duration || 6000); // Errores duran más
	}

	warning(message: string, duration?: number) {
		return this.add('warning', message, duration);
	}

	info(message: string, duration?: number) {
		return this.add('info', message, duration);
	}

	clear() {
		this.toasts = [];
	}
}

export const toast = new ToastStore();
