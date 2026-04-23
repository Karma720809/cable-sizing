/**
 * Stage 5B-IMP-INFRA + 5B-IMP — 60 Hz impedance policy.
 *
 * Engine 0.8.0 (5B-IMP-INFRA) introduced a two-axis graceful-degrade policy
 * for 60 Hz requests against a 50 Hz-only impedance bundle:
 *
 *   • Axis A  (reactance):  A-1  — degrade `useReactance` internally to
 *                                  false, emit W-REACTANCE-60HZ-DEFERRED.
 *   • Axis R  (resistance): R-a  — look up R from the 50 Hz bundle, emit
 *                                  W-RESISTANCE-50HZ-USED-AT-60HZ.
 *
 * Engine 0.9.0 (5B-IMP) shipped **native 60 Hz multicore Cu/Al bundles**
 * (R replicated from 50 Hz, X = 1.2 · X50). For those combinations the
 * fallback is retired: the pipeline uses the native 60 Hz bundle directly
 * and neither warning is emitted.
 *
 * Because the fallback check is scoped by (conductorMaterial, cableType),
 * combinations still without a native 60 Hz bundle — e.g. single-core at
 * 60 Hz (no single-core impedance data at either frequency) — keep the
 * 0.8.0 fallback semantics exactly.
 *
 * This suite locks in all three axes:
 *   1. Multicore 60 Hz → native path, no fallback warnings.
 *   2. Single-core 60 Hz → fallback path, warnings fire.
 *   3. 50 Hz requests → never touch the fallback, everywhere, forever.
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

// Single-core helper: the impedance bundle has no single-core data at any
// frequency, so both the 5B-IMP-INFRA fallback test and the pre-existing
// "single-core 60 Hz is INCOMPLETE" non-regression run through this shape.
function singleCoreOverrides() {
  return {
    cable: {
      conductorMaterial: 'Cu' as const,
      insulationType: 'PVC' as const,
      coreConfiguration: '3C+N' as const,
      cableType: 'single-core' as const,
    },
    installation: {
      methodCode: 'F' as const,
      ambientTempC: 30,
      soilResistivityK_m_W: null,
      groupCount: 1,
    },
  };
}

describe('60 Hz impedance — native path (Stage 5B-IMP)', () => {
  // Post-5B-IMP, the multicore Cu/Al 60 Hz bundles exist. The pipeline uses
  // them directly. The 5B-IMP-INFRA fallback must not fire.
  it('multicore 60 Hz + useReactance=false: no fallback warnings', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).not.toContain('W-RESISTANCE-50HZ-USED-AT-60HZ');
    expect(codes).not.toContain('W-REACTANCE-60HZ-DEFERRED');
    expect(r.overallStatus).not.toBe('INCOMPLETE');
    expect(r.errors).toEqual([]);
  });

  it('multicore 60 Hz + useReactance=true: no fallback warnings, X > 0 (native X60)', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).not.toContain('W-REACTANCE-60HZ-DEFERRED');
    expect(codes).not.toContain('W-RESISTANCE-50HZ-USED-AT-60HZ');
    expect(r.voltageDrop.cableX_ohm_per_km).toBeGreaterThan(0);
  });

  it('5B-IMP X parity: X60 ≈ 1.2 · X50 at the selected csa (useReactance=true)', () => {
    const r50 = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const r60 = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    // Force comparison at the same csa so we're reading the same row on
    // both sides. With the fixture's parameters this is the ampacity-driven
    // csa and is identical at 50/60 Hz under the 5B-AMP equivalence clause.
    expect(r60.recommendedCSAmm2).toBe(r50.recommendedCSAmm2);
    const x50 = r50.voltageDrop.cableX_ohm_per_km;
    const x60 = r60.voltageDrop.cableX_ohm_per_km;
    expect(x50).toBeGreaterThan(0);
    expect(x60).toBeGreaterThan(0);
    // 4-sig-fig rounding during dataset generation keeps tolerance loose.
    expect(Math.abs(x60 / x50 - 1.2)).toBeLessThan(5e-3);
  });

  it('5B-IMP R parity: R60 is value-for-value identical to R50 (frequency-independent)', () => {
    const r50 = sizeCable(baseInput());
    const r60 = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
      }),
    );
    expect(r60.voltageDrop.cableR_ohm_per_km).toBe(r50.voltageDrop.cableR_ohm_per_km);
  });

  // With useReactance=false, X contributes nothing and R is identical: the
  // whole voltage-drop calculation must be bit-for-bit identical at 50/60 Hz.
  it('50/60 Hz voltage-drop parity under useReactance=false (native R identical)', () => {
    const r50 = sizeCable(baseInput());
    const r60 = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
      }),
    );
    expect(r60.recommendedCSAmm2).toBe(r50.recommendedCSAmm2);
    expect(r60.voltageDrop.cableR_ohm_per_km).toBe(r50.voltageDrop.cableR_ohm_per_km);
    expect(r60.voltageDrop.calculatedDropPercent).toBe(r50.voltageDrop.calculatedDropPercent);
    expect(r60.voltageDrop.status).toBe(r50.voltageDrop.status);
  });
});

describe('60 Hz impedance — fallback path (Stage 5B-IMP-INFRA, scope: combos without native 60 Hz)', () => {
  // Post-5B-IMP, the fallback still applies to (conductorMaterial, cableType)
  // combinations with no native 60 Hz bundle. Single-core is the live case.

  it('R-a: single-core 60 Hz emits W-RESISTANCE-50HZ-USED-AT-60HZ', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        ...singleCoreOverrides(),
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-RESISTANCE-50HZ-USED-AT-60HZ')).toBe(true);
  });

  it('A-1: single-core 60 Hz + useReactance=true emits W-REACTANCE-60HZ-DEFERRED alongside R-a', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        ...singleCoreOverrides(),
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('W-RESISTANCE-50HZ-USED-AT-60HZ');
    expect(codes).toContain('W-REACTANCE-60HZ-DEFERRED');
  });

  it('single-core 60 Hz + useReactance=false emits only R-a (not A-1)', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        ...singleCoreOverrides(),
      }),
    );
    const codes = r.warnings.map((w) => w.code);
    expect(codes).toContain('W-RESISTANCE-50HZ-USED-AT-60HZ');
    expect(codes).not.toContain('W-REACTANCE-60HZ-DEFERRED');
  });

  it('each fallback warning carries a non-empty, informative message', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        ...singleCoreOverrides(),
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    const xWarn = r.warnings.find((w) => w.code === 'W-REACTANCE-60HZ-DEFERRED')!;
    const rWarn = r.warnings.find((w) => w.code === 'W-RESISTANCE-50HZ-USED-AT-60HZ')!;
    expect(xWarn.message.length).toBeGreaterThan(10);
    expect(rWarn.message.length).toBeGreaterThan(10);
    expect(rWarn.message).toMatch(/50 Hz|frequency-independent/i);
    expect(xWarn.message).toMatch(/deferred|useReactance/i);
  });

  // Single-core at 60 Hz: the fallback reroutes impedance lookup to 50 Hz,
  // but the single-core impedance bundle does not exist at 50 Hz either.
  // The end-to-end result must still be INCOMPLETE (or errored), exactly
  // as it was at 0.7.0 — the fallback does not invent impedance data.
  it('single-core 60 Hz still fails (no single-core impedance at either frequency)', () => {
    const r = sizeCable(
      baseInput({
        system: { voltageV: 400, phase: 3, frequencyHz: 60 },
        ...singleCoreOverrides(),
      }),
    );
    expect(r.warnings.some((w) => w.code === 'W-RESISTANCE-50HZ-USED-AT-60HZ')).toBe(true);
    expect(r.overallStatus === 'INCOMPLETE' || r.errors.length > 0).toBe(true);
  });
});

describe('60 Hz impedance — 50 Hz non-regression', () => {
  it('50 Hz requests (multicore) do not emit either fallback warning', () => {
    const r50off = sizeCable(baseInput());
    const r50on = sizeCable(
      baseInput({
        projectPolicy: {
          maxVoltageDropPercent: 5,
          useReactance: true,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      }),
    );
    for (const r of [r50off, r50on]) {
      const codes = r.warnings.map((w) => w.code);
      expect(codes).not.toContain('W-RESISTANCE-50HZ-USED-AT-60HZ');
      expect(codes).not.toContain('W-REACTANCE-60HZ-DEFERRED');
    }
  });
});
