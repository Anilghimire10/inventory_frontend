import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

// Unit tests for the pure helpers in src/lib — no DOM, no network, no servers.
// Screens are still verified by driving the real app; this covers the logic
// that has actually caused bugs (decimal coercion, serial validation, CSV).
export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json; kept manual to avoid another dep.
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
