/**
 * Hono server entry point.
 *
 * Runs under Bun via @hono/node-server compat layer. Reads PORT from env
 * with a 3000 default. Sirve API + SPA estático (client/build).
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`🔥 Hono server escuchando en http://localhost:${info.port}`);
  console.info(`   Health check: http://localhost:${info.port}/api/_hono/health`);
});
