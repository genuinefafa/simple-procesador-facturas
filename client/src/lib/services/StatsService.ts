/**
 * Client service for dashboard stats (gold layer, #189).
 * Wraps GET /api/stats/summary and GET /api/categories.
 */

import type { ApiResult } from './ComprobanteService';
import type { CategoryRef, PeriodKey, StatsSummaryResponse } from './StatsService.types';

export type * from './StatsService.types';

class StatsService {
  async getSummary(period: PeriodKey): Promise<ApiResult<StatsSummaryResponse>> {
    try {
      const response = await fetch(`/api/stats/summary?period=${encodeURIComponent(period)}`);
      if (response.ok) {
        return { success: true, data: (await response.json()) as StatsSummaryResponse };
      }
      return { success: false, error: 'No se pudieron cargar los totales del período.' };
    } catch (err) {
      console.error('Error fetching stats summary:', err);
      return { success: false, error: 'No se pudieron cargar los totales del período.' };
    }
  }

  /** Active categories, used to give each category a stable chart color */
  async getCategories(): Promise<ApiResult<CategoryRef[]>> {
    try {
      const response = await fetch('/api/categories');
      if (response.ok) {
        const data = await response.json();
        return { success: true, data: (data.items ?? []) as CategoryRef[] };
      }
      return { success: false, error: 'No se pudieron cargar las categorías.' };
    } catch (err) {
      console.error('Error fetching categories:', err);
      return { success: false, error: 'No se pudieron cargar las categorías.' };
    }
  }
}

export const statsService = new StatsService();
