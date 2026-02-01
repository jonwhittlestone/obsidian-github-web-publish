import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		globals: true,
		environment: 'node',
		include: ['tests/**/*.test.ts'],
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			include: ['src/**/*.ts'],
			exclude: ['src/main.ts'], // Exclude Obsidian entry point from coverage
		},
		alias: {
			// Mock Obsidian module for tests
			obsidian: new URL('./tests/mocks/obsidian.ts', import.meta.url).pathname,
		},
	},
});
