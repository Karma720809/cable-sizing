import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/loader.js';
import { resolveAmpacityRows, selectCsaForRequiredIz, ampacityAtCsa } from './ampacity-lookup.js';

const ds = loadDataset();

describe('resolveAmpacityRows', () => {
  it('resolves Cu/PVC/3-loaded/multicore/50Hz/method C', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'PVC',
      loadedConductors: 3,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows[0]).toEqual({ csaMm2: 1.5, ampacityA: 17.5 });
      expect(r.tableRef).toMatch(/\/C$/);
    }
  });

  it('resolves Al/PVC and Al/XLPE (Stage 3A datasets)', () => {
    const rAlPvc = resolveAmpacityRows(ds, {
      conductorMaterial: 'Al',
      insulationType: 'PVC',
      loadedConductors: 3,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(rAlPvc.ok).toBe(true);
    if (rAlPvc.ok) expect(rAlPvc.rows[0]?.csaMm2).toBe(16); // Al tables start at 16 mm²

    const rAlXlpe = resolveAmpacityRows(ds, {
      conductorMaterial: 'Al',
      insulationType: 'XLPE',
      loadedConductors: 3,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(rAlXlpe.ok).toBe(true);
    if (rAlXlpe.ok) expect(rAlXlpe.rows[0]?.csaMm2).toBe(16);
  });

  it('resolves Cu/XLPE (Stage 3A)', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'XLPE',
      loadedConductors: 3,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Cu/XLPE @ 10 mm², method C = 70 A (vs Cu/PVC = 57 A — XLPE runs hotter)
      expect(r.rows.find((x) => x.csaMm2 === 10)?.ampacityA).toBe(70);
    }
  });

  it('still errors for an unsupported combination (e.g. single-core, 60 Hz)', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'PVC',
      loadedConductors: 3,
      cableType: 'single-core',
      frequencyHz: 50,
      method: 'C',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-LOOKUP-001');
  });

  it('resolves Cu/PVC 2-loaded (Stage 3B, single-phase)', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'PVC',
      loadedConductors: 2,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Cu/PVC 2-loaded @ 10 mm², method C = 63 A (vs 3-loaded = 57 A — 2L carries more).
      expect(r.rows.find((x) => x.csaMm2 === 10)?.ampacityA).toBe(63);
    }
  });

  it('resolves Cu/XLPE 2-loaded (Stage 3B, single-phase)', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'XLPE',
      loadedConductors: 2,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'C',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.rows.find((x) => x.csaMm2 === 10)?.ampacityA).toBe(80);
    }
  });

  it('errors on reference method with no bundled rows (F — single-core, not yet bundled)', () => {
    // Method E is now bundled on Cu multicore as of 5A-Cu-E; F and G remain
    // unbundled until 5A-SC-FG adds single-core datasets.
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu',
      insulationType: 'PVC',
      loadedConductors: 3,
      cableType: 'multicore',
      frequencyHz: 50,
      method: 'F',
    });
    expect(r.ok).toBe(false);
  });
});

describe('selectCsaForRequiredIz', () => {
  const rows = [
    { csaMm2: 1.5, ampacityA: 17.5 },
    { csaMm2: 2.5, ampacityA: 24 },
    { csaMm2: 4, ampacityA: 32 },
    { csaMm2: 6, ampacityA: 41 },
    { csaMm2: 10, ampacityA: 57 },
  ];

  it('picks first csa with ampacity ≥ required', () => {
    expect(selectCsaForRequiredIz(rows, 30)?.csaMm2).toBe(4);
    expect(selectCsaForRequiredIz(rows, 32)?.csaMm2).toBe(4);
    expect(selectCsaForRequiredIz(rows, 32.01)?.csaMm2).toBe(6);
  });

  it('returns undefined when required exceeds all rows', () => {
    expect(selectCsaForRequiredIz(rows, 1000)).toBeUndefined();
  });
});

describe('ampacityAtCsa', () => {
  it('exact-match lookup for a given csa', () => {
    const r = resolveAmpacityRows(ds, {
      conductorMaterial: 'Cu', insulationType: 'PVC', loadedConductors: 3, cableType: 'multicore', frequencyHz: 50, method: 'C',
    });
    if (r.ok) {
      expect(ampacityAtCsa(r.rows, 25)).toBe(96);
      expect(ampacityAtCsa(r.rows, 26)).toBeUndefined();
    }
  });
});
