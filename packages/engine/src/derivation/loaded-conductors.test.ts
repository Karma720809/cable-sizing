import { describe, it, expect } from 'vitest';
import { deriveLoadedConductors } from './loaded-conductors.js';
import type { CircuitInput } from '../types/index.js';

const BASE: CircuitInput = {
  load: {
    type: 'general',
    powerKW: 25,
    powerFactor: 0.85,
    efficiency: 0.9,
    demandFactor: 1.0,
  },
  system: { voltageV: 400, phase: 3, frequencyHz: 50 },
  cable: {
    conductorMaterial: 'Cu',
    insulationType: 'PVC',
    coreConfiguration: '3C+N',
    cableType: 'multicore',
  },
  installation: { methodCode: 'C', ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 1 },
  route: { lengthM: 50 },
  protection: {
    deviceType: 'MCB',
    ratedCurrentA: 50,
    operatingCurrentI2A: 72.5,
    tripTimeS: 0.1,
    shortCircuitKA: 10,
  },
  projectPolicy: {
    maxVoltageDropPercent: 5,
    useReactance: false,
    resistanceModel: 'fixed_reference',
    roundingPolicy: 'next_standard_csa',
  },
};

describe('deriveLoadedConductors — topology table', () => {
  it('1ph2w → 2', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '1ph2w', phase: 1 },
    });
    expect(r.loadedConductors).toBe(2);
    expect(r.state.source).toBe('auto_formula');
    expect(r.promotedByNeutral).toBe(false);
    expect(r.info).toHaveLength(0);
  });

  it('1ph3w default → 2', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '1ph3w', phase: 1 },
    });
    expect(r.loadedConductors).toBe(2);
  });

  it('1ph3w + neutralCarriesCurrent → 3', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '1ph3w', phase: 1 },
      neutralCarriesCurrent: true,
    });
    expect(r.loadedConductors).toBe(3);
    expect(r.promotedByNeutral).toBe(false); // 4-only flag
  });

  it('3ph3w → 3', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '3ph3w' },
    });
    expect(r.loadedConductors).toBe(3);
  });

  it('3ph4w default (balanced) → 3', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
    });
    expect(r.loadedConductors).toBe(3);
    expect(r.info).toHaveLength(0);
  });

  it('3ph4w + neutralCarriesCurrent → 4 + I-CR-001', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
      neutralCarriesCurrent: true,
    });
    expect(r.loadedConductors).toBe(4);
    expect(r.promotedByNeutral).toBe(true);
    expect(r.info[0]?.code).toBe('I-CR-001');
  });
});

describe('deriveLoadedConductors — legacy phase fallback', () => {
  it('topology absent, phase=1 → 2 (matches pre-v1.3 pipeline)', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, phase: 1 },
    });
    expect(r.loadedConductors).toBe(2);
    expect(r.state.formula).toBe('LC_TABLE_v1.3');
  });

  it('topology absent, phase=3 → 3 (matches pre-v1.3 pipeline)', () => {
    const r = deriveLoadedConductors(BASE);
    expect(r.loadedConductors).toBe(3);
  });

  it('neutralCarriesCurrent without topology is ignored (legacy fallback)', () => {
    const r = deriveLoadedConductors({ ...BASE, neutralCarriesCurrent: true });
    expect(r.loadedConductors).toBe(3); // no topology → fallback path
    expect(r.info).toHaveLength(0);
  });
});

describe('deriveLoadedConductors — overrides', () => {
  it('overrides.loadedConductors=4 → source=override, W-CR-005', () => {
    const r = deriveLoadedConductors({ ...BASE, overrides: { loadedConductors: 4 } });
    expect(r.loadedConductors).toBe(4);
    expect(r.state.source).toBe('override');
    expect(r.warnings[0]?.code).toBe('W-CR-005');
  });

  it('override skips derivation entirely (no I-CR-001)', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
      neutralCarriesCurrent: true,
      overrides: { loadedConductors: 3 },
    });
    expect(r.loadedConductors).toBe(3);
    expect(r.info).toHaveLength(0);
  });

  it('overrides.loadedConductors=3 → valid override', () => {
    const r = deriveLoadedConductors({ ...BASE, overrides: { loadedConductors: 3 } });
    expect(r.loadedConductors).toBe(3);
    expect(r.state.source).toBe('override');
    expect(r.state.status).toBe('valid');
    expect(r.warnings[0]?.code).toBe('W-CR-005');
  });

  it.each([0, 1, 5, -1, 2.5])(
    'overrides.loadedConductors=%s → invalid override with no auto fallback',
    (loadedConductors) => {
      const r = deriveLoadedConductors({
        ...BASE,
        overrides: { loadedConductors },
      });
      expect(r.loadedConductors).toBeNull();
      expect(r.state.source).toBe('override');
      expect(r.state.status).toBe('invalid');
      expect(r.state.value).toBeNull();
      expect(r.state.reason).toBe('loaded_conductors_override_out_of_range');
      expect(r.warnings).toHaveLength(0);
    },
  );

  it('override absent still uses auto derivation', () => {
    const r = deriveLoadedConductors({
      ...BASE,
      overrides: {},
    });
    expect(r.loadedConductors).toBe(3);
    expect(r.state.source).toBe('auto_formula');
  });
});
