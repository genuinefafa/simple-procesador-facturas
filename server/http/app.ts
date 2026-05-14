/**
 * Hono app for the Bun + Hono migration.
 *
 * Lives in parallel to the SvelteKit API routes during the migration.
 * Routes from client/src/routes/api/ get ported here incrementally,
 * one resource at a time, until Kit can be dropped.
 *
 * See docs/MIGRATION_BUN_HONO.md for the full migration plan.
 */

import { Hono } from 'hono';

import { invoicesRouter } from './routes/invoices.js';
import { filesRouter } from './routes/files.js';

export const app = new Hono();

app.get('/api/_hono/health', (c) =>
  c.json({
    status: 'ok',
    backend: 'hono',
    version: '0.0.0',
  })
);

app.route('/api/invoices', invoicesRouter);
app.route('/api/files', filesRouter);

export type App = typeof app;
