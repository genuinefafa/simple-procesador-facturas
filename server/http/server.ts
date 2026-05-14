/**
 * Hono server entry point.
 *
 * Runs under Node (via @hono/node-server) for now; will switch to
 * Bun.serve() once the runtime swap lands. Reads HONO_PORT from env
 * with a 3001 default so it can run side-by-side with SvelteKit
 * (Kit dev on 5174, Kit prod on 3000).
 */

import { serve } from '@hono/node-server';
import { app } from './app.js';

const port = Number(process.env.HONO_PORT ?? 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.info(`🔥 Hono server escuchando en http://localhost:${info.port}`);
  console.info(`   Health check: http://localhost:${info.port}/api/_hono/health`);
});
