import { describe, it, expect } from 'vitest';
import { shortCircuitCSA } from './short-circuit.js';

describe('shortCircuitCSA (adiabatic)', () => {
  it('computes Cu/XLPE (k=143) canonical example', () => {
    // Isc=22kA, t=0.1s, k=143
    // S = 22000 * sqrt(0.1) / 143 ≈ 48.6504 mm²
    const r = shortCircuitCSA({ shortCircuitA: 22000, tripTimeS: 0.1, kValue: 143 });
    expect(r.requiredCSARaw).toBeCloseTo(48.6504, 3);
  });

  it('computes Cu/PVC (k=115)', () => {
    // Isc=10kA, t=0.2s, k=115 → S = 10000*sqrt(0.2)/115 ≈ 38.8881
    const r = shortCircuitCSA({ shortCircuitA: 10000, tripTimeS: 0.2, kValue: 115 });
    expect(r.requiredCSARaw).toBeCloseTo(38.8881, 3);
  });

  it('throws on non-positive inputs', () => {
    expect(() => shortCircuitCSA({ shortCircuitA: 0, tripTimeS: 0.1, kValue: 115 })).toThrow();
    expect(() => shortCircuitCSA({ shortCircuitA: 1000, tripTimeS: 0, kValue: 115 })).toThrow();
    expect(() => shortCircuitCSA({ shortCircuitA: 1000, tripTimeS: 0.1, kValue: 0 })).toThrow();
  });

  it('scales with √t (half time → factor 1/√2)', () => {
    const a = shortCircuitCSA({ shortCircuitA: 10000, tripTimeS: 0.2, kValue: 115 });
    const b = shortCircuitCSA({ shortCircuitA: 10000, tripTimeS: 0.1, kValue: 115 });
    expect(b.requiredCSARaw / a.requiredCSARaw).toBeCloseTo(1 / Math.sqrt(2), 5);
  });
});
