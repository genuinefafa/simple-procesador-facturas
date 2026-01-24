/**
 * Store reactivo para resolución de emisores.
 * Verifica existencia del emisor por CUIT y resuelve su displayName.
 */

import { toast } from 'svelte-sonner';

export function createEmitterResolver() {
  /**
   * Verifica que el emisor existe y retorna su displayName.
   * Muestra error si no existe.
   */
  async function resolve(cuit: string): Promise<string | null> {
    if (!cuit) {
      toast.error('El expected no tiene CUIT asociado.');
      return null;
    }

    try {
      const res = await fetch(`/api/emisores?cuit=${encodeURIComponent(cuit)}`);
      const json = await res.json();
      const emitters = json.emitters || [];

      if (emitters.length === 0) {
        toast.error(`Emisor con CUIT ${cuit} no existe. Crealo primero en la sección de emisores.`);
        return null;
      }

      return emitters[0].displayName || emitters[0].name || null;
    } catch {
      toast.error('Error verificando emisor.');
      return null;
    }
  }

  return { resolve };
}
