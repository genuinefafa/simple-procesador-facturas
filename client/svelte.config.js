import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// SPA mode: client-side rendering only. Hono serves the static
		// bundle and proxies /api/* to in-process Hono routes.
		// strict: false lets the build succeed while +server.ts files
		// still live under client/src/routes/api/ — they become dead
		// code in the static output and are removed in a later commit.
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		alias: {
			'@server': path.resolve(__dirname, '../server'),
			'@shared': path.resolve(__dirname, '../shared/src')
		}
	}
};

export default config;
