/**
 * Golden 12 — canonical regression set for sizeCable().
 *
 * Each case is a table-driven fixture with hand-reasoned expectations.
 * IB values are verified to 2 decimals against the closed-form formula:
 *
 *   3ϕ: IB = (P · 1000) / (√3 · V · cosφ · η) · df
 *
 * Recommended csa values are the outcome of the full 10-step pipeline
 * (ampacity / vdrop / SC / IZ-recheck / protection). CSA is asserted to
 * an exact standard size when the dominant criterion is unambiguous, or
 * to a lower-bound inequality when multiple criteria compete.
 *
 * MVP dataset limits:
 *   ampacity     = Cu / PVC / 3-loaded / multicore / 50 Hz (methods A1/A2/B1/B2/C/D1/D2)
 *   impedance    = Cu / multicore / 50 Hz (PVC + XLPE)
 *   k-values     = all 4 combinations
 */

import { describe, it, expect } from 'vitest';
import { sizeCable } from './pipeline.js';
import type { CircuitInput, WarningCode, ErrorCode } from '../types/index.js';

type Expected = {
  designCurrentA?: number;
  overallStatus: 'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE';
  recommendedCSAmm2?: number | null;
  recommendedCSAmm2AtLeast?: number;
  recommendedCSAmm2AtMost?: number;
  includesWarning?: WarningCode[];
  excludesWarning?: WarningCode[];
  includesError?: ErrorCode[];
};

type Case = { id: string; description: string; input: CircuitInput; expected: Expected };

function mkInput(over: Partial<CircuitInput['load']> = {}, rest: Partial<CircuitInput> = {}): CircuitInput {
  return {
    load: {
      type: 'general',
      powerKW: 25,
      powerFactor: 0.85,
      efficiency: 0.9,
      demandFactor: 1.0,
      ...over,
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
    ...rest,
  };
}

const cases: Case[] = [
  // ── TC-001 — simple air-borne 25 kW, method C, short run ─────────────
  {
    id: 'TC-001',
    description: '25 kW / 400 V / 3ϕ / method C / L=50 m / Isc=10 kA — SC-dominant',
    input: mkInput(),
    expected: {
      designCurrentA: 47.17,
      overallStatus: 'PASS',
      recommendedCSAmm2: 35, // SC governs (S_min≈27.5 → next=35)
    },
  },
  // ── TC-002 — vdrop-dominant long-run 50 kW ground/D1 ────────────────
  {
    id: 'TC-002',
    description: '50 kW / 400 V / 3ϕ / method D1 / L=250 m / soil=2.5 / maxDrop=3%',
    input: mkInput(
      { powerKW: 50 },
      {
        installation: { methodCode: 'D1', ambientTempC: 20, soilResistivityK_m_W: 2.5, groupCount: 1 },
        route: { lengthM: 250 },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 100,
          operatingCurrentI2A: 145,
          tripTimeS: 0.1,
          shortCircuitKA: 0, // skip SC
        },
        projectPolicy: {
          maxVoltageDropPercent: 3,
          useReactance: false,
          resistanceModel: 'fixed_reference',
          roundingPolicy: 'next_standard_csa',
        },
      },
    ),
    expected: {
      designCurrentA: 94.34,
      overallStatus: 'PASS',
      recommendedCSAmm2: 70, // vdrop needs 70 mm²
    },
  },
  // ── TC-003 — short-circuit dominated: small load, 22 kA bolt ───────
  {
    id: 'TC-003',
    description: '5 kW / 400 V / L=20 m / Isc=22 kA t=0.1 s — SC governs',
    input: mkInput(
      { powerKW: 5 },
      {
        route: { lengthM: 20 },
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 20,
          operatingCurrentI2A: 29,
          tripTimeS: 0.1,
          shortCircuitKA: 22,
        },
      },
    ),
    expected: {
      designCurrentA: 9.43,
      overallStatus: 'PASS',
      recommendedCSAmm2: 70, // S_min = 22000·√0.1/115 ≈ 60.5 → 70
    },
  },
  // ── TC-004 — D1 ground method, k2 exact @ 2.5 ───────────────────────
  {
    id: 'TC-004',
    description: 'D1 ground / soil 2.5 (base) / all exact factors',
    input: mkInput(
      { powerKW: 25 },
      {
        installation: { methodCode: 'D1', ambientTempC: 20, soilResistivityK_m_W: 2.5, groupCount: 1 },
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 63,
          operatingCurrentI2A: 91.35,
          tripTimeS: 0.1,
          shortCircuitKA: 6,
        },
      },
    ),
    expected: {
      designCurrentA: 47.17,
      overallStatus: 'PASS',
      recommendedCSAmm2AtLeast: 10,
      excludesWarning: ['W-LOOKUP-SAFE-SIDE'],
    },
  },
  // ── TC-005 — high ambient 40°C exact ────────────────────────────────
  {
    id: 'TC-005',
    description: 'Ambient 40°C (exact) — derating 0.87 on PVC',
    input: mkInput(
      { powerKW: 25 },
      {
        installation: { methodCode: 'C', ambientTempC: 40, soilResistivityK_m_W: null, groupCount: 1 },
      },
    ),
    expected: {
      designCurrentA: 47.17,
      overallStatus: 'PASS',
      excludesWarning: ['W-LOOKUP-SAFE-SIDE'], // 40°C is a tabulated key
      recommendedCSAmm2AtLeast: 10,
    },
  },
  // ── TC-006 — grouping factor @ count 6 exact ───────────────────────
  {
    id: 'TC-006',
    description: 'Method C, groupCount=6 → k3 exact lookup',
    input: mkInput(
      { powerKW: 25 },
      {
        installation: { methodCode: 'C', ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 6 },
      },
    ),
    expected: {
      designCurrentA: 47.17,
      overallStatus: 'PASS',
      excludesWarning: ['W-LOOKUP-SAFE-SIDE'],
    },
  },
  // ── TC-007 — IB override path (OQ-5) ────────────────────────────────
  {
    id: 'TC-007',
    description: 'designCurrentOverrideA bypasses load calc',
    input: mkInput(
      { powerKW: null, powerFactor: null, efficiency: null, demandFactor: null, designCurrentOverrideA: 80 },
      {
        protection: {
          deviceType: 'MCCB',
          ratedCurrentA: 100,
          operatingCurrentI2A: 145,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      },
    ),
    expected: {
      designCurrentA: 80,
      overallStatus: 'WARNING',
      includesWarning: ['W-IB-OVERRIDE'],
    },
  },
  // ── TC-008 — all defaults applied ───────────────────────────────────
  {
    id: 'TC-008',
    description: 'PF/η/df/ambient/group all null → defaults resolver fills',
    input: mkInput(
      { powerKW: 25, powerFactor: null, efficiency: null, demandFactor: null },
      {
        installation: { methodCode: 'C', ambientTempC: null, soilResistivityK_m_W: null, groupCount: null },
      },
    ),
    expected: {
      overallStatus: 'WARNING',
      includesWarning: ['W-DEFAULT-APPLIED'],
    },
  },
  // ── TC-009 — I2 missing → INCOMPLETE ────────────────────────────────
  {
    id: 'TC-009',
    description: 'operatingCurrentI2A omitted → W-I2-MISSING',
    input: mkInput(
      { powerKW: 25 },
      {
        protection: {
          deviceType: 'MCB',
          ratedCurrentA: 50,
          tripTimeS: 0.1,
          shortCircuitKA: 10,
        },
      },
    ),
    expected: {
      overallStatus: 'INCOMPLETE',
      includesWarning: ['W-I2-MISSING'],
    },
  },
  // ── TC-010 — validation error E-VAL-002 ────────────────────────────
  {
    id: 'TC-010',
    description: 'powerFactor = 1.2 → E-VAL-002',
    input: mkInput({ powerFactor: 1.2 }),
    expected: {
      overallStatus: 'INCOMPLETE',
      includesError: ['E-VAL-002'],
    },
  },
  // ── TC-011 — unsupported dataset (single-core) → E-LOOKUP-001 ───────
  {
    id: 'TC-011',
    description: 'single-core cable not yet bundled → E-LOOKUP-001',
    input: mkInput(
      { powerKW: 25 },
      {
        cable: {
          conductorMaterial: 'Cu',
          insulationType: 'PVC',
          coreConfiguration: '3C+N',
          cableType: 'single-core',
        },
      },
    ),
    expected: {
      overallStatus: 'INCOMPLETE',
      includesError: ['E-LOOKUP-001'],
    },
  },
  // ── TC-012 — safe-side correction factor ────────────────────────────
  {
    id: 'TC-012',
    description: 'Ambient 33°C (between 30 and 35) → W-LOOKUP-SAFE-SIDE',
    input: mkInput(
      { powerKW: 25 },
      {
        installation: { methodCode: 'C', ambientTempC: 33, soilResistivityK_m_W: null, groupCount: 1 },
      },
    ),
    expected: {
      overallStatus: 'WARNING',
      includesWarning: ['W-LOOKUP-SAFE-SIDE'],
    },
  },
];

describe('Golden 12 — end-to-end regression', () => {
  it.each(cases)('$id — $description', ({ expected, input }) => {
    const r = sizeCable(input);

    if (expected.designCurrentA != null) {
      expect(r.designCurrentA).toBeCloseTo(expected.designCurrentA, 1);
    }
    expect(r.overallStatus).toBe(expected.overallStatus);

    if (expected.recommendedCSAmm2 !== undefined) {
      expect(r.recommendedCSAmm2).toBe(expected.recommendedCSAmm2);
    }
    if (expected.recommendedCSAmm2AtLeast != null) {
      expect(r.recommendedCSAmm2).not.toBeNull();
      expect(r.recommendedCSAmm2!).toBeGreaterThanOrEqual(expected.recommendedCSAmm2AtLeast);
    }
    if (expected.recommendedCSAmm2AtMost != null) {
      expect(r.recommendedCSAmm2!).toBeLessThanOrEqual(expected.recommendedCSAmm2AtMost);
    }
    for (const w of expected.includesWarning ?? []) {
      expect(r.warnings.map((x) => x.code)).toContain(w);
    }
    for (const w of expected.excludesWarning ?? []) {
      expect(r.warnings.map((x) => x.code)).not.toContain(w);
    }
    for (const e of expected.includesError ?? []) {
      expect(r.errors.map((x) => x.code)).toContain(e);
    }
  });

  it('engineVersion and datasetId are populated on every case', () => {
    for (const c of cases) {
      const r = sizeCable(c.input);
      expect(r.engineVersion).toMatch(/^\d+\.\d+\.\d+/);
      expect(r.datasetId.length).toBeGreaterThan(0);
    }
  });
});
