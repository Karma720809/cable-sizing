import { describe, it, expect } from 'vitest';
import { loadDataset } from '../data/loader.js';
import { deriveArmour } from './armour.js';
import type { CircuitInput } from '../types/index.js';

const ds = loadDataset();

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
    insulationType: 'XLPE',
    coreConfiguration: '3C+N',
    cableType: 'multicore',
    armourType: 'SWA',
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

describe('deriveArmour — dataset lookup', () => {
  it('returns auto_dataset hit for 3C+N (mapped to 3C+E_SWA_XLPE) at 95 mm²', () => {
    const r = deriveArmour(BASE, ds, 95);
    expect(r.state.source).toBe('auto_dataset');
    expect(r.state.status).toBe('valid');
    expect(r.armour?.armourCsaMm2).toBe(75);
    expect(r.armour?.kArmour).toBe(51);
    expect(r.armour?.armourType).toBe('SWA');
    expect(r.armour?.cableConstruction).toBe('3C+E_SWA_XLPE');
  });

  it('returns auto_dataset for selected csa across the SWA table', () => {
    const r25 = deriveArmour(BASE, ds, 25);
    expect(r25.armour?.armourCsaMm2).toBe(41);
    const r300 = deriveArmour(BASE, ds, 300);
    expect(r300.armour?.armourCsaMm2).toBe(137);
  });

  it('unavailable when armourType is "none" or unset', () => {
    const r1 = deriveArmour(
      { ...BASE, cable: { ...BASE.cable, armourType: 'none' } },
      ds,
      95,
    );
    expect(r1.state.status).toBe('unavailable');
    expect(r1.state.reason).toBe('not_applicable');
    expect(r1.warnings.find((w) => w.code === 'W-CR-009')).toBeUndefined();

    const r2 = deriveArmour(
      { ...BASE, cable: { ...BASE.cable, armourType: undefined } },
      ds,
      95,
    );
    expect(r2.state.status).toBe('unavailable');
  });

  it('incomplete when conductor csa not yet selected', () => {
    const r = deriveArmour(BASE, ds, null);
    expect(r.state.status).toBe('incomplete');
    expect(r.state.reason).toBe('missing_input');
  });

  it('unavailable on dataset miss (csa not in SWA table)', () => {
    const r = deriveArmour(BASE, ds, 1000);
    expect(r.state.status).toBe('unavailable');
    expect(r.state.reason).toBe('no_dataset_match');
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeDefined();
  });

  it('unavailable on construction miss (PVC + SWA not in dataset)', () => {
    const r = deriveArmour(
      { ...BASE, cable: { ...BASE.cable, insulationType: 'PVC' } },
      ds,
      95,
    );
    expect(r.state.status).toBe('unavailable');
    expect(r.state.reason).toBe('no_dataset_match');
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeDefined();
  });
});

describe('deriveArmour — overrides', () => {
  it('overrides.armourCsaMm2 > 0 wins, source=override, W-CR-004 emitted', () => {
    const r = deriveArmour({ ...BASE, overrides: { armourCsaMm2: 200 } }, ds, 95);
    expect(r.state.source).toBe('override');
    expect(r.state.status).toBe('valid');
    expect(r.armour?.armourCsaMm2).toBe(200);
    expect(r.armour?.kArmour).toBe(51); // pulled from SWA dataset
    expect(r.warnings[0]?.code).toBe('W-CR-004');
  });

  it.each([0, -10])(
    'overrides.armourCsaMm2=%s → invalid override with no dataset fallback',
    (armourCsaMm2) => {
      const r = deriveArmour({ ...BASE, overrides: { armourCsaMm2 } }, ds, 95);
      expect(r.state.source).toBe('override');
      expect(r.state.status).toBe('invalid');
      expect(r.state.value).toBeNull();
      expect(r.state.reason).toBe('armour_csa_override_must_be_positive');
      expect(r.armour).toBeNull();
      expect(r.warnings.find((w) => w.code === 'W-CR-004')).toBeUndefined();
    },
  );

  it('override works even when armourType is unset (defaults to SWA k)', () => {
    const r = deriveArmour(
      {
        ...BASE,
        cable: { ...BASE.cable, armourType: undefined },
        overrides: { armourCsaMm2: 50 },
      },
      ds,
      95,
    );
    expect(r.armour?.armourCsaMm2).toBe(50);
    expect(r.armour?.armourType).toBe('SWA');
  });

  it('STA armour without dataset falls back to k=51 default on override', () => {
    const r = deriveArmour(
      {
        ...BASE,
        cable: { ...BASE.cable, armourType: 'STA' },
        overrides: { armourCsaMm2: 60 },
      },
      ds,
      95,
    );
    expect(r.armour?.armourType).toBe('STA');
    expect(r.armour?.kArmour).toBe(51); // dataset.armour.sta absent → IEC default
  });
});
