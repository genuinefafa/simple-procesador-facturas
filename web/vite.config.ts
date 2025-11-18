import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
	plugins: [sveltekit()],
	resolve: {
		alias: {
			'@root': path.resolve(__dirname, '../src')
		}
	},
	server: {
		port: parseInt(process.env.VITE_PORT || '5173'),
		host: process.env.VITE_HOST || 'localhost',
		strictPort: false, // Si el puerto está ocupado, intenta el siguiente disponible
	},
	preview: {
		port: parseInt(process.env.VITE_PREVIEW_PORT || '4173'),
		host: process.env.VITE_HOST || 'localhost',
	}
});
