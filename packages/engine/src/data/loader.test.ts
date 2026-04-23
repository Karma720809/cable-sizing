import { describe, it, expect } from 'vitest';
import { loadDataset } from './loader.js';

describe('dataset loader', () => {
  const ds = loadDataset();

  it('loads the iec60364_lv_v1 metadata', () => {
    expect(ds.meta.datasetId).toBe('iec60364_lv_v1');
    expect(ds.meta.standard).toBe('IEC60364');
  });

  it('exposes the 16 standard csa sizes', () => {
    expect(ds.standardSizes.sizesMm2).toEqual([1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]);
  });

  it('provides 8 ampacity reference-method tables per Cu dataset (A1..E incl., D1/D2)', () => {
    // After 5A-Cu-E, Method E is bundled on every Cu multicore dataset.
    const methods = Object.keys(ds.ampacity.cuPvc3Loaded50.tables).sort();
    expect(methods).toEqual(['A1', 'A2', 'B1', 'B2', 'C', 'D1', 'D2', 'E']);
  });

  it('bundles 20 ampacity datasets (10 @ 50 Hz + 10 @ 60 Hz)', () => {
    // 3A: Cu/Al × PVC/XLPE 3-loaded multicore;
    // 3B: Cu × PVC/XLPE 2-loaded multicore;
    // 5A-SC-FG: Cu/Al × PVC/XLPE 3-loaded single-core.
    // 5B-AMP: 60 Hz siblings of all 10 (value-for-value, per IEC Annex B
    // 50/60 Hz equivalence clause).
    const tags = ds.ampacity.datasets.map(
      (d) => `${d.conductorMaterial}/${d.insulationType}/${d.loadedConductors}L/${d.cableType}/${d.frequencyHz}Hz`,
    );
    expect(tags.sort()).toEqual([
      'Al/PVC/3L/multicore/50Hz',
      'Al/PVC/3L/multicore/60Hz',
      'Al/PVC/3L/single-core/50Hz',
      'Al/PVC/3L/single-core/60Hz',
      'Al/XLPE/3L/multicore/50Hz',
      'Al/XLPE/3L/multicore/60Hz',
      'Al/XLPE/3L/single-core/50Hz',
      'Al/XLPE/3L/single-core/60Hz',
      'Cu/PVC/2L/multicore/50Hz',
      'Cu/PVC/2L/multicore/60Hz',
      'Cu/PVC/3L/multicore/50Hz',
      'Cu/PVC/3L/multicore/60Hz',
      'Cu/PVC/3L/single-core/50Hz',
      'Cu/PVC/3L/single-core/60Hz',
      'Cu/XLPE/2L/multicore/50Hz',
      'Cu/XLPE/2L/multicore/60Hz',
      'Cu/XLPE/3L/multicore/50Hz',
      'Cu/XLPE/3L/multicore/60Hz',
      'Cu/XLPE/3L/single-core/50Hz',
      'Cu/XLPE/3L/single-core/60Hz',
    ]);
    // Al multicore datasets should start at 16 mm² (IEC: no Al below 16)
    const alMc = ds.ampacity.datasets.find(
      (d) => d.conductorMaterial === 'Al' && d.cableType === 'multicore',
    )!;
    expect(alMc.tables.C!.rows[0]!.csaMm2).toBe(16);
  });

  it('bundles 4 impedance datasets (Cu, Al × 50 Hz + 60 Hz) — Stage 5B-IMP', () => {
    // Stage 3A landed Cu + Al multicore @ 50 Hz.
    // Stage 5B-IMP adds their 60 Hz siblings (R replicated, X × 1.2).
    const tags = ds.impedance.datasets.map(
      (d) => `${d.conductorMaterial}/${d.cableType}/${d.frequencyHz}Hz`,
    );
    expect(tags.sort()).toEqual([
      'Al/multicore/50Hz',
      'Al/multicore/60Hz',
      'Cu/multicore/50Hz',
      'Cu/multicore/60Hz',
    ]);
  });

  it('has base-temperature factor = 1.0 on air/ground', () => {
    const air = ds.corrections.ambientAir.tables.PVC.rows.find((r) => r.ambientTempC === 30);
    const gnd = ds.corrections.ambientGround.tables.PVC.rows.find((r) => r.ambientTempC === 20);
    expect(air?.factor).toBe(1.0);
    expect(gnd?.factor).toBe(1.0);
  });

  it('has groupCount=1 → factor=1 across all grouping tables', () => {
    for (const key of Object.keys(ds.corrections.grouping.tables)) {
      const first = ds.corrections.grouping.tables[key]!.rows[0]!;
      expect(first.groupCount).toBe(1);
      expect(first.factor).toBe(1);
    }
  });

  it('covers all 4 k-value combinations', () => {
    const set = new Set(ds.shortCircuit.kValues.values.map((v) => `${v.conductorMaterial}/${v.insulationType}`));
    expect(set).toEqual(new Set(['Cu/PVC', 'Cu/XLPE', 'Al/PVC', 'Al/XLPE']));
  });

  it('returns a cached reference on subsequent calls', () => {
    const a = loadDataset();
    const b = loadDataset();
    expect(a).toBe(b);
  });
});
