/**
 * Store para contexto de navegación entre comprobantes.
 *
 * Mantiene la lista de IDs del listado actual para permitir
 * navegación anterior/siguiente sin volver al listado.
 */

import { writable, derived, get } from 'svelte/store';
import { browser } from '$app/environment';

const STORAGE_KEY = 'comprobantes-nav-context';

type NavigationContext = {
  /** Lista ordenada de IDs de comprobantes */
  ids: string[];
  /** Timestamp de cuando se guardó (para invalidar contextos viejos) */
  timestamp: number;
  /** Filtro activo cuando se guardó el contexto */
  filter?: string;
};

function createNavigationStore() {
  // Intentar restaurar desde sessionStorage (solo dura la sesión del tab)
  let initial: NavigationContext = { ids: [], timestamp: 0 };
  if (browser) {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Invalidar si tiene más de 30 minutos
        if (Date.now() - parsed.timestamp < 30 * 60 * 1000) {
          initial = parsed;
        }
      }
    } catch {
      // ignore
    }
  }

  const { subscribe, set, update } = writable<NavigationContext>(initial);

  return {
    subscribe,

    /**
     * Establece el contexto de navegación desde el listado.
     * Llamar cuando el usuario navega desde /comprobantes al detalle.
     */
    setContext(ids: string[], filter?: string) {
      const ctx: NavigationContext = {
        ids,
        timestamp: Date.now(),
        filter,
      };
      set(ctx);
      if (browser) {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ctx));
      }
    },

    /**
     * Limpia el contexto de navegación.
     */
    clear() {
      set({ ids: [], timestamp: 0 });
      if (browser) {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    },

    /**
     * Obtiene el ID anterior al actual en la lista.
     */
    getPrevious(currentId: string): string | null {
      const ctx = get({ subscribe });
      const index = ctx.ids.indexOf(currentId);
      if (index > 0) {
        return ctx.ids[index - 1];
      }
      return null;
    },

    /**
     * Obtiene el ID siguiente al actual en la lista.
     */
    getNext(currentId: string): string | null {
      const ctx = get({ subscribe });
      const index = ctx.ids.indexOf(currentId);
      if (index >= 0 && index < ctx.ids.length - 1) {
        return ctx.ids[index + 1];
      }
      return null;
    },

    /**
     * Obtiene la posición actual en la lista (1-indexed para mostrar).
     */
    getPosition(currentId: string): { current: number; total: number } | null {
      const ctx = get({ subscribe });
      const index = ctx.ids.indexOf(currentId);
      if (index >= 0) {
        return { current: index + 1, total: ctx.ids.length };
      }
      return null;
    },
  };
}

export const navigationStore = createNavigationStore();

/**
 * Derived store que provee helpers de navegación para un ID específico.
 * Usar en componentes: const nav = useNavigation(currentId)
 */
export function useNavigation(currentId: string) {
  return derived(navigationStore, ($ctx) => {
    const index = $ctx.ids.indexOf(currentId);
    const hasContext = index >= 0;

    return {
      hasContext,
      previous: hasContext && index > 0 ? $ctx.ids[index - 1] : null,
      next: hasContext && index < $ctx.ids.length - 1 ? $ctx.ids[index + 1] : null,
      position: hasContext ? { current: index + 1, total: $ctx.ids.length } : null,
      filter: $ctx.filter,
    };
  });
}
