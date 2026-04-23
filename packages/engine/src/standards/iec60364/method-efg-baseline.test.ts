/**
 * Post-Stage-5A baseline test — permanent negative canary.
 *
 * After 5A-Cu-E (0.5.0), 5A-Al-E (0.6.0), and 5A-SC-FG (0.7.0), all three
 * reference methods that Stage 5A was scheduled to add (E on multicore,
 * F + G on single-core) are now bundled. Positive coverage lives in:
 *   - src/data/spot-checks/method-e-cu-multicore.spot.test.ts
 *   - src/data/spot-checks/method-e-al-multicore.spot.test.ts
 *   - src/data/spot-checks/method-fg-singlecore.spot.test.ts
 *
 * What remains here is a **permanent** axis-mismatch canary: Methods F and
 * G are free-air single-core methods by definition. Asking for them with a
 * multicore cable input is a genuine axis error, not a missing dataset, and
 * must always resolve to INCOMPLETE + E-LOOKUP-001. This behaviour is a
 * design invariant — it does not flip in any future stage.
 */
import { describe, it, expect } from 'vitest';
import { sizeCable } from '../../orchestrator/pipeline.js';
import type { CircuitInput, ReferenceMethod } from '../../types/index.js';

function buildMulticoreInput(methodCode: ReferenceMethod): CircuitInput {
  return {
    load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
    system: { voltageV: 400, phase: 3, frequencyHz: 50 },
    cable: {
      conductorMaterial: 'Cu',
      insulationType: 'PVC',
      coreConfiguration: '3C+N',
      cableType: 'multicore',
    },
    installation: { methodCode, ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 1 },
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
}

describe.each(['F', 'G'] as const)(
  'axis-mismatch canary — method %s on multicore input (permanent negative)',
  (method) => {
    const res = sizeCable(buildMulticoreInput(method));

    it('returns INCOMPLETE with E-LOOKUP-001 and no recommendation', () => {
      expect(res.overallStatus).toBe('INCOMPLETE');
      expect(res.recommendedCSAmm2).toBeNull();
      const codes = res.errors.map((e) => e.code);
      expect(codes).toContain('E-LOOKUP-001');
    });
  },
);
