import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phase 4C host — consumes @cable-sizing/engine (built dist) from the workspace.
// The engine worker is loaded as a dedicated worker via `new Worker(new URL(...), { type: 'module' })`.
export default defineConfig({
  plugins: [react()],
  worker: {
    format: 'es',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
});
