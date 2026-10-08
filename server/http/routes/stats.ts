/**
 * Hono router for /api/stats (dashboard, gold layer #189).
 */

import { Hono } from 'hono';

import { StatsQuerySchema, formatZodError, periodToRange } from '../../contracts';
import { StatsRepository } from '../../database/repositories/stats';

export const statsRouter = new Hono();

/**
 * GET /api/stats/summary?period=2026|2026-Q3|2026-09
 *
 * Totals by category, month × category and letter, plus pending expected
 * invoices as a separate indicator (never part of the totals).
 */
statsRouter.get('/summary', (c) => {
  const parsed = StatsQuerySchema.safeParse({ period: c.req.query('period') });
  if (!parsed.success) {
    return c.json(formatZodError(parsed.error), 400);
  }

  const range = periodToRange(parsed.data.period);
  const summary = new StatsRepository().getSummary(range);

  return c.json({ period: { key: parsed.data.period, ...range }, ...summary });
});
