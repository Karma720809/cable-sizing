import { describe, it, expect } from 'vitest';
import { parseCircuitInput, CircuitInputSchema } from './schema.js';

const GOOD = {
  load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
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

describe('CircuitInputSchema', () => {
  it('accepts a complete, valid input', () => {
    const r = parseCircuitInput(GOOD);
    expect(r.ok).toBe(true);
  });

  it('rejects invalid phase value', () => {
    const bad = { ...GOOD, system: { ...GOOD.system, phase: 2 } };
    const r = parseCircuitInput(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === 'system.phase')).toBe(true);
    }
  });

  it('rejects unknown enum value (insulationType=EPR)', () => {
    const bad = { ...GOOD, cable: { ...GOOD.cable, insulationType: 'EPR' } };
    const r = parseCircuitInput(bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path === 'cable.insulationType')).toBe(true);
  });

  it('rejects non-number voltage', () => {
    const bad = { ...GOOD, system: { ...GOOD.system, voltageV: 'four hundred' } };
    const r = parseCircuitInput(bad);
    expect(r.ok).toBe(false);
  });

  it('rejects missing required fields (route)', () => {
    const { route: _drop, ...rest } = GOOD;
    const r = parseCircuitInput(rest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.some((i) => i.path === 'route')).toBe(true);
  });

  it('accepts nullable fields as null', () => {
    const r = parseCircuitInput({
      ...GOOD,
      load: { ...GOOD.load, powerFactor: null, efficiency: null, demandFactor: null },
    });
    expect(r.ok).toBe(true);
  });

  it('treats optional fields (designCurrentOverrideA, ignoreReactanceBelowMm2) as truly optional', () => {
    const r = parseCircuitInput(GOOD);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.load.designCurrentOverrideA).toBeUndefined();
      expect(r.value.projectPolicy.ignoreReactanceBelowMm2).toBeUndefined();
    }
  });

  it('exported schema works with zod .parse() directly', () => {
    expect(() => CircuitInputSchema.parse(GOOD)).not.toThrow();
  });
});
