import type { PageServerLoad } from './$types';
import { error } from '@sveltejs/kit';
import { PendingFileRepository } from '@server/database/repositories/pending-file.js';

export const load: PageServerLoad = async ({ params }) => {
  const { id } = params;

  try {
    const pendingFileId = parseInt(id, 10);
    if (isNaN(pendingFileId)) {
      throw error(400, 'ID inválido');
    }

    const pendingFileRepo = new PendingFileRepository();
    const pendingFile = pendingFileRepo.findById(pendingFileId);

    if (!pendingFile) {
      throw error(404, 'Archivo no encontrado');
    }

    return {
      pendingFile,
    };
  } catch (err) {
    console.error('Error cargando pending file:', err);
    if (err && typeof err === 'object' && 'status' in err) {
      throw err; // Re-throw SvelteKit errors
    }
    throw error(500, 'Error al cargar el archivo');
  }
};
