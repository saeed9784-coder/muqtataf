import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['packages/{db,api,ingest}/src/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      include: ['packages/{db,api,ingest}/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/dev-server.ts', '**/handler.ts', '**/test-utils.ts'],
    },
  },
});
