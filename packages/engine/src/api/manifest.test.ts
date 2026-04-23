import { describe, it, expect } from 'vitest';
import { getDatasetManifest, API_VERSION } from './manifest.js';
import { ENGINE_VERSION } from '../version.js';

describe('getDatasetManifest', () => {
  const m = getDatasetManifest();

  it('exposes engineVersion, apiVersion, and datasetId', () => {
    expect(m.datasetId).toBe('iec60364_lv_v1');
    expect(m.engineVersion).toBe(ENGINE_VERSION);
    expect(m.apiVersion).toBe(API_VERSION);
  });

  it('lists all 16 standard csa sizes', () => {
    expect(m.standardSizesMm2).toEqual([
      1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300,
    ]);
  });

  it('bundles 20 ampacity datasets with sorted methods + csa range', () => {
    // 10 at 50 Hz (6 multicore + 4 single-core as of 5A-SC-FG) plus
    // 10 at 60 Hz siblings as of 5B-AMP (0.8.0) = 20.
    expect(m.bundledDatasets).toHaveLength(20);
    for (const b of m.bundledDatasets) {
      expect(b.methods).toEqual([...b.methods].sort());
      // Method C is a multicore reference method; single-core datasets
      // (5A-SC-FG) carry F/G only.
      if (b.cableType === 'multicore') {
        expect(b.methods).toContain('C');
      } else {
        expect(b.methods).toEqual(['F', 'G']);
      }
      expect(b.csaRange.minMm2).toBeGreaterThan(0);
      expect(b.csaRange.maxMm2).toBeGreaterThanOrEqual(b.csaRange.minMm2);
    }
    const alEntry = m.bundledDatasets.find((b) => b.conductorMaterial === 'Al')!;
    expect(alEntry.csaRange.minMm2).toBe(16); // IEC: Al starts at 16 mm²
  });

  it('surfaces supportedCombinations as a flat cross-product (≥ 6 datasets × 7 methods)', () => {
    expect(m.supportedCombinations.length).toBeGreaterThanOrEqual(42);
    // Every combination exposes concrete available csa values
    for (const c of m.supportedCombinations) {
      expect(c.availableCsaMm2.length).toBeGreaterThan(0);
      expect(c.availableCsaMm2).toEqual([...c.availableCsaMm2].sort((a, b) => a - b));
    }
  });

  it('every supportedCombination carries an explicit cableType (multicore + single-core)', () => {
    // cableType was added in 5A-SC-FG infra; 5A-SC-FG values (0.7.0)
    // introduced the first single-core entries (F, G on Cu/Al × PVC/XLPE ×
    // 3L × 50 Hz).
    const cableTypes = new Set(m.supportedCombinations.map((c) => c.cableType));
    expect(cableTypes.has('multicore')).toBe(true);
    expect(cableTypes.has('single-core')).toBe(true);
    for (const c of m.supportedCombinations) {
      expect(typeof c.cableType).toBe('string');
    }

    // Single-core is F and G only; multicore never carries F or G.
    const scMethods = new Set(
      m.supportedCombinations.filter((c) => c.cableType === 'single-core').map((c) => c.method),
    );
    expect(scMethods).toEqual(new Set(['F', 'G']));

    const mcMethods = new Set(
      m.supportedCombinations.filter((c) => c.cableType === 'multicore').map((c) => c.method),
    );
    expect(mcMethods.has('F')).toBe(false);
    expect(mcMethods.has('G')).toBe(false);
  });

  it('includes both 2-loaded and 3-loaded combinations for Cu', () => {
    const cu2L = m.supportedCombinations.filter(
      (c) => c.conductorMaterial === 'Cu' && c.loadedConductors === 2,
    );
    const cu3L = m.supportedCombinations.filter(
      (c) => c.conductorMaterial === 'Cu' && c.loadedConductors === 3,
    );
    expect(cu2L.length).toBeGreaterThan(0);
    expect(cu3L.length).toBeGreaterThan(0);
  });

  it('reports impedance coverage for both Cu and Al multicore at 50 Hz and 60 Hz (Stage 5B-IMP)', () => {
    // After 5B-IMP: Cu and Al multicore each carry 50 Hz and 60 Hz bundles,
    // i.e. 4 impedance-coverage entries with identical insulation support.
    const tags = m.impedanceCoverage
      .map((c) => `${c.conductorMaterial}/${c.cableType}/${c.frequencyHz}Hz`)
      .sort();
    expect(tags).toEqual([
      'Al/multicore/50Hz',
      'Al/multicore/60Hz',
      'Cu/multicore/50Hz',
      'Cu/multicore/60Hz',
    ]);
    for (const c of m.impedanceCoverage) {
      expect(c.insulationTypes.sort()).toEqual(['PVC', 'XLPE']);
    }
  });

  it('reports k-value coverage for all 4 material/insulation combinations', () => {
    const keys = m.kValueCoverage.map((k) => `${k.conductorMaterial}/${k.insulationType}`).sort();
    expect(keys).toEqual(['Al/PVC', 'Al/XLPE', 'Cu/PVC', 'Cu/XLPE']);
    for (const k of m.kValueCoverage) {
      expect(k.kValue).toBeGreaterThan(0);
      expect(k.finalTempC).toBeGreaterThan(k.initialTempC);
    }
  });

  it('is idempotent (safe to call repeatedly)', () => {
    const a = getDatasetManifest();
    const b = getDatasetManifest();
    expect(a).toEqual(b);
  });

  // ── 5A-Cu-E invariant ────────────────────────────────────────────────
  // Every entry in supportedCombinations must be lookup-viable (rows > 0).
  // Every method listed under bundledDatasets[].methods must also be
  // lookup-viable (no declared-but-empty methods).
  it('supportedCombinations only contains lookup-viable methods (non-empty rows)', () => {
    for (const c of m.supportedCombinations) {
      expect(c.availableCsaMm2.length).toBeGreaterThan(0);
    }
  });

  it('bundledDatasets[].methods only lists lookup-viable methods', () => {
    for (const b of m.bundledDatasets) {
      for (const method of b.methods) {
        const combo = m.supportedCombinations.find(
          (c) =>
            c.conductorMaterial === b.conductorMaterial &&
            c.insulationType === b.insulationType &&
            c.loadedConductors === b.loadedConductors &&
            c.frequencyHz === b.frequencyHz &&
            c.method === method,
        );
        expect(combo).toBeDefined();
        expect(combo!.availableCsaMm2.length).toBeGreaterThan(0);
      }
    }
  });

  it('Methods E (multicore) and F, G (single-core) are all supported after Stage 5A', () => {
    // After 5A-Cu-E (0.5.0) + 5A-Al-E (0.6.0) + 5A-SC-FG (0.7.0), every
    // reference method Stage 5A was scoped to deliver is bundled for both
    // Cu and Al across PVC and XLPE.
    const methodsSeen = new Set(m.supportedCombinations.map((c) => c.method));
    expect(methodsSeen.has('E')).toBe(true);
    expect(methodsSeen.has('F')).toBe(true);
    expect(methodsSeen.has('G')).toBe(true);

    const eMaterials = new Set(
      m.supportedCombinations.filter((c) => c.method === 'E').map((c) => c.conductorMaterial),
    );
    expect(eMaterials.has('Cu')).toBe(true);
    expect(eMaterials.has('Al')).toBe(true);

    const fMaterials = new Set(
      m.supportedCombinations.filter((c) => c.method === 'F').map((c) => c.conductorMaterial),
    );
    expect(fMaterials.has('Cu')).toBe(true);
    expect(fMaterials.has('Al')).toBe(true);

    const gMaterials = new Set(
      m.supportedCombinations.filter((c) => c.method === 'G').map((c) => c.conductorMaterial),
    );
    expect(gMaterials.has('Cu')).toBe(true);
    expect(gMaterials.has('Al')).toBe(true);
  });

  // ── 5B-AMP invariants ────────────────────────────────────────────────
  it('both 50 Hz and 60 Hz ampacity combinations are supported (Stage 5B-AMP)', () => {
    const freqs = new Set(m.supportedCombinations.map((c) => c.frequencyHz));
    expect(freqs.has(50)).toBe(true);
    expect(freqs.has(60)).toBe(true);

    // The 60 Hz axis is a mechanical replica of the 50 Hz axis as of 5B-AMP.
    // Expect the cross-product to grow exactly 2× relative to the 50 Hz-only
    // manifest that shipped at 0.7.0 (56 combinations).
    const at50 = m.supportedCombinations.filter((c) => c.frequencyHz === 50);
    const at60 = m.supportedCombinations.filter((c) => c.frequencyHz === 60);
    expect(at60.length).toBe(at50.length);
    expect(m.supportedCombinations.length).toBe(at50.length + at60.length);

    // Every 50 Hz combination has a 60 Hz twin with the same availableCsaMm2.
    for (const c50 of at50) {
      const twin = at60.find(
        (c60) =>
          c60.conductorMaterial === c50.conductorMaterial &&
          c60.insulationType === c50.insulationType &&
          c60.loadedConductors === c50.loadedConductors &&
          c60.cableType === c50.cableType &&
          c60.method === c50.method,
      );
      expect(twin, `missing 60 Hz twin for ${JSON.stringify(c50)}`).toBeDefined();
      expect(twin!.availableCsaMm2).toEqual(c50.availableCsaMm2);
    }
  });
});
