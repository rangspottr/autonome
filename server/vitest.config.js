import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Exclude the Node-native smoke test (uses node:test, not vitest)
    exclude: ['**/tests/**', '**/node_modules/**'],
  },
});
