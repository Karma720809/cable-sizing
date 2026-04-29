/**
 * Stage 5C — temperature-corrected resistance integration tests.
 *
 * The 5C behaviour lives inside the voltage-drop scan:
 *   • `fixed_reference` (default): R comes straight from the impedance
 *     bundle at its tabulated reference temperature. No new fields
 *     populated; no new warnings.
 *   • `temperature_corrected`: R is scaled to an estimated operating
 *     temperature θ_op = θ_amb + (IB/IZ)²·(θ_max − θ_amb) via the
 *     IEC 60287-1-1 linear-α formula. New VoltageDropResult fields
 *     are populated; W-TEMP-CORRECTION-APPLIED fires once.
 *   • Ambient ≥ θ_max: fatal E-TEMP-AMBIENT-OVER-MAX, no guess.
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
  return { ...base, ...overrides } as CircuitInput;
}

describe('Stage 5C — temperature-corrected resistance', () => {
  it('fixed_reference (default): no new fields populated, no 5C warnings', () => {
    const r = sizeCable(baseInput());
    expect(r.voltageDrop.cableR_atOperatingTemp_ohm_per_km ?? null).toBeNull();
    expect(r.voltageDrop.operatingTempC ?? null).toBeNull();
    const codes = r.warnings.map((w) => w.code);
    expect(codes).not.toContain('W-TEMP-CORRECTION-APPLIED');
    expect(codes).not.toContain('W-TEMP-CORRECTION-CAPPED');
    expect(r.errors.find((e) => e.code === 'E-TEMP-AMBIENT-OVER-MAX')).toBeUndefined();
  });

  it('temperature_corrected: populates new fields and emits W-TEMP-CORRECTION-APPLIED', () => {
    const r = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: false,
          resistanceModel: 'temperature_corrected',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    expect(r.overallStatus).not.toBe('FAIL');
    expect(r.voltageDrop.operatingTempC).not.toBeNull();
    expect(r.voltageDrop.cableR_atOperatingTemp_ohm_per_km).not.toBeNull();
    // θ_op is between ambient (30 °C) and θ_max (PVC=70 °C)
    expect(r.voltageDrop.operatingTempC!).toBeGreaterThanOrEqual(30);
    expect(r.voltageDrop.operatingTempC!).toBeLessThanOrEqual(70);
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('W-TEMP-CORRECTION-APPLIED');
    // Only one instance (once-per-request)
    expect(codes.filter((c) => c === 'W-TEMP-CORRECTION-APPLIED').length).toBe(1);
  });

  it('temperature_corrected at low ambient ⇒ R_corrected < R_ref (cable runs cooler)', () => {
    // Low ambient + modest load ⇒ θ_op < θ_ref (=70°C PVC), so R drops.
    const r = sizeCable(
      baseInput({
        installation: {
          methodCode: 'C',
          ambientTempC: 10, // cool
          soilResistivityK_m_W: null,
          groupCount: 1,
        },
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: false,
          resistanceModel: 'temperature_corrected',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const rRef = r.voltageDrop.cableR_ohm_per_km;
    const rOp = r.voltageDrop.cableR_atOperatingTemp_ohm_per_km!;
    expect(rOp).toBeLessThan(rRef);
    expect(r.voltageDrop.operatingTempC!).toBeLessThan(70);
  });

  it('temperature_corrected is non-regressive vs fixed_reference under nominal inputs (same recommended csa or smaller)', () => {
    const fixed = sizeCable(baseInput());
    const corrected = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: false,
          resistanceModel: 'temperature_corrected',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    // At ambient 30 °C with modest loading, θ_op < 70 °C ⇒ corrected R is
    // smaller ⇒ ΔU% smaller ⇒ selected csa at most equal to fixed_reference.
    expect(corrected.recommendedCSAmm2).not.toBeNull();
    expect(fixed.recommendedCSAmm2).not.toBeNull();
    expect(corrected.recommendedCSAmm2!).toBeLessThanOrEqual(fixed.recommendedCSAmm2!);
  });

  it('ambient ≥ θ_max (PVC 70 °C) ⇒ fatal E-TEMP-AMBIENT-OVER-MAX', () => {
    const r = sizeCable(
      baseInput({
        installation: {
          methodCode: 'C',
          ambientTempC: 70, // == PVC rated max
          soilResistivityK_m_W: null,
          groupCount: 1,
        },
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: false,
          resistanceModel: 'temperature_corrected',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const err = r.errors.find((e) => e.code === 'E-TEMP-AMBIENT-OVER-MAX');
    expect(err).toBeDefined();
    expect(err!.fatal).toBe(true);
    // Fatal-abort paths in this pipeline collapse to INCOMPLETE (partial
    // result) rather than FAIL, matching the validation/lookup-abort shape.
    expect(['INCOMPLETE', 'FAIL']).toContain(r.overallStatus);
  });

  it('ambient ≥ θ_max does NOT fire in fixed_reference mode', () => {
    // Ambient derating is handled by k1 in fixed_reference — it may or may
    // not produce a FAIL (too-high ambient can zero out k1) but must not
    // emit the 5C-specific error.
    const r = sizeCable(
      baseInput({
        installation: {
          methodCode: 'C',
          ambientTempC: 70,
          soilResistivityK_m_W: null,
          groupCount: 1,
        },
      }),
    );
    expect(r.errors.find((e) => e.code === 'E-TEMP-AMBIENT-OVER-MAX')).toBeUndefined();
  });

  it('XLPE allows higher ambient (θ_max = 90 °C)', () => {
    // 75 °C ambient would fail PVC but pass XLPE's temperature-correction guard.
    const r = sizeCable(
      baseInput({
        cable: {
          conductorMaterial: 'Cu',
          insulationType: 'XLPE',
          coreConfiguration: '3C+N',
          cableType: 'multicore',
        },
        installation: {
          methodCode: 'C',
          ambientTempC: 75,
          soilResistivityK_m_W: null,
          groupCount: 1,
        },
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: false,
          resistanceModel: 'temperature_corrected',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    expect(r.errors.find((e) => e.code === 'E-TEMP-AMBIENT-OVER-MAX')).toBeUndefined();
  });

  it('engineVersion reports 0.12.0', () => {
    const r = sizeCable(baseInput());
    expect(r.engineVersion).toBe('0.12.0');
  });
});
