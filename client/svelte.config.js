import adapter from '@sveltejs/adapter-node';
import { preprocessMeltUI, sequence } from '@melt-ui/pp';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('@sveltejs/kit').Config} */
const config = {
	// Consult https://svelte.dev/docs/kit/integrations
	// for more information about preprocessors
	preprocess: sequence([preprocessMeltUI(), vitePreprocess()]),

	kit: {
		// adapter-auto only supports some environments, see https://svelte.dev/docs/kit/adapter-auto for a list.
		// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
		// See https://svelte.dev/docs/kit/adapters for more information about adapters.
		adapter: adapter({
			out: 'build',
			precompress: false,
			envPrefix: ''
		}),
		alias: {
			'@server': path.resolve(__dirname, '../server')
		}
	}
};

export default config;
