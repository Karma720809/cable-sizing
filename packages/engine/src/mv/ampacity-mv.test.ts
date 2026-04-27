import { describe, it, expect } from 'vitest';
import { loadMvDataset } from './data-mv.js';
import { ampacityAtMvCsa, resolveMvAmpacity, selectMvCsaForRequiredIz } from './ampacity-mv.js';

describe('MV ampacity lookup', () => {
  const ds = loadMvDataset();

  describe('resolveMvAmpacity exact-match', () => {
    it('CNCV-W direct_buried → 9-row table', () => {
      const r = resolveMvAmpacity(ds.ampacity.datasets, {
        cableType: 'CNCV-W',
        installationMethod: 'direct_buried',
      });
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.rows).toHaveLength(9);
        expect(r.rows[0]!.csaMm2).toBe(60);
      }
    });

    it('CNCV-W duct_bank table exists', () => {
      const r = resolveMvAmpacity(ds.ampacity.datasets, {
        cableType: 'CNCV-W',
        installationMethod: 'duct_bank',
      });
      expect(r.ok).toBe(true);
    });

    it('FR-CNCO-W direct_buried → no fallback, returns E-MV-LOOKUP-001', () => {
      const r = resolveMvAmpacity(ds.ampacity.datasets, {
        cableType: 'FR-CNCO-W',
        installationMethod: 'direct_buried',
      });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe('E-MV-LOOKUP-001');
    });

    it('CNCV-W tunnel → no table, error', () => {
      const r = resolveMvAmpacity(ds.ampacity.datasets, {
        cableType: 'CNCV-W',
        installationMethod: 'tunnel',
      });
      expect(r.ok).toBe(false);
    });
  });

  describe('selectMvCsaForRequiredIz', () => {
    const r = resolveMvAmpacity(ds.ampacity.datasets, {
      cableType: 'CNCV-W',
      installationMethod: 'direct_buried',
    });
    if (!r.ok) throw new Error('fixture lookup failed');
    const rows = r.rows;

    it('Iz=200A → 60mm² (265A)', () => {
      const hit = selectMvCsaForRequiredIz(rows, 200);
      expect(hit?.csaMm2).toBe(60);
    });

    it('Iz=400A → 150mm² (440A)', () => {
      const hit = selectMvCsaForRequiredIz(rows, 400);
      expect(hit?.csaMm2).toBe(150);
    });

    it('Iz=265A (exact first) → 60mm² (boundary inclusive)', () => {
      const hit = selectMvCsaForRequiredIz(rows, 265);
      expect(hit?.csaMm2).toBe(60);
    });

    it('Iz=1000A exceeds max ampacity (935A) → null', () => {
      expect(selectMvCsaForRequiredIz(rows, 1000)).toBeNull();
    });
  });

  describe('ampacityAtMvCsa', () => {
    const r = resolveMvAmpacity(ds.ampacity.datasets, {
      cableType: 'CNCV-W',
      installationMethod: 'direct_buried',
    });
    if (!r.ok) throw new Error('fixture lookup failed');
    const rows = r.rows;

    it('returns 510A at 200mm²', () => {
      expect(ampacityAtMvCsa(rows, 200)).toBe(510);
    });

    it('returns null for unknown csa', () => {
      expect(ampacityAtMvCsa(rows, 75)).toBeNull();
    });
  });
});
