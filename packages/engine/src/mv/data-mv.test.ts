import { describe, it, expect } from 'vitest';
import { __resetMvDatasetCache, loadMvDataset } from './data-mv.js';

describe('mv_22kv_kr_v1 dataset integrity', () => {
  it('loads without error and is approved', () => {
    __resetMvDatasetCache();
    const ds = loadMvDataset();
    expect(ds.meta.datasetId).toBe('mv_22kv_kr_v1');
    expect(ds.meta.status).toBe('approved');
    expect(ds.meta.frequencyHz).toBe(60);
  });

  it('has standard sizes [60..600]', () => {
    const ds = loadMvDataset();
    expect(ds.standardSizes.sizesMm2).toEqual([60, 100, 150, 200, 250, 325, 400, 500, 600]);
  });

  it('caches the result on subsequent loads', () => {
    __resetMvDatasetCache();
    const a = loadMvDataset();
    const b = loadMvDataset();
    expect(a).toBe(b);
  });

  it('contains ampacity tables for direct_buried, duct_bank, trough', () => {
    const ds = loadMvDataset();
    const ids = ds.ampacity.datasets.map((d) => d.installationMethod).sort();
    expect(ids).toEqual(['direct_buried', 'duct_bank', 'trough']);
  });

  it('contains four correction tables (k1, k2, k3, k4)', () => {
    const ds = loadMvDataset();
    expect(ds.corrections.ambientGround.factorType).toBe('ambient_ground_temperature');
    expect(ds.corrections.soilResistivity.factorType).toBe('soil_resistivity');
    expect(ds.corrections.grouping.factorType).toBe('grouping');
    expect(ds.corrections.burialDepth.factorType).toBe('burial_depth');
  });

  it('has Cu/XLPE k=143 for both conductor and screen', () => {
    const ds = loadMvDataset();
    const conductor = ds.shortCircuit.kValues.values.find((v) => v.application === 'conductor');
    const screen = ds.shortCircuit.kValues.values.find((v) => v.application === 'screen');
    expect(conductor?.kValue).toBe(143);
    expect(screen?.kValue).toBe(143);
  });

  it('impedance + capacitance + screen all use the standard 9-size CSA ladder', () => {
    const ds = loadMvDataset();
    const expected = [60, 100, 150, 200, 250, 325, 400, 500, 600];
    expect(ds.impedance.datasets[0]!.rows.map((r) => r.csaMm2)).toEqual(expected);
    expect(ds.capacitance.datasets[0]!.rows.map((r) => r.csaMm2)).toEqual(expected);
    expect(ds.screen.datasets[0]!.rows.map((r) => r.csaMm2)).toEqual(expected);
  });
});
