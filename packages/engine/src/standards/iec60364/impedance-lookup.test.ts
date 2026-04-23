import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/loader.js';
import { lookupImpedance } from './impedance-lookup.js';

const ds = loadDataset();

describe('lookupImpedance', () => {
  it('returns R/X at csa=50mm² XLPE', () => {
    const r = lookupImpedance(ds, { conductorMaterial: 'Cu', cableType: 'multicore', frequencyHz: 50, insulationType: 'XLPE', csaMm2: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hit.rOhmPerKm).toBe(0.494);
      expect(r.hit.xOhmPerKm).toBe(0.0751);
      expect(r.hit.rTemperatureBasisC).toBe(90);
    }
  });

  it('returns R/X at csa=50mm² PVC with 70°C basis', () => {
    const r = lookupImpedance(ds, { conductorMaterial: 'Cu', cableType: 'multicore', frequencyHz: 50, insulationType: 'PVC', csaMm2: 50 });
    if (r.ok) {
      expect(r.hit.rOhmPerKm).toBe(0.449);
      expect(r.hit.rTemperatureBasisC).toBe(70);
    }
  });

  it('errors for non-standard csa (no interpolation)', () => {
    const r = lookupImpedance(ds, { conductorMaterial: 'Cu', cableType: 'multicore', frequencyHz: 50, insulationType: 'XLPE', csaMm2: 55 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-LOOKUP-003');
  });

  it('resolves Al/multicore (Stage 3A)', () => {
    const r = lookupImpedance(ds, { conductorMaterial: 'Al', cableType: 'multicore', frequencyHz: 50, insulationType: 'XLPE', csaMm2: 50 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.hit.rOhmPerKm).toBe(0.791);
      expect(r.hit.rTemperatureBasisC).toBe(90);
    }
  });

  it('still errors for unsupported (single-core)', () => {
    const r = lookupImpedance(ds, { conductorMaterial: 'Cu', cableType: 'single-core', frequencyHz: 50, insulationType: 'XLPE', csaMm2: 50 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-LOOKUP-003');
  });
});
