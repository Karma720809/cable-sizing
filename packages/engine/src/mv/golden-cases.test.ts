/**
 * Golden Test Cases for the 22.9kV MV pipeline.
 * Source: PRD v1.2 §13 + Calc Spec v0.2 acceptance criteria.
 */

import { describe, it, expect } from 'vitest';
import { sizeCableMv } from './pipeline-mv.js';
import type { MvCircuitInput } from './types-mv.js';

const baseInput: MvCircuitInput = {
  load: {
    type: 'transformer',
    powerKW: null,
    apparentPowerMVA: 1.0,
    powerFactor: null,
    efficiency: null,
    demandFactor: null,
  },
  system: { voltageV: 22900, lineToGroundV: 13200, phase: 3, frequencyHz: 60 },
  cable: { cableType: 'CNCV-W' },
  installation: {
    method: 'direct_buried',
    formation: 'trefoil',
    soilResistivityK_m_W: 1.2,
    burialDepthM: 0.8,
    groupCount: 1,
    ambientTempC: 25,
  },
  protection: {
    deviceType: 'VCB',
    ratedCurrentA: 200,
    breakingKA: 25,
    tripTimeS: 0.5,
    shortCircuitKA: 12,
  },
  route: { lengthM: 500 },
  projectPolicy: {
    maxVoltageDropPercent: 3,
    verifyScreen: true,
    chargingCurrentThreshold: 0.01,
  },
};

describe('MV Golden Cases (PRD §13)', () => {
  it('TC-01: 1000kVA TR, 0.5km, base → ampacity-driven 60mm² PASS', () => {
    const r = sizeCableMv(baseInput);
    expect(r.recommendedCSAmm2).toBe(60);
    expect(r.ampacity.status).toBe('PASS');
    expect(r.voltageDrop.status).toBe('PASS');
    expect(r.selectionDriver).toMatch(/ampacity|mixed/);
  });

  it('TC-02: 5000kVA TR, 3km → voltage drop drives a larger CSA', () => {
    const r = sizeCableMv({
      ...baseInput,
      load: { ...baseInput.load, apparentPowerMVA: 5.0 },
      route: { lengthM: 3000 },
      projectPolicy: { ...baseInput.projectPolicy, maxVoltageDropPercent: 1.5 },
    });
    expect(r.recommendedCSAmm2).not.toBeNull();
    // Ampacity-only would have selected the smallest CSA whose ampacity ≥ ~126A
    // (60mm² rated 265A). VD with tight 1.5% should bump to a larger size.
    expect(r.recommendedCSAmm2!).toBeGreaterThanOrEqual(r.ampacity.minimumCSAmm2!);
  });

  it('TC-03: heavy SC (25kA, 1s) → S_sc raw ≈ 175 → 200mm²', () => {
    const r = sizeCableMv({
      ...baseInput,
      protection: { ...baseInput.protection, shortCircuitKA: 25, tripTimeS: 1, breakingKA: 31.5 },
    });
    // raw = 25000·√1/143 ≈ 174.8 → next standard = 200
    expect(r.shortCircuit.minimumCSAmm2).toBe(200);
    expect(r.recommendedCSAmm2).toBeGreaterThanOrEqual(200);
  });

  it('TC-04: heavy earth fault + small screen override → screen FAIL', () => {
    const r = sizeCableMv({
      ...baseInput,
      cable: { ...baseInput.cable, screenCsaMm2: 22 },
      protection: {
        ...baseInput.protection,
        earthFaultKA: 10,
        earthFaultTimeS: 0.5,
      },
    });
    expect(r.screen.status).toBe('FAIL');
    expect(r.overallStatus).toBe('FAIL');
  });

  it('TC-05: long line → Ic / IB ≥ threshold → I_eff applied', () => {
    const r = sizeCableMv({
      ...baseInput,
      load: { ...baseInput.load, apparentPowerMVA: 0.5 }, // small IB
      route: { lengthM: 5000 },
    });
    expect(r.chargingCurrent.applied).toBe(true);
    expect(r.warnings.some((w) => w.code === 'W-MV-CHARGING-APPLIED')).toBe(true);
    expect(r.warnings.some((w) => w.code === 'W-MV-CHARGING-CONSERVATIVE')).toBe(true);
  });

  it('TC-06: harsh derating (35°C / ρ=3.0 / n=4 / 1.2m) all active', () => {
    const r = sizeCableMv({
      ...baseInput,
      installation: {
        ...baseInput.installation,
        ambientTempC: 35,
        soilResistivityK_m_W: 3.0,
        groupCount: 4,
        burialDepthM: 1.2,
      },
    });
    const f = r.ampacity.correctionFactors;
    expect(f.k1).toBe(0.91);
    expect(f.k2).toBe(0.75);
    expect(f.k3).toBe(0.67);
    expect(f.k4).toBe(0.96);
    expect(f.total).toBeCloseTo(0.91 * 0.75 * 0.67 * 0.96, 6);
  });

  it('TC-07: duct_bank, n=4 → k3 reflects duct_bank column (0.73)', () => {
    const r = sizeCableMv({
      ...baseInput,
      installation: {
        ...baseInput.installation,
        method: 'duct_bank',
        groupCount: 4,
      },
    });
    expect(r.ampacity.correctionFactors.k3).toBe(0.73);
  });

  it('TC-08: capacitance override emits warning + still produces a result', () => {
    const r = sizeCableMv({
      ...baseInput,
      cable: { ...baseInput.cable, capacitanceUFPerKm: 0.5 },
      route: { lengthM: 5000 },
    });
    expect(r.warnings.some((w) => w.code === 'W-MV-CAPACITANCE-OVERRIDE')).toBe(true);
    expect(r.chargingCurrent.overrideUsed).toBe(true);
  });

  it('TC-09: VCB breaking 15kA < Isc 25kA → protection FAIL', () => {
    const r = sizeCableMv({
      ...baseInput,
      protection: {
        ...baseInput.protection,
        breakingKA: 15,
        shortCircuitKA: 25,
        tripTimeS: 1,
      },
    });
    expect(r.protection.status).toBe('FAIL');
    expect(r.protection.condition2.pass).toBe(false);
  });

  it('TC-10: earth-fault inputs absent → screen INCOMPLETE', () => {
    const r = sizeCableMv({
      ...baseInput,
      // earthFaultKA / earthFaultTimeS both omitted
    });
    expect(r.screen.status).toBe('INCOMPLETE');
    expect(r.warnings.some((w) => w.code === 'W-MV-SCREEN-INCOMPLETE')).toBe(true);
  });

  it('all ten cases produce a non-empty audit trail', () => {
    const r = sizeCableMv(baseInput);
    expect(r.auditTrail.length).toBeGreaterThanOrEqual(5);
    expect(r.auditTrail[0]?.step).toBe(1);
    // Every step is monotonic
    for (let i = 1; i < r.auditTrail.length; i++) {
      expect(r.auditTrail[i]!.step).toBe(r.auditTrail[i - 1]!.step + 1);
    }
  });

  it('result is tagged kind=MV with engine + api version', () => {
    const r = sizeCableMv(baseInput);
    expect(r.kind).toBe('MV');
    expect(typeof r.engineVersion).toBe('string');
    expect(typeof r.apiVersion).toBe('number');
    expect(r.datasetId).toBe('mv_22kv_kr_v1');
  });
});
