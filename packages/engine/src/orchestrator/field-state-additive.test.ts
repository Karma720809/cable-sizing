/**
 * Stage B regression guard for the v1.3 SizingResult sidecar.
 *
 * Inverted from the Stage A version: now that derivation modules emit
 * FieldState provenance, this test asserts that:
 *
 *  1. `result.fieldStates` IS populated for every base run (always at
 *     least designCurrent + loadedConductors + k1/k2/k3/kTotal).
 *  2. AuditStep.derivedFields is reserved for Stage B+ enrichment but
 *     not yet required to be populated.
 *  3. The optional CircuitInput extensions are wired through:
 *     - `system.topology` does not change core decisions when its
 *       value matches the legacy `phase` derivation.
 *     - `overrides.*` fields actively change behavior (this is the
 *       feature being shipped).
 *     - `_migration.*` namespace is still inert at the pipeline level
 *       (consumed only by storage-layer code).
 */
import { describe, it, expect } from 'vitest';
import { sizeCable } from './pipeline.js';
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

function projectCore(r: ReturnType<typeof sizeCable>) {
  return {
    designCurrentA: r.designCurrentA,
    recommendedCSAmm2: r.recommendedCSAmm2,
    selectionDriver: r.selectionDriver,
    overallStatus: r.overallStatus,
    selectedCSAmm2: r.ampacity.selectedCSAmm2,
  };
}

describe('Stage B sidecar — fieldStates emission', () => {
  it('SizingResult.fieldStates is populated on every successful run', () => {
    const r = sizeCable(BASE);
    expect(r.fieldStates).toBeDefined();
    expect(Object.keys(r.fieldStates ?? {})).toEqual(
      expect.arrayContaining(['designCurrent', 'loadedConductors', 'k1', 'k2', 'k3', 'kTotal']),
    );
  });

  it('designCurrent FieldState has source=auto_formula for power-based load', () => {
    const r = sizeCable(BASE);
    const fs = r.fieldStates?.designCurrent;
    expect(fs?.source).toBe('auto_formula');
    expect(fs?.status).toBe('valid');
    expect(fs?.formula).toBe('IB_3PH_KW');
  });

  it('loadedConductors FieldState reflects legacy fallback (no topology)', () => {
    const r = sizeCable(BASE);
    const fs = r.fieldStates?.loadedConductors;
    expect(fs?.source).toBe('auto_formula');
    expect(fs?.value).toBe(3); // 3-phase, no topology → 3
  });

  it('k1/k2/k3 FieldStates carry datasetRef', () => {
    const r = sizeCable(BASE);
    expect(r.fieldStates?.k1?.source).toBe('auto_dataset');
    expect(r.fieldStates?.k1?.datasetRef).toBeDefined();
    expect(r.fieldStates?.k2?.source).toBe('auto_dataset');
    expect(r.fieldStates?.k3?.source).toBe('auto_dataset');
  });
});

describe('Stage B — topology compatibility', () => {
  it('system.topology=3ph4w (no neutral) matches legacy phase=3 result', () => {
    const a = sizeCable(BASE);
    const b = sizeCable({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
    });
    expect(projectCore(b)).toEqual(projectCore(a));
  });

  it('system.topology=3ph3w matches legacy phase=3 result', () => {
    const a = sizeCable(BASE);
    const b = sizeCable({
      ...BASE,
      system: { ...BASE.system, topology: '3ph3w' },
    });
    expect(projectCore(b)).toEqual(projectCore(a));
  });
});

describe('Stage B — _migration namespace stays inert', () => {
  it('_migration namespace does not change core decisions', () => {
    const a = sizeCable(BASE);
    const b = sizeCable({
      ...BASE,
      _migration: {
        recalculateLegacyCorrectionFactors: true,
        legacyCorrectionFactors: { k1: 0.5, k2: 0.5, kTotal: 0.25 },
      },
    });
    expect(projectCore(b)).toEqual(projectCore(a));
  });
});

describe('Stage B — overrides actively change behavior', () => {
  it('overrides.designCurrent forces the I_B value (was no-op in Stage A)', () => {
    const r = sizeCable({ ...BASE, overrides: { designCurrent: 999 } });
    expect(r.designCurrentA).toBe(999);
    expect(r.warnings.find((w) => w.code === 'W-CR-001')).toBeDefined();
    expect(r.fieldStates?.designCurrent?.source).toBe('override');
  });

  it('legacy load.designCurrentOverrideA still works + emits W-CR-006 deprecation', () => {
    const r = sizeCable({
      ...BASE,
      load: { ...BASE.load, designCurrentOverrideA: 80 },
    });
    expect(r.designCurrentA).toBe(80);
    expect(r.warnings.find((w) => w.code === 'W-IB-OVERRIDE')).toBeDefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-006')).toBeDefined();
  });

  it('overrides.loadedConductors emits W-CR-005 + source=override on FieldState', () => {
    const r = sizeCable({ ...BASE, overrides: { loadedConductors: 2 } });
    expect(r.warnings.find((w) => w.code === 'W-CR-005')).toBeDefined();
    expect(r.fieldStates?.loadedConductors?.source).toBe('override');
  });
});
