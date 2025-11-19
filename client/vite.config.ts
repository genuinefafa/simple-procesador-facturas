import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, loadEnv } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
	// Cargar variables de entorno desde .env
	const env = loadEnv(mode, process.cwd(), '');

	return {
		plugins: [
			sveltekit(),
			{
				name: 'log-server-start',
				configureServer(server) {
					server.httpServer?.once('listening', () => {
						const address = server.httpServer?.address();
						const port = typeof address === 'object' && address ? address.port : env.VITE_PORT || 5173;
						console.log('\n┌─────────────────────────────────────────┐');
						console.log('│  🎨 FRONTEND (SvelteKit)                │');
						console.log(`│  http://localhost:${port}                   │`);
						console.log('└─────────────────────────────────────────┘\n');
					});
				}
			}
		],
		resolve: {
			alias: {
				'@server': path.resolve(__dirname, '../server')
			}
		},
		server: {
			port: parseInt(env.VITE_PORT || '5173'),
			host: env.VITE_HOST || 'localhost',
			strictPort: false,
		},
		preview: {
			port: parseInt(env.VITE_PREVIEW_PORT || '4173'),
			host: env.VITE_HOST || 'localhost',
		},
		build: {
			rollupOptions: {
				external: ['better-sqlite3', 'drizzle-orm', 'pdf-parse', 'sharp', 'exceljs']
			}
		},
		ssr: {
			external: ['better-sqlite3', 'drizzle-orm', 'pdf-parse', 'sharp', 'exceljs']
		}
	};
});
