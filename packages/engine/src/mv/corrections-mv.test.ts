import { describe, it, expect } from 'vitest';
import { loadMvDataset, __resetMvDatasetCache } from './data-mv.js';
import { computeMvCorrections, lookupK1, lookupK2, lookupK3, lookupK4 } from './corrections-mv.js';

describe('MV correction-factor conservative lookup', () => {
  __resetMvDatasetCache();
  const ds = loadMvDataset();

  describe('k1 (ground temperature)', () => {
    it('exact match @ 25°C → 1.0', () => {
      const r = lookupK1(ds.corrections.ambientGround, 25);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.factor).toBe(1.0);
        expect(r.matchType).toBe('exact');
      }
    });

    it('between rows @ 27°C → conservative 0.96 (next-larger key, harsher condition)', () => {
      const r = lookupK1(ds.corrections.ambientGround, 27);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.factor).toBe(0.96);
        expect(r.matchType).toBe('safe-side');
      }
    });

    it('above max @ 45°C → E-MV-LOOKUP-006', () => {
      const r = lookupK1(ds.corrections.ambientGround, 45);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('E-MV-LOOKUP-006');
    });

    it('below min @ 10°C → first row factor (1.08)', () => {
      const r = lookupK1(ds.corrections.ambientGround, 10);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.factor).toBe(1.08);
        expect(r.matchType).toBe('safe-side');
      }
    });
  });

  describe('k2 (soil resistivity)', () => {
    it('exact 1.2 K·m/W → 1.0', () => {
      const r = lookupK2(ds.corrections.soilResistivity, 1.2);
      if (r.ok) expect(r.factor).toBe(1.0);
    });

    it('1.3 → conservative 0.94 (next harsher)', () => {
      const r = lookupK2(ds.corrections.soilResistivity, 1.3);
      if (r.ok) {
        expect(r.factor).toBe(0.94);
        expect(r.matchType).toBe('safe-side');
      }
    });

    it('above 3.0 → out of range', () => {
      const r = lookupK2(ds.corrections.soilResistivity, 3.5);
      expect(r.ok).toBe(false);
    });
  });

  describe('k3 (grouping per installation method)', () => {
    it('direct_buried, n=1 → 1.0', () => {
      const r = lookupK3(ds.corrections.grouping, 'direct_buried', 1);
      if (r.ok) expect(r.factor).toBe(1.0);
    });

    it('direct_buried, n=4 → exact 0.67', () => {
      const r = lookupK3(ds.corrections.grouping, 'direct_buried', 4);
      if (r.ok) expect(r.factor).toBe(0.67);
    });

    it('duct_bank, n=5 → conservative 0.68 (n=6 row)', () => {
      const r = lookupK3(ds.corrections.grouping, 'duct_bank', 5);
      if (r.ok) {
        expect(r.factor).toBe(0.68);
        expect(r.matchType).toBe('safe-side');
      }
    });

    it('rejects groupCount=0', () => {
      const r = lookupK3(ds.corrections.grouping, 'direct_buried', 0);
      expect(r.ok).toBe(false);
    });
  });

  describe('k4 (burial depth)', () => {
    it('0.8m → 1.0', () => {
      const r = lookupK4(ds.corrections.burialDepth, 0.8);
      if (r.ok) expect(r.factor).toBe(1.0);
    });

    it('0.9m → conservative 0.98', () => {
      const r = lookupK4(ds.corrections.burialDepth, 0.9);
      if (r.ok) {
        expect(r.factor).toBe(0.98);
        expect(r.matchType).toBe('safe-side');
      }
    });
  });

  describe('computeMvCorrections aggregate', () => {
    it('all exact + base conditions → total = 1.0', () => {
      const r = computeMvCorrections(ds.corrections, {
        ambientTempC: 25,
        soilResistivityK_m_W: 1.2,
        groupCount: 1,
        burialDepthM: 0.8,
        installation: 'direct_buried',
      });
      expect(r.ok).toBe(true);
      expect(r.factors.k1).toBe(1.0);
      expect(r.factors.k2).toBe(1.0);
      expect(r.factors.k3).toBe(1.0);
      expect(r.factors.k4).toBe(1.0);
      expect(r.factors.total).toBe(1.0);
      expect(r.factors.lookupPolicy).toBe('exact');
    });

    it('non-buried installation skips k4', () => {
      const r = computeMvCorrections(ds.corrections, {
        ambientTempC: 25,
        soilResistivityK_m_W: 1.0,
        groupCount: 1,
        burialDepthM: 99, // ignored for trough
        installation: 'trough',
      });
      expect(r.ok).toBe(true);
      expect(r.factors.k4).toBe(1.0);
    });

    it('compound case: harsh conditions multiply correctly', () => {
      const r = computeMvCorrections(ds.corrections, {
        ambientTempC: 35, // 0.91
        soilResistivityK_m_W: 3.0, // 0.75
        groupCount: 4, // direct_buried 0.67
        burialDepthM: 1.2, // 0.96
        installation: 'direct_buried',
      });
      expect(r.ok).toBe(true);
      expect(r.factors.k1).toBe(0.91);
      expect(r.factors.k2).toBe(0.75);
      expect(r.factors.k3).toBe(0.67);
      expect(r.factors.k4).toBe(0.96);
      expect(r.factors.total).toBeCloseTo(0.91 * 0.75 * 0.67 * 0.96, 6);
    });

    it('out-of-range input bubbles up an error', () => {
      const r = computeMvCorrections(ds.corrections, {
        ambientTempC: 60, // out of [15,40]
        soilResistivityK_m_W: 1.2,
        groupCount: 1,
        burialDepthM: 0.8,
        installation: 'direct_buried',
      });
      expect(r.ok).toBe(false);
      expect(r.errors[0]?.code).toBe('E-MV-LOOKUP-006');
    });
  });
});
