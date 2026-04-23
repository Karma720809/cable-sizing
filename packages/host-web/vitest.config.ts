/**
 * Vitest config for host-web (App-MVP-1).
 *
 * Most tests are pure (worker-contract smoke, assembler round-trip) and
 * run fine under the default Node environment. The component tests live
 * in files ending in `.dom.test.tsx` and opt into jsdom via the
 * environmentMatchGlobs hook below, so that the pure tests stay fast
 * and don't pay the jsdom startup cost.
 */
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: false,
    environmentMatchGlobs: [['**/*.dom.test.tsx', 'jsdom']],
    setupFiles: ['./src/test/setup.ts'],
  },
});
