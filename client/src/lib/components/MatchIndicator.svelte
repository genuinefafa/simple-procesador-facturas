<script lang="ts">
  /**
   * Indicador de coincidencia entre dos valores.
   *
   * Muestra Check (verde) para match exacto, AlertTriangle (amarillo) para similar,
   * X (rojo) para diferente, y Minus para datos faltantes.
   */

  import { Check, AlertTriangle, X, Minus, type Icon } from 'lucide-svelte';
  import type { ComponentType } from 'svelte';

  type Props = {
    /** Valor del archivo/OCR */
    left: string | number | null | undefined;
    /** Valor esperado */
    right: string | number | null | undefined;
    /** Tipo de comparación para fuzzy matching */
    type?: 'exact' | 'cuit' | 'date' | 'amount' | 'text';
  };

  let { left, right, type = 'exact' }: Props = $props();

  type MatchLevel = 'exact' | 'similar' | 'different' | 'missing';

  function compareValues(
    a: string | number | null | undefined,
    b: string | number | null | undefined,
    compareType: string
  ): MatchLevel {
    // Si ambos son null/undefined, no hay datos para comparar
    if ((a === null || a === undefined) && (b === null || b === undefined)) {
      return 'missing';
    }

    // Si solo uno está ausente, es diferente
    if (a === null || a === undefined || b === null || b === undefined) {
      return 'different';
    }

    const strA = String(a).trim();
    const strB = String(b).trim();

    // Match exacto
    if (strA === strB) {
      return 'exact';
    }

    // Fuzzy matching según tipo
    switch (compareType) {
      case 'cuit': {
        // Normalizar CUIT: quitar guiones y espacios
        const normA = strA.replace(/[-\s]/g, '');
        const normB = strB.replace(/[-\s]/g, '');
        if (normA === normB) return 'exact';
        // Verificar si es parcial (solo los números sin dígito verificador)
        if (normA.slice(0, -1) === normB.slice(0, -1)) return 'similar';
        return 'different';
      }

      case 'date': {
        // Normalizar fechas: convertir a YYYY-MM-DD
        const parseDate = (s: string) => {
          // Intentar diferentes formatos
          const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
          if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

          const dmy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
          if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;

          const mdy = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
          if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;

          return s;
        };

        const dateA = parseDate(strA);
        const dateB = parseDate(strB);

        if (dateA === dateB) return 'exact';

        // Similar si difiere en un día (errores comunes de OCR)
        try {
          const dA = new Date(dateA);
          const dB = new Date(dateB);
          const diffDays = Math.abs(dA.getTime() - dB.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays <= 1) return 'similar';
        } catch {
          // ignore parse errors
        }

        return 'different';
      }

      case 'amount': {
        // Normalizar montos: quitar símbolos y comparar números
        const parseAmount = (s: string) => {
          // Quitar símbolos de moneda, puntos de miles, reemplazar coma por punto
          const clean = s
            .replace(/[$\s]/g, '')
            .replace(/\.(?=\d{3})/g, '')
            .replace(',', '.');
          return parseFloat(clean);
        };

        const numA = typeof a === 'number' ? a : parseAmount(strA);
        const numB = typeof b === 'number' ? b : parseAmount(strB);

        if (isNaN(numA) || isNaN(numB)) return 'different';
        if (numA === numB) return 'exact';

        // Similar si difiere menos del 1%
        const diff = Math.abs(numA - numB);
        const avg = (Math.abs(numA) + Math.abs(numB)) / 2;
        if (avg > 0 && diff / avg < 0.01) return 'similar';

        return 'different';
      }

      case 'text': {
        // Comparación de texto flexible (ignore case, espacios múltiples)
        const normA = strA.toLowerCase().replace(/\s+/g, ' ');
        const normB = strB.toLowerCase().replace(/\s+/g, ' ');
        if (normA === normB) return 'exact';
        if (normA.includes(normB) || normB.includes(normA)) return 'similar';
        return 'different';
      }

      default:
        return 'different';
    }
  }

  const matchLevel = $derived(compareValues(left, right, type));

  const IconComponent = $derived.by((): ComponentType<Icon> => {
    switch (matchLevel) {
      case 'exact':
        return Check;
      case 'similar':
        return AlertTriangle;
      case 'different':
        return X;
      case 'missing':
        return Minus;
    }
  });

  const title = $derived.by(() => {
    switch (matchLevel) {
      case 'exact':
        return 'Coincidencia exacta';
      case 'similar':
        return 'Valores similares';
      case 'different':
        return 'Valores diferentes';
      case 'missing':
        return 'Datos faltantes';
    }
  });
</script>

<span class="match-indicator {matchLevel}" {title}>
  <IconComponent size={14} strokeWidth={2.5} />
</span>

<style>
  .match-indicator {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5rem;
    height: 1.5rem;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-semibold);
    border-radius: var(--radius-full);
  }

  .match-indicator.exact {
    background: var(--color-success-100, #dcfce7);
    color: var(--color-success-700, #15803d);
  }

  .match-indicator.similar {
    background: var(--color-warning-100, #fef3c7);
    color: var(--color-warning-700, #b45309);
  }

  .match-indicator.different {
    background: var(--color-error-100, #fee2e2);
    color: var(--color-error-700, #b91c1c);
  }

  .match-indicator.missing {
    background: var(--color-neutral-100);
    color: var(--color-text-tertiary);
  }
</style>
