import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/loader.js';
import { computeK1, computeK2, computeK3, computeCorrections } from './corrections.js';

const ds = loadDataset();

describe('computeK1 (ambient)', () => {
  it('returns 1.0 at air base 30°C for PVC/XLPE', () => {
    const a = computeK1(ds, { method: 'C', insulation: 'PVC', ambientTempC: 30 });
    const b = computeK1(ds, { method: 'C', insulation: 'XLPE', ambientTempC: 30 });
    expect(a.ok && a.hit.factor).toBe(1.0);
    expect(a.ok && a.hit.matchType).toBe('exact');
    expect(b.ok && b.hit.factor).toBe(1.0);
  });

  it('returns 1.0 at ground base 20°C', () => {
    const r = computeK1(ds, { method: 'D1', insulation: 'XLPE', ambientTempC: 20 });
    expect(r.ok && r.hit.factor).toBe(1.0);
  });

  it('safe-side lookup picks the neighbor with the smaller factor (more derating)', () => {
    // Air XLPE rows have 30°C (f=1.00) and 35°C (f=0.96). At 33°C safe-side
    // selects 35°C → smaller factor → more derating → larger required IZ'.
    const r = computeK1(ds, { method: 'C', insulation: 'XLPE', ambientTempC: 33 });
    expect(r.ok && r.hit.matchType).toBe('safe-side');
    expect(r.ok && r.hit.keyUsed).toBe(35);
    expect(r.ok && r.hit.factor).toBe(0.96);
  });

  it('errors when ambientTempC is below the smallest tabulated key', () => {
    const r = computeK1(ds, { method: 'C', insulation: 'PVC', ambientTempC: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-LOOKUP-002');
  });

  it('errors when ambientTempC exceeds the largest tabulated key (refuses to extrapolate)', () => {
    // PVC air max is 60°C. 65°C has no safe neighbor → error (prior policy
    // would have silently returned factor=0.50, which is NON-conservative).
    const r = computeK1(ds, { method: 'C', insulation: 'PVC', ambientTempC: 65 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-LOOKUP-002');
  });
});

describe('computeK2 (soil)', () => {
  it('is 1.0 for air methods', () => {
    const r = computeK2(ds, { method: 'C', soilResistivityK_m_W: null });
    expect(r.ok && r.hit.factor).toBe(1.0);
  });
  it('requires soil resistivity for ground methods', () => {
    const r = computeK2(ds, { method: 'D1', soilResistivityK_m_W: null });
    expect(r.ok).toBe(false);
  });
  it('returns 1.0 at base 2.5 K·m/W', () => {
    const r = computeK2(ds, { method: 'D1', soilResistivityK_m_W: 2.5 });
    expect(r.ok && r.hit.factor).toBe(1.0);
  });
  it('uses direct_buried table for D2', () => {
    const r = computeK2(ds, { method: 'D2', soilResistivityK_m_W: 1.0 });
    expect(r.ok && r.hit.factor).toBe(1.5);
  });
  it('safe-side on non-exact soil resistivity picks smaller factor (more derating)', () => {
    // buried_ducts has 2.0 (1.05) and 2.5 (1.00) → at 2.2 safe-side picks 2.5.
    const r = computeK2(ds, { method: 'D1', soilResistivityK_m_W: 2.2 });
    expect(r.ok && r.hit.matchType).toBe('safe-side');
    expect(r.ok && r.hit.keyUsed).toBe(2.5);
    expect(r.ok && r.hit.factor).toBe(1.0);
  });
});

describe('computeK3 (grouping)', () => {
  it('returns 1.0 at groupCount=1 regardless of method', () => {
    for (const method of ['A1', 'B1', 'C', 'D1'] as const) {
      const r = computeK3(ds, { method, groupCount: 1 });
      expect(r.ok && r.hit.factor).toBe(1.0);
    }
  });
  it('applies bunched_air table for A/B methods', () => {
    const r = computeK3(ds, { method: 'A1', groupCount: 3 });
    expect(r.ok && r.hit.factor).toBe(0.7);
  });
  it('applies single_layer_wall for method C', () => {
    const r = computeK3(ds, { method: 'C', groupCount: 3 });
    expect(r.ok && r.hit.factor).toBe(0.79);
  });
  it('applies buried_touching for D1', () => {
    const r = computeK3(ds, { method: 'D1', groupCount: 3 });
    expect(r.ok && r.hit.factor).toBe(0.65);
  });
  it('safe-side lookup picks smaller factor neighbor for non-tabulated group count', () => {
    // bunched_air has 9 (0.50) and 12 (0.45) → 10 falls between; safe-side → 12.
    // Previously "nearest lower key" wrongly picked 9 (factor 0.50, LESS derating).
    const r = computeK3(ds, { method: 'A1', groupCount: 10 });
    expect(r.ok && r.hit.matchType).toBe('safe-side');
    expect(r.ok && r.hit.keyUsed).toBe(12);
    expect(r.ok && r.hit.factor).toBe(0.45);
  });
  it('errors when group count exceeds the largest tabulated key', () => {
    // bunched_air max is 20; 25 is beyond → error (no silent extrapolation).
    const r = computeK3(ds, { method: 'A1', groupCount: 25 });
    expect(r.ok).toBe(false);
  });
});

describe('computeCorrections (aggregate)', () => {
  it('multiplies k1·k2·k3 and surfaces W-LOOKUP-SAFE-SIDE when any factor is safe-side', () => {
    const r = computeCorrections(ds, {
      method: 'A1',
      insulation: 'PVC',
      ambientTempC: 30,
      soilResistivityK_m_W: null,
      groupCount: 10,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // k1=1.0 (30°C exact), k2=1.0 (air), k3=0.45 (safe-side via 12-neighbour).
      expect(r.combined.total).toBeCloseTo(0.45, 5);
      expect(r.combined.warningCode).toBe('W-LOOKUP-SAFE-SIDE');
    }
  });

  it('omits warning code when all three factors are exact matches', () => {
    const r = computeCorrections(ds, {
      method: 'C',
      insulation: 'XLPE',
      ambientTempC: 30,
      soilResistivityK_m_W: null,
      groupCount: 1,
    });
    expect(r.ok && r.combined.warningCode).toBeUndefined();
    expect(r.ok && r.combined.total).toBe(1.0);
  });
});
