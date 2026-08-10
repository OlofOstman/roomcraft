import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit vite plugin: the unit tests cover
// pure TypeScript (the product-page extraction parser, the viewpoint geometry),
// and the plugin needs a synced .svelte-kit dir plus $app/* aliases that tests
// never touch. $lib is aliased by hand — modules under test import each other
// through it, and that costs one line rather than the whole plugin.
export default defineConfig({
	resolve: {
		alias: {
			$lib: fileURLToPath(new URL('./src/lib', import.meta.url)),
		},
	},
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
