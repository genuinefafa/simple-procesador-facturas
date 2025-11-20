import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const response = await fetch(`/api/pending-files/${params.id}`);
	const data = await response.json();

	if (!data.success) {
		throw new Error(data.error || 'No se pudo cargar el archivo pendiente');
	}

	return {
		pendingFile: data.data
	};
};
