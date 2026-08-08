import { defineConfig } from 'vitest/config';

// Deliberately does not load the SvelteKit vite plugin: the unit tests cover
// pure TypeScript (the product-page extraction parser), and the plugin needs a
// synced .svelte-kit dir plus $app/* aliases that tests never touch.
export default defineConfig({
	test: {
		include: ['src/**/*.test.ts'],
		environment: 'node',
	},
});
