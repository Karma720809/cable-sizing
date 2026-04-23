/**
 * Vitest global setup — extends `expect` with @testing-library/jest-dom
 * matchers and explicitly wires testing-library's DOM cleanup to
 * vitest's `afterEach` (since this repo keeps `globals: false`).
 */
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
