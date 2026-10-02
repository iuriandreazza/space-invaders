import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const API_PORT = Number(process.env.PORT ?? 8787);

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: { '/api': `http://localhost:${API_PORT}` },
  },
  test: {
    // The suite replays whole games next to the screens' tests, and a busy machine can make a test of the screens
    // take longer than the default of 5 seconds.
    testTimeout: 20_000,
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
});
