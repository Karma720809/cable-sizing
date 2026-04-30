/**
 * Stage A regression guard for the v1.3 envelope extension.
 *
 * Verifies the new optional fields on CircuitInput (system.topology,
 * overrides, neutralCarriesCurrent, _migration) all parse and that
 * existing inputs without them still validate. If either side breaks,
 * the v1 envelope frozen-shape contract has slipped (Adjustment-3).
 */
import { describe, it, expect } from 'vitest';
import { parseCircuitInput } from './schema.js';

const BASE = {
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

describe('schema (v1.3 Stage A additive extensions)', () => {
  it('parses pre-v1.3 input untouched (no extension fields)', () => {
    const r = parseCircuitInput(BASE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.system.topology).toBeUndefined();
      expect(r.value.overrides).toBeUndefined();
      expect(r.value.neutralCarriesCurrent).toBeUndefined();
      expect(r.value._migration).toBeUndefined();
    }
  });

  it('accepts system.topology when provided', () => {
    const r = parseCircuitInput({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.system.topology).toBe('3ph4w');
  });

  it('rejects unknown topology literal', () => {
    const r = parseCircuitInput({
      ...BASE,
      system: { ...BASE.system, topology: '3ph5w' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues.some((i) => i.path === 'system.topology')).toBe(true);
    }
  });

  it('accepts overrides with all three fields', () => {
    const r = parseCircuitInput({
      ...BASE,
      overrides: { designCurrent: 150, loadedConductors: 4, armourCsaMm2: 50 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.overrides?.designCurrent).toBe(150);
      expect(r.value.overrides?.loadedConductors).toBe(4);
      expect(r.value.overrides?.armourCsaMm2).toBe(50);
    }
  });

  it('accepts overrides as a partial object', () => {
    const r = parseCircuitInput({
      ...BASE,
      overrides: { designCurrent: 150 },
    });
    expect(r.ok).toBe(true);
  });

  it('accepts semantically invalid loadedConductors override for engine fail-closed handling', () => {
    const r = parseCircuitInput({
      ...BASE,
      overrides: { loadedConductors: 0 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.overrides?.loadedConductors).toBe(0);
  });

  it('accepts semantically invalid armourCsaMm2 override for engine fail-closed handling', () => {
    const r = parseCircuitInput({
      ...BASE,
      overrides: { armourCsaMm2: -10 },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.overrides?.armourCsaMm2).toBe(-10);
  });

  it('accepts neutralCarriesCurrent toggle', () => {
    const r = parseCircuitInput({ ...BASE, neutralCarriesCurrent: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.neutralCarriesCurrent).toBe(true);
  });

  it('rejects neutralCarriesCurrent as non-boolean', () => {
    const r = parseCircuitInput({ ...BASE, neutralCarriesCurrent: 'yes' });
    expect(r.ok).toBe(false);
  });

  it('accepts _migration namespace with legacy correction factors', () => {
    const r = parseCircuitInput({
      ...BASE,
      _migration: {
        recalculateLegacyCorrectionFactors: false,
        legacyCorrectionFactors: { k1: 0.91, k2: 0.85, kTotal: 0.77 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value._migration?.legacyCorrectionFactors?.kTotal).toBe(0.77);
    }
  });

  it('accepts _migration as empty object (all subfields optional)', () => {
    const r = parseCircuitInput({ ...BASE, _migration: {} });
    expect(r.ok).toBe(true);
  });
});
