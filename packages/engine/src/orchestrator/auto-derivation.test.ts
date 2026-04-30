/**
 * Stage B integration tests — Acceptance Criteria coverage.
 *
 * Verifies the v1.3 input-automation behaviors at the pipeline level:
 *
 *   AC-2  designCurrent auto-calc with motor=FLA fallback to powerKW
 *   AC-3  override priority (override > derived)
 *   AC-5  loadedConductors auto: 3φ4w + neutral toggle → 4 (clamped to 3
 *         for ampacity table) + I-CR-001 emission + W-CR-008 derating note
 *   AC-9  Armour CSA auto-fill from dataset; override emits W-CR-004
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §14.1.
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
    insulationType: 'XLPE',
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

// ─────────────────────────────────────────────────────────────────────
// AC-2 — design current auto-calc by load type
// ─────────────────────────────────────────────────────────────────────

describe('AC-2: designCurrent derivation — motor FLA priority', () => {
  it('motor with FLA: I_B = FLA · df (formula = IB_FLA)', () => {
    const r = sizeCable({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: 100, demandFactor: 1.0 },
    });
    expect(r.designCurrentA).toBe(100);
    expect(r.fieldStates?.designCurrent?.formula).toBe('IB_FLA');
  });

  it('motor without FLA: falls back to powerKW formula', () => {
    const r = sizeCable({
      ...BASE,
      load: { ...BASE.load, type: 'motor' },
    });
    expect(r.designCurrentA).toBeCloseTo(47.17, 2);
    expect(r.fieldStates?.designCurrent?.formula).toBe('IB_3PH_KW');
  });

  it('motor with FLA AND powerKW: FLA wins', () => {
    const r = sizeCable({
      ...BASE,
      load: { ...BASE.load, type: 'motor', fla: 200, powerKW: 25 },
    });
    expect(r.designCurrentA).toBe(200);
  });

  it('transformer with kVA: I_B = (kVA·1000)/(√3·V) · df', () => {
    const r = sizeCable({
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
    // 100 · 1000 / (√3 · 400) ≈ 144.34
    expect(r.designCurrentA).toBeCloseTo(144.34, 2);
    expect(r.fieldStates?.designCurrent?.formula).toBe('IB_3PH_KVA');
  });
});

// ─────────────────────────────────────────────────────────────────────
// AC-3 — override priority
// ─────────────────────────────────────────────────────────────────────

describe('AC-3: override priority (overrides > legacy > derived)', () => {
  it('overrides.designCurrent wins over both legacy field and derived', () => {
    const r = sizeCable({
      ...BASE,
      overrides: { designCurrent: 250 },
      load: { ...BASE.load, designCurrentOverrideA: 80 }, // legacy
    });
    expect(r.designCurrentA).toBe(250);
    expect(r.warnings.find((w) => w.code === 'W-CR-001')).toBeDefined();
    // legacy path skipped → no W-CR-006 deprecation fired
    expect(r.warnings.find((w) => w.code === 'W-CR-006')).toBeUndefined();
  });

  it('legacy designCurrentOverrideA still works (with deprecation warning)', () => {
    const r = sizeCable({
      ...BASE,
      load: { ...BASE.load, designCurrentOverrideA: 80 },
    });
    expect(r.designCurrentA).toBe(80);
    expect(r.warnings.find((w) => w.code === 'W-IB-OVERRIDE')).toBeDefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-006')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// AC-5 — loadedConductors auto with neutral toggle
// ─────────────────────────────────────────────────────────────────────

describe('AC-5: loadedConductors derivation', () => {
  it('3ph4w + neutralCarriesCurrent=true → derived=4, clamped to 3, emits I-CR-001 + W-CR-008', () => {
    const r = sizeCable({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
      neutralCarriesCurrent: true,
    });
    expect(r.fieldStates?.loadedConductors?.value).toBe(4);
    expect(r.ampacity.loadedConductorsUsed).toBe(3); // clamped for ampacity table
    expect(r.info?.find((i) => i.code === 'I-CR-001')).toBeDefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-008')).toBeDefined();
  });

  it('3ph4w default (no neutral toggle) → derived=3, no I-CR-001', () => {
    const r = sizeCable({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
    });
    expect(r.fieldStates?.loadedConductors?.value).toBe(3);
    expect(r.info ?? []).toHaveLength(0);
    expect(r.warnings.find((w) => w.code === 'W-CR-008')).toBeUndefined();
  });

  it('topology absent: legacy phase-based fallback (phase=3 → 3)', () => {
    const r = sizeCable(BASE);
    expect(r.fieldStates?.loadedConductors?.value).toBe(3);
    expect(r.ampacity.loadedConductorsUsed).toBe(3);
  });

  it('overrides.loadedConductors=2 forces 2 even on phase=3', () => {
    const r = sizeCable({ ...BASE, overrides: { loadedConductors: 2 } });
    expect(r.ampacity.loadedConductorsUsed).toBe(2);
    expect(r.warnings.find((w) => w.code === 'W-CR-005')).toBeDefined();
  });

  it('overrides.loadedConductors=3 → valid override', () => {
    const r = sizeCable({ ...BASE, overrides: { loadedConductors: 3 } });
    expect(r.fieldStates?.loadedConductors?.source).toBe('override');
    expect(r.fieldStates?.loadedConductors?.status).toBe('valid');
    expect(r.fieldStates?.loadedConductors?.value).toBe(3);
    expect(r.ampacity.loadedConductorsUsed).toBe(3);
  });

  it.each([0, 1, 5])(
    'overrides.loadedConductors=%s → invalid FieldState and downstream sizing blocked',
    (loadedConductors) => {
      const r = sizeCable({ ...BASE, overrides: { loadedConductors } });
      expect(r.fieldStates?.loadedConductors?.source).toBe('override');
      expect(r.fieldStates?.loadedConductors?.status).toBe('invalid');
      expect(r.fieldStates?.loadedConductors?.value).toBeNull();
      expect(r.fieldStates?.loadedConductors?.reason).toBe(
        'loaded_conductors_override_out_of_range',
      );
      expect(r.recommendedCSAmm2).toBeNull();
      expect(r.ampacity.status).toBe('FAIL');
      expect(r.ampacity.loadedConductorsUsed).toBeNull();
    },
  );
});

// ─────────────────────────────────────────────────────────────────────
// AC-9 — Armour CSA auto-fill + override
// ─────────────────────────────────────────────────────────────────────

describe('AC-9: Armour CSA derivation', () => {
  it('armourType=SWA + 3C+N XLPE → fieldStates.armourCsa populated from dataset', () => {
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'SWA' },
    });
    const fs = r.fieldStates?.armourCsa;
    expect(fs?.source).toBe('auto_dataset');
    expect(fs?.status).toBe('valid');
    expect((fs?.value as { kArmour?: number })?.kArmour).toBe(51);
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeUndefined();
  });

  it('armourType=none → fieldStates.armourCsa unavailable', () => {
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'none' },
    });
    // armourType='none' takes the early-return-before-armour branch in the
    // pipeline; armourCsa is not populated at all.
    expect(r.fieldStates?.armourCsa).toBeUndefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeUndefined();
  });

  it('SWA armour with unsupported construction surfaces unavailable state and diagnostic warning', () => {
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'SWA', coreConfiguration: '4C' },
    });

    expect(r.fieldStates?.armourCsa?.source).toBe('auto_dataset');
    expect(r.fieldStates?.armourCsa?.status).toBe('unavailable');
    expect(r.fieldStates?.armourCsa?.reason).toBe('no_dataset_match');
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeDefined();
    expect(
      r.auditTrail.find(
        (step) => step.code === 'W-CR-009' && step.decision === 'INCOMPLETE',
      ),
    ).toBeDefined();
    expect(
      r.auditTrail.find(
        (step) => step.formula === 'S_arm_req = Isc·√t / k_arm' && step.decision === 'PASS',
      ),
    ).toBeUndefined();
  });

  it('overrides.armourCsaMm2 emits W-CR-004 + source=override', () => {
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'SWA' },
      overrides: { armourCsaMm2: 200 },
    });
    expect(r.warnings.find((w) => w.code === 'W-CR-004')).toBeDefined();
    expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeUndefined();
    expect(r.fieldStates?.armourCsa?.source).toBe('override');
    expect(r.fieldStates?.armourCsa?.status).toBe('valid');
  });

  it.each([0, -10])(
    'SWA armour with overrides.armourCsaMm2=%s → invalid FieldState, no dataset fallback',
    (armourCsaMm2) => {
      const r = sizeCable({
        ...BASE,
        cable: { ...BASE.cable, armourType: 'SWA' },
        overrides: { armourCsaMm2 },
      });
      expect(r.fieldStates?.armourCsa?.source).toBe('override');
      expect(r.fieldStates?.armourCsa?.status).toBe('invalid');
      expect(r.fieldStates?.armourCsa?.value).toBeNull();
      expect(r.fieldStates?.armourCsa?.reason).toBe('armour_csa_override_must_be_positive');
      expect(r.warnings.find((w) => w.code === 'W-CR-004')).toBeUndefined();
      expect(r.warnings.find((w) => w.code === 'W-CR-009')).toBeUndefined();
    },
  );

  it('armour SC verification: oversize armour passes silently', () => {
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'SWA' },
      overrides: { armourCsaMm2: 500 }, // far above any required value
    });
    expect(r.warnings.find((w) => w.code === 'W-CR-007')).toBeUndefined();
  });

  it('armour SC verification: undersize armour emits W-CR-007', () => {
    // k_armour=51 is much smaller than k_Cu_XLPE=143, so we can choose Isc·√t
    // such that conductor SC passes (required < max standard) yet armour fails.
    // Isc=10kA, t=0.1s → Isc·√t = 3162 → conductor S_min = 22 mm² (tiny);
    //                                    armour S_min  = 62 mm² >> 1.
    const r = sizeCable({
      ...BASE,
      cable: { ...BASE.cable, armourType: 'SWA' },
      overrides: { armourCsaMm2: 1 }, // deliberately too small
    });
    expect(r.recommendedCSAmm2).not.toBeNull();
    expect(r.warnings.find((w) => w.code === 'W-CR-007')).toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────
// Smoke — overall regression: a v1.3-flavoured input still produces a
// sane recommendation and respects the W-* taxonomy.
// ─────────────────────────────────────────────────────────────────────

describe('Stage B — comprehensive override + derivation smoke', () => {
  it('combines overrides, topology, neutral toggle, armour without crashing', () => {
    const r = sizeCable({
      ...BASE,
      system: { ...BASE.system, topology: '3ph4w' },
      neutralCarriesCurrent: true,
      cable: { ...BASE.cable, armourType: 'SWA' },
      overrides: { designCurrent: 50 },
    });
    expect(r.fieldStates).toBeDefined();
    expect(r.fieldStates?.designCurrent?.source).toBe('override');
    expect(r.fieldStates?.loadedConductors?.value).toBe(4);
    expect(r.fieldStates?.armourCsa).toBeDefined();
    expect(r.recommendedCSAmm2).not.toBeNull();
  });
});
