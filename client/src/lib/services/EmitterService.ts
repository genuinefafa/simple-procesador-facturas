/**
 * Servicio para resolución de emisores por CUIT.
 *
 * Principios SOLID aplicados:
 * - SRP: Solo responsable de resolver emisores
 * - OCP: Extensible via la interfaz ResolvedEmitter
 * - DIP: Los componentes dependen de este servicio, no de fetch directo
 *
 * Características:
 * - Cache en memoria para evitar requests repetidos
 * - No muestra toasts (el llamador decide cómo manejar errores)
 * - Retorna información estructurada del emisor
 */

export interface ResolvedEmitter {
  cuit: string;
  displayName: string;
  name: string;
  exists: boolean;
}

export interface EmitterServiceOptions {
  /** Función fetch personalizada (útil para testing) */
  fetchFn?: typeof fetch;
}

class EmitterServiceImpl {
  private cache = new Map<string, ResolvedEmitter>();
  private pendingRequests = new Map<string, Promise<ResolvedEmitter>>();
  private fetchFn: typeof fetch;

  constructor(options: EmitterServiceOptions = {}) {
    this.fetchFn = options.fetchFn ?? fetch;
  }

  /**
   * Normaliza un CUIT removiendo caracteres no numéricos
   */
  private normalizeCuit(cuit: string): string {
    return cuit.replace(/\D/g, '');
  }

  /**
   * Resuelve un emisor por CUIT.
   * Retorna info del emisor si existe, o un objeto con exists=false si no.
   */
  async resolve(cuit: string): Promise<ResolvedEmitter> {
    if (!cuit) {
      return {
        cuit: '',
        displayName: '?',
        name: '?',
        exists: false,
      };
    }

    const normalizedCuit = this.normalizeCuit(cuit);

    // Check cache first
    const cached = this.cache.get(normalizedCuit);
    if (cached) {
      return cached;
    }

    // Check if there's already a pending request for this CUIT
    const pending = this.pendingRequests.get(normalizedCuit);
    if (pending) {
      return pending;
    }

    // Make the request
    const requestPromise = this.fetchEmitter(cuit, normalizedCuit);
    this.pendingRequests.set(normalizedCuit, requestPromise);

    try {
      const result = await requestPromise;
      this.cache.set(normalizedCuit, result);
      return result;
    } finally {
      this.pendingRequests.delete(normalizedCuit);
    }
  }

  private async fetchEmitter(cuit: string, normalizedCuit: string): Promise<ResolvedEmitter> {
    try {
      const res = await this.fetchFn(`/api/emisores?cuit=${encodeURIComponent(cuit)}`);
      const json = await res.json();
      const emitters = json.emitters || [];

      if (emitters.length === 0) {
        return {
          cuit: cuit,
          displayName: `? (${cuit})`,
          name: `? (${cuit})`,
          exists: false,
        };
      }

      const emitter = emitters[0];
      return {
        cuit: emitter.cuit || cuit,
        displayName: emitter.displayName || emitter.name || cuit,
        name: emitter.name || cuit,
        exists: true,
      };
    } catch {
      return {
        cuit: cuit,
        displayName: `? (${cuit})`,
        name: `? (${cuit})`,
        exists: false,
      };
    }
  }

  /**
   * Resuelve múltiples CUITs en paralelo.
   * Útil para precargar emisores de una lista.
   */
  async resolveMany(cuits: string[]): Promise<Map<string, ResolvedEmitter>> {
    const uniqueCuits = [...new Set(cuits.filter(Boolean))];
    const results = await Promise.all(uniqueCuits.map((cuit) => this.resolve(cuit)));

    const map = new Map<string, ResolvedEmitter>();
    uniqueCuits.forEach((cuit, i) => {
      map.set(this.normalizeCuit(cuit), results[i]);
    });

    return map;
  }

  /**
   * Limpia el cache (útil para testing o refresh manual)
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Formatea el display de un emisor según las reglas:
   * - Si existe: displayName
   * - Si no existe pero hay nombre extraído: nombre (?)
   * - Si no existe y no hay nombre: ? (cuit)
   */
  formatDisplay(resolved: ResolvedEmitter, extractedName?: string | null): string {
    if (resolved.exists) {
      return resolved.displayName;
    }

    if (extractedName) {
      return `${extractedName} (?)`;
    }

    return resolved.displayName; // Ya tiene formato "? (cuit)"
  }
}

// Singleton instance para uso en toda la app
export const emitterService = new EmitterServiceImpl();

// Export class for testing
export { EmitterServiceImpl };
