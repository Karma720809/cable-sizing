import { describe, it, expect } from 'vitest';
import { deriveDesignCurrent, FORMULA_IDS } from './design-current.js';
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

describe('deriveDesignCurrent — power-based 3φ general', () => {
  it('computes IB from powerKW formula and emits source=auto_formula', () => {
    const r = deriveDesignCurrent(BASE);
    expect(r.state.source).toBe('auto_formula');
    expect(r.state.status).toBe('valid');
    expect(r.state.formula).toBe(FORMULA_IDS.IB_3PH_KW);
    // 25 kW · 1000 / (√3 · 400 · 0.85 · 0.9) ≈ 47.17 A
    expect(r.designCurrentA).toBeCloseTo(47.17, 2);
    expect(r.warnings).toEqual([]);
  });
});

describe('deriveDesignCurrent — motor', () => {
  it('uses FLA when motor + fla present (formula = IB_FLA)', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: 80, demandFactor: 1.0 },
    });
    expect(r.state.formula).toBe(FORMULA_IDS.IB_FLA);
    expect(r.designCurrentA).toBe(80);
  });

  it('falls back to powerKW when motor without fla', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, type: 'motor' }, // fla absent
    });
    expect(r.state.formula).toBe(FORMULA_IDS.IB_3PH_KW);
    expect(r.designCurrentA).toBeCloseTo(47.17, 2);
  });

  it('respects demand factor with FLA', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: 100, demandFactor: 0.8 },
    });
    expect(r.designCurrentA).toBe(80);
  });

  it('motor fla = 0 → invalid (no fallback to powerKW)', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: 0, powerKW: 25 },
    });
    expect(r.state.status).toBe('invalid');
    expect(r.designCurrentA).toBeNull();
  });

  it('motor fla < 0 → invalid (no fallback to powerKW)', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: -5, powerKW: 25 },
    });
    expect(r.state.status).toBe('invalid');
    expect(r.designCurrentA).toBeNull();
  });

  it('motor fla blank/null + missing powerKW → incomplete', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: {
        ...BASE.load,
        type: 'motor',
        fla: null,
        powerKW: null,
        powerFactor: null,
        efficiency: null,
      },
    });
    expect(r.state.status).toBe('incomplete');
    expect(r.designCurrentA).toBeNull();
  });

  it('motor fla blank/null + valid powerKW → falls back to IB_3PH_KW', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: {
        ...BASE.load,
        type: 'motor',
        fla: null,
      },
    });
    expect(r.state.status).toBe('valid');
    expect(r.state.formula).toBe(FORMULA_IDS.IB_3PH_KW);
    expect(r.designCurrentA).toBeCloseTo(47.17, 2);
  });
});

describe('deriveDesignCurrent — transformer', () => {
  it('3φ transformer with kVA: IB = (kVA·1000)/(√3·V) · df', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: {
        type: 'transformer',
        powerKW: null,
        powerFactor: null,
        efficiency: null,
        demandFactor: 1.0,
        kva: 100,
      },
    });
    expect(r.state.formula).toBe(FORMULA_IDS.IB_3PH_KVA);
    // 100 · 1000 / (√3 · 400) ≈ 144.34 A
    expect(r.designCurrentA).toBeCloseTo(144.34, 2);
  });

  it('1φ transformer: IB = (kVA·1000)/V · df', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      system: { ...BASE.system, phase: 1, voltageV: 230 },
      load: {
        type: 'transformer',
        powerKW: null,
        powerFactor: null,
        efficiency: null,
        demandFactor: 1.0,
        kva: 50,
      },
    });
    expect(r.state.formula).toBe(FORMULA_IDS.IB_1PH_KVA);
    // 50 · 1000 / 230 ≈ 217.39 A
    expect(r.designCurrentA).toBeCloseTo(217.39, 2);
  });

  it('transformer without kva → incomplete', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: {
        type: 'transformer',
        powerKW: null,
        powerFactor: null,
        efficiency: null,
        demandFactor: 1.0,
      },
    });
    expect(r.state.status).toBe('incomplete');
    expect(r.state.reason).toBe('missing_input');
    expect(r.designCurrentA).toBeNull();
  });
});

describe('deriveDesignCurrent — overrides', () => {
  it('overrides.designCurrent wins, emits W-CR-001', () => {
    const r = deriveDesignCurrent({ ...BASE, overrides: { designCurrent: 100 } });
    expect(r.state.source).toBe('override');
    expect(r.designCurrentA).toBe(100);
    expect(r.warnings.find((w) => w.code === 'W-CR-001')).toBeDefined();
  });

  it('legacy designCurrentOverrideA emits both W-IB-OVERRIDE and W-CR-006', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, designCurrentOverrideA: 90 },
    });
    expect(r.state.source).toBe('override');
    expect(r.designCurrentA).toBe(90);
    expect(r.warnings.find((w) => w.code === 'W-IB-OVERRIDE')).toBeDefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-006')).toBeDefined();
  });

  it('overrides.designCurrent takes precedence over legacy', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      overrides: { designCurrent: 200 },
      load: { ...BASE.load, designCurrentOverrideA: 90 },
    });
    expect(r.designCurrentA).toBe(200);
    expect(r.warnings.find((w) => w.code === 'W-CR-006')).toBeUndefined(); // legacy path skipped
  });

  it('overrides.designCurrent = 0 → invalid (blocks sizing)', () => {
    const r = deriveDesignCurrent({ ...BASE, overrides: { designCurrent: 0 } });
    expect(r.state.status).toBe('invalid');
    expect(r.designCurrentA).toBeNull();
  });
});

describe('deriveDesignCurrent — incomplete inputs', () => {
  it('incomplete when powerKW missing for general load', () => {
    const r = deriveDesignCurrent({
      ...BASE,
      load: { ...BASE.load, powerKW: null },
    });
    expect(r.state.status).toBe('incomplete');
    expect(r.designCurrentA).toBeNull();
  });
});
