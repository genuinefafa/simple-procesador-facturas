import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [
		sveltekit(),
		{
			name: 'log-server-start',
			configureServer(server) {
				server.httpServer?.once('listening', () => {
					console.log('\n┌─────────────────────────────────────────┐');
					console.log('│  🎨 FRONTEND (SvelteKit)                │');
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
		port: parseInt(process.env.VITE_PORT || '5173'),
		host: process.env.VITE_HOST || 'localhost',
		strictPort: false,
	},
	preview: {
		port: parseInt(process.env.VITE_PREVIEW_PORT || '4173'),
		host: process.env.VITE_HOST || 'localhost',
	}
});
