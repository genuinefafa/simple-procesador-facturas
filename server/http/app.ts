/**
 * Hono app for the Bun + Hono migration.
 *
 * Serves the SvelteKit SPA bundle (`client/build/`) as static assets
 * with an index.html fallback for client-side routing. API routes are
 * registered before the static middleware so they take precedence.
 *
 * See docs/MIGRATION_BUN_HONO.md for the full migration plan.
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { readFileSync } from 'fs';
import { join } from 'path';

import { invoicesRouter } from './routes/invoices.js';
import { filesRouter } from './routes/files.js';
import { categoriesRouter } from './routes/categories.js';
import { comprobantesRouter } from './routes/comprobantes.js';
import { emisoresRouter } from './routes/emisores.js';
import { expectedInvoicesRouter } from './routes/expected-invoices.js';
import { invoicesKnownRouter } from './routes/invoices-known.js';

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
app.route('/api/categories', categoriesRouter);
app.route('/api/comprobantes', comprobantesRouter);
app.route('/api/emisores', emisoresRouter);
app.route('/api/expected-invoices', expectedInvoicesRouter);
app.route('/api/invoices-known', invoicesKnownRouter);

const BUILD_DIR = join(import.meta.dirname, '..', '..', 'client', 'build');

app.use('*', serveStatic({ root: BUILD_DIR }));

// SPA fallback: any non-/api/* path that didn't match a static file
// returns index.html so the SvelteKit client router can take over.
// Read lazily so the server can boot before `client/build/` exists
// (useful in dev where the client is served by Vite on another port).
let _indexHtml: string | null = null;
function getIndexHtml(): string {
  if (_indexHtml === null) {
    _indexHtml = readFileSync(join(BUILD_DIR, 'index.html'), 'utf-8');
  }
  return _indexHtml;
}

app.notFound((c) => {
  if (c.req.path.startsWith('/api/')) {
    return c.json({ error: 'Not Found' }, 404);
  }
  return c.html(getIndexHtml());
});

export type App = typeof app;
