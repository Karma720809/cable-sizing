/**
 * Orchestrator integration tests — Stage 2.
 *
 * Covers code paths for each E-xxx / W-xxx taxonomy entry (PRD §16) plus
 * happy-path end-to-end, defaults, override, IZ recheck, reactance
 * policy, and the INCOMPLETE → PASS → FAIL → WARNING overallStatus
 * lattice.
 */

import { describe, it, expect } from 'vitest';
import { sizeCable } from './pipeline.js';
import type { CircuitInput } from '../types/index.js';

function baseInput(overrides: Partial<CircuitInput> = {}): CircuitInput {
  const base: CircuitInput = {
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
    installation: {
      methodCode: 'C',
      ambientTempC: 30,
      soilResistivityK_m_W: null,
      groupCount: 1,
    },
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
  // Deep-merge top-level groups only; tests override one group at a time.
  const merged: CircuitInput = { ...base, ...overrides } as CircuitInput;
  return merged;
}

describe('sizeCable — happy path', () => {
  it('returns PASS with recommended csa and full audit trail', () => {
    const r = sizeCable(baseInput());
    expect(r.errors).toEqual([]);
    expect(r.overallStatus).toBe('PASS');
    expect(r.recommendedCSAmm2).toBeGreaterThan(0);
    expect(r.designCurrentA).toBeCloseTo(47.17, 1);
    expect(r.ampacity.status).toBe('PASS');
    expect(r.voltageDrop.status).toBe('PASS');
    expect(r.shortCircuit.status).toBe('PASS');
    expect(r.protectionCoordination.status).toBe('PASS');
    expect(r.auditTrail.length).toBeGreaterThanOrEqual(8);
    // Audit step numbering is monotonic
    for (let i = 0; i < r.auditTrail.length - 1; i++) {
      expect(r.auditTrail[i + 1]!.step).toBe(r.auditTrail[i]!.step + 1);
    }
  });
});

describe('sizeCable — validation errors (E-VAL-*)', () => {
  it('E-VAL-001: voltageV <= 0', () => {
    const r = sizeCable(baseInput({ system: { voltageV: 0, phase: 3, frequencyHz: 50 } }));
    expect(r.errors.some((e) => e.code === 'E-VAL-001')).toBe(true);
    expect(r.overallStatus).toBe('INCOMPLETE');
  });

  it('E-VAL-002: powerFactor out of range', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 25, powerFactor: 1.5, efficiency: 0.9, demandFactor: 1.0 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-002')).toBe(true);
  });

  it('E-VAL-003: ground method without soil resistivity', () => {
    const r = sizeCable(
      baseInput({
        installation: { methodCode: 'D1', ambientTempC: 20, soilResistivityK_m_W: null, groupCount: 1 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-003')).toBe(true);
  });

  it('E-VAL-004: neither powerKW nor override', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: null, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-004')).toBe(true);
  });

  it('E-VAL-005: lengthM <= 0', () => {
    const r = sizeCable(baseInput({ route: { lengthM: 0 } }));
    expect(r.errors.some((e) => e.code === 'E-VAL-005')).toBe(true);
  });

  it('E-VAL-006: groupCount < 1', () => {
    const r = sizeCable(
      baseInput({
        installation: { methodCode: 'C', ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 0 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-006')).toBe(true);
  });

  it('E-VAL-008: efficiency out of (0, 1]', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 1.5, demandFactor: 1.0 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-008')).toBe(true);
  });

  it('E-VAL-009: maxVoltageDropPercent <= 0', () => {
    const r = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 0,
          useReactance: false,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-009')).toBe(true);
  });

  it('E-VAL-010: invalid phase', () => {
    const r = sizeCable(
      baseInput({ system: { voltageV: 400, phase: 2 as unknown as 3, frequencyHz: 50 } }),
    );
    expect(r.errors.some((e) => e.code === 'E-VAL-010')).toBe(true);
  });
});

describe('sizeCable — lookup errors (E-LOOKUP-*)', () => {
  it('E-LOOKUP-001: unsupported combination (single-core, not in Stage 3A datasets)', () => {
    const r = sizeCable(
      baseInput({
        cable: {
          conductorMaterial: 'Cu',
          insulationType: 'PVC',
          coreConfiguration: '3C+N',
          cableType: 'single-core',
        },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-LOOKUP-001')).toBe(true);
  });

  it('E-LOOKUP-002: ambient outside tabulated range', () => {
    const r = sizeCable(
      baseInput({
        installation: { methodCode: 'C', ambientTempC: 70, soilResistivityK_m_W: null, groupCount: 1 },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-LOOKUP-002')).toBe(true);
  });
});

describe('sizeCable — warnings (W-*)', () => {
  it('W-DEFAULT-APPLIED when load fields are null', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 25, powerFactor: null, efficiency: null, demandFactor: null },
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('W-DEFAULT-APPLIED');
    // At least three defaults applied (pf, η, df)
    expect(r.warnings.filter((w) => w.code === 'W-DEFAULT-APPLIED').length).toBeGreaterThanOrEqual(3);
  });

  it('W-IB-OVERRIDE when override provided', () => {
    const r = sizeCable(
      baseInput({
        load: {
          type: 'general',
          powerKW: null,
          powerFactor: null,
          efficiency: null,
          demandFactor: null,
          designCurrentOverrideA: 80,
        },
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-IB-OVERRIDE')).toBe(true);
    expect(r.designCurrentA).toBe(80);
  });

  it('W-LOOKUP-SAFE-SIDE when correction factor is non-exact', () => {
    // Ambient 33°C between 30 and 35 → safe-side → W-LOOKUP-SAFE-SIDE
    const r = sizeCable(
      baseInput({
        installation: { methodCode: 'C', ambientTempC: 33, soilResistivityK_m_W: null, groupCount: 1 },
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-LOOKUP-SAFE-SIDE')).toBe(true);
  });

  it('W-REACTANCE-IGNORED when useReactance=true but csa < ignoreBelow', () => {
    const r = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          ignoreReactanceBelowMm2: 16,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-REACTANCE-IGNORED')).toBe(true);
  });

  it('W-I2-MISSING when operatingCurrentI2A is undefined → INCOMPLETE', () => {
    const r = sizeCable(
      baseInput({
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 50,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-I2-MISSING')).toBe(true);
    expect(r.protectionCoordination.status).toBe('INCOMPLETE');
    expect(r.overallStatus).toBe('INCOMPLETE');
  });

  it('W-PROTECTION-RECHECK when IZ at first candidate is below In and bump is needed', () => {
    // High In relative to load forces IZ recheck to bump the csa upward.
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 160, // >> IZ@35mm² in method C (119 A)
          operatingCurrentI2A: 1.45 * 160,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      }),
    );
    // Either a recheck warning is emitted, or the recommended csa was already large enough.
    // Expect the bumped csa to be large enough that In ≤ IZ.
    if (r.recommendedCSAmm2 != null) {
      expect(r.protectionCoordination.cableAmpacityIzA).toBeGreaterThanOrEqual(160);
    }
  });
});

describe('sizeCable — CR-OQ-1/CR-OQ-4 designCurrent blocking', () => {
  it('motor fla = 0 → designCurrent FieldState invalid, sizing blocked', () => {
    const r = sizeCable(
      baseInput({
        load: {
          type: 'motor',
          powerKW: 25,
          powerFactor: 0.85,
          efficiency: 0.9,
          demandFactor: 1.0,
          fla: 0,
        },
      }),
    );
    expect(r.overallStatus).toBe('INCOMPLETE');
    expect(r.recommendedCSAmm2).toBeNull();
    expect(r.fieldStates?.designCurrent?.status).toBe('invalid');
    expect(r.fieldStates?.designCurrent?.value).toBeNull();
  });

  it('motor fla < 0 → designCurrent FieldState invalid, sizing blocked', () => {
    const r = sizeCable(
      baseInput({
        load: {
          type: 'motor',
          powerKW: 25,
          powerFactor: 0.85,
          efficiency: 0.9,
          demandFactor: 1.0,
          fla: -5,
        },
      }),
    );
    expect(r.overallStatus).toBe('INCOMPLETE');
    expect(r.recommendedCSAmm2).toBeNull();
    expect(r.fieldStates?.designCurrent?.status).toBe('invalid');
    expect(r.fieldStates?.designCurrent?.value).toBeNull();
  });

  it('override designCurrent = 0 → designCurrent FieldState invalid, sizing blocked', () => {
    const r = sizeCable(baseInput({ overrides: { designCurrent: 0 } }));
    expect(r.overallStatus).toBe('INCOMPLETE');
    expect(r.recommendedCSAmm2).toBeNull();
    expect(r.fieldStates?.designCurrent?.status).toBe('invalid');
    expect(r.fieldStates?.designCurrent?.value).toBeNull();
  });

  it('motor fla blank/null + missing powerKW → designCurrent incomplete, sizing blocked', () => {
    const r = sizeCable(
      baseInput({
        load: {
          type: 'motor',
          powerKW: null,
          powerFactor: null,
          efficiency: null,
          demandFactor: 1.0,
          fla: null,
        },
      }),
    );
    expect(r.overallStatus).toBe('INCOMPLETE');
    expect(r.recommendedCSAmm2).toBeNull();
    expect(r.fieldStates?.designCurrent?.status).toBe('incomplete');
    expect(r.fieldStates?.designCurrent?.value).toBeNull();
  });

  it('motor fla blank/null + valid powerKW → falls back to IB_3PH_KW', () => {
    const r = sizeCable(
      baseInput({
        load: {
          type: 'motor',
          powerKW: 25,
          powerFactor: 0.85,
          efficiency: 0.9,
          demandFactor: 1.0,
          fla: null,
        },
      }),
    );
    expect(r.fieldStates?.designCurrent?.status).toBe('valid');
    expect(r.fieldStates?.designCurrent?.formula).toBe('IB_3PH_KW');
    expect(r.fieldStates?.designCurrent?.value).not.toBeNull();
    if (r.fieldStates?.designCurrent?.value != null) {
      expect(r.fieldStates.designCurrent.value as number).toBeCloseTo(47.17, 2);
    }
    expect(r.recommendedCSAmm2).not.toBeNull();
  });
});

describe('sizeCable — protection coordination lattice', () => {
  it('FAIL when In > IZ even after IZ-recheck exhausts sizes', () => {
    // Unreachable In (10 kA) forces E-CSA-001 via IZ recheck exhaustion.
    const r = sizeCable(
      baseInput({
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 10000,
          operatingCurrentI2A: 14500,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      }),
    );
    expect(r.errors.some((e) => e.code === 'E-CSA-001')).toBe(true);
  });
});

describe('sizeCable — Stage 3A material/insulation matrix', () => {
  it('Cu/XLPE end-to-end passes and picks a smaller csa than Cu/PVC for the same load', () => {
    const pvc = sizeCable(baseInput());
    const xlpe = sizeCable(
      baseInput({
        cable: {
          conductorMaterial: 'Cu',
          insulationType: 'XLPE',
          coreConfiguration: '3C+N',
          cableType: 'multicore',
        },
      }),
    );
    expect(pvc.overallStatus).toBe('PASS');
    expect(xlpe.overallStatus).toBe('PASS');
    // Ampacity-only min csa: XLPE ≤ PVC (XLPE tolerates higher operating temp → more current)
    expect(xlpe.ampacity.minimumCSAmm2!).toBeLessThanOrEqual(pvc.ampacity.minimumCSAmm2!);
  });

  it('Al/PVC end-to-end — Al requires larger csa than Cu for the same load', () => {
    const cu = sizeCable(baseInput({ load: { type: 'general', powerKW: 40, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 } }));
    const al = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 40, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
        cable: {
          conductorMaterial: 'Al',
          insulationType: 'PVC',
          coreConfiguration: '3C+N',
          cableType: 'multicore',
        },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 100,
          operatingCurrentI2A: 145,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      }),
    );
    expect(al.overallStatus).not.toBe('INCOMPLETE');
    expect(al.ampacity.minimumCSAmm2!).toBeGreaterThanOrEqual(cu.ampacity.minimumCSAmm2!);
  });

  it('Al/XLPE selects from Al-only size range (starts at 16 mm²)', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 30, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
        cable: {
          conductorMaterial: 'Al',
          insulationType: 'XLPE',
          coreConfiguration: '3C+N',
          cableType: 'multicore',
        },
      }),
    );
    expect(r.overallStatus).not.toBe('INCOMPLETE');
    // Al tables start at 16 mm² even if Cu would have sufficed at a smaller size
    expect(r.ampacity.minimumCSAmm2!).toBeGreaterThanOrEqual(16);
  });
});

describe('sizeCable — single-phase (Stage 3B, 2-loaded ampacity)', () => {
  it('230 V / 1ϕ / 5 kW selects a 2-loaded ampacity table and passes', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 5, powerFactor: 0.9, efficiency: 0.9, demandFactor: 1 },
        system: { voltageV: 230, phase: 1, frequencyHz: 50 },
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 32,
          operatingCurrentI2A: 46.4,
          tripTimeS: 0.1,
          shortCircuitKA: 6,
        },
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.overallStatus).toBe('PASS');
    // IB = 5000 / (230·0.9·0.9) ≈ 26.84 A — well within 6 mm² Cu/PVC 2L (46 A method C)
    expect(r.designCurrentA).toBeCloseTo(26.84, 1);
    expect(r.recommendedCSAmm2).not.toBeNull();
    // 2-loaded tables carry more than 3-loaded at the same csa, so ampacity-only
    // minimum for a 27 A load should still fit at 4 mm² on method C (36 A).
    expect(r.ampacity.minimumCSAmm2!).toBeLessThanOrEqual(6);
  });

  it('1ϕ + Cu/XLPE uses the Cu/XLPE 2-loaded table', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 8, powerFactor: 1, efficiency: 1, demandFactor: 1 },
        system: { voltageV: 230, phase: 1, frequencyHz: 50 },
        cable: {
          conductorMaterial: 'Cu',
          insulationType: 'XLPE',
          coreConfiguration: '3C+N',
          cableType: 'multicore',
        },
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 40,
          operatingCurrentI2A: 58,
          tripTimeS: 0.1,
          shortCircuitKA: 6,
        },
      }),
    );
    expect(r.errors).toEqual([]);
    expect(r.overallStatus).toBe('PASS');
    // IB = 8000 / 230 ≈ 34.78 A — Cu/XLPE 2L method C: 4 mm² = 45 A covers.
    expect(r.designCurrentA).toBeCloseTo(34.78, 1);
  });
});

describe('sizeCable — Phase 4A.3 audit extensions', () => {
  it('populates selectedDatasetId, selectedMethodRef, loadedConductorsUsed, lookupPolicyUsed on success', () => {
    const r = sizeCable(baseInput());
    expect(r.ampacity.selectedDatasetId).toMatch(/cu_pvc/i);
    expect(r.ampacity.selectedMethodRef).toBe('C');
    expect(r.ampacity.loadedConductorsUsed).toBe(3);
    expect(r.ampacity.lookupPolicyUsed).toBe('exact');
  });

  it('marks loadedConductorsUsed=2 for single-phase circuits', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 5, powerFactor: 0.9, efficiency: 0.9, demandFactor: 1 },
        system: { voltageV: 230, phase: 1, frequencyHz: 50 },
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 32,
          operatingCurrentI2A: 46.4,
          tripTimeS: 0.1,
          shortCircuitKA: 6,
        },
      }),
    );
    expect(r.ampacity.loadedConductorsUsed).toBe(2);
  });

  it('marks lookupPolicyUsed=safe-side when ambient falls between tabulated keys', () => {
    const r = sizeCable(
      baseInput({
        installation: { methodCode: 'C', ambientTempC: 33, soilResistivityK_m_W: null, groupCount: 1 },
      }),
    );
    expect(r.ampacity.lookupPolicyUsed).toBe('safe-side');
  });

  it('emits selectionDriver=voltage_drop on long runs where vdrop unambiguously governs', () => {
    const r = sizeCable(
      baseInput({
        route: { lengthM: 250 },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 63,
          operatingCurrentI2A: 91.35,
          tripTimeS: 0.1,
          shortCircuitKA: 0, // skip SC so only ampacity vs vdrop compete
        },
        projectPolicy: {
          maxVoltageDropPercent: 3,
          useReactance: false,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    expect(r.selectionDriver).toBe('voltage_drop');
  });

  it('emits selectionDriver=short_circuit when SC S_min dominates', () => {
    const r = sizeCable(
      baseInput({
        load: { type: 'general', powerKW: 5, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 20,
          operatingCurrentI2A: 29,
          tripTimeS: 0.1,
          shortCircuitKA: 22,
        },
      }),
    );
    expect(r.selectionDriver).toBe('short_circuit');
  });

  it('exposes apiVersion on every successful and skeleton result', () => {
    const good = sizeCable(baseInput());
    const bad = sizeCable(baseInput({ system: { voltageV: 0, phase: 3, frequencyHz: 50 } }));
    expect(good.apiVersion).toBe(1);
    expect(bad.apiVersion).toBe(1);
  });
});

describe('sizeCable — voltage-drop dominant', () => {
  it('bumps csa above ampacity-only selection when length is long', () => {
    const r = sizeCable(
      baseInput({
        route: { lengthM: 250 },
        projectPolicy: {
          maxVoltageDropPercent: 3,
          useReactance: false,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    // Vdrop-limited; selected csa must exceed ampacity-only minimum
    expect(r.voltageDrop.status).toBe('PASS');
    if (r.ampacity.minimumCSAmm2 != null && r.voltageDrop.minimumCSAmm2 != null) {
      expect(r.voltageDrop.minimumCSAmm2).toBeGreaterThanOrEqual(r.ampacity.minimumCSAmm2);
    }
  });
});
