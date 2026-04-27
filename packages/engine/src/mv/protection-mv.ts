/**
 * Protection coordination for the Korean MV system. Calc Spec v0.2 §8.
 *
 * Two pass/fail conditions only — the engine intentionally does NOT
 * perform relay coordination, current-graded selectivity, or arc-fault
 * studies (that's outside MVP scope). A disclaimer is always emitted
 * via W-MV-PROTECTION-DISCLAIMER.
 *
 *   Condition 1: In ≥ IB
 *   Condition 2: breakingKA ≥ availableShortCircuitKA
 */

import type { MvProtectionResult } from './types-mv.js';

export interface ProtectionMvInput {
  designCurrentA: number;
  ratedCurrentA: number | null;
  breakingKA: number | null;
  shortCircuitKA: number | null;
}

export const PROTECTION_DISCLAIMER =
  'Engine validates only In ≥ IB and breaking ≥ Isc; relay coordination and selectivity are out of scope.';

export function evaluateMvProtection(input: ProtectionMvInput): MvProtectionResult {
  const { designCurrentA, ratedCurrentA, breakingKA, shortCircuitKA } = input;

  const c1pass = ratedCurrentA != null && ratedCurrentA >= designCurrentA;
  const c2pass = breakingKA != null && shortCircuitKA != null && breakingKA >= shortCircuitKA;

  const status =
    ratedCurrentA == null || breakingKA == null || shortCircuitKA == null
      ? 'INCOMPLETE'
      : c1pass && c2pass
        ? 'PASS'
        : 'FAIL';

  return {
    condition1: {
      formula: 'In ≥ IB',
      values: { IB: designCurrentA, In: ratedCurrentA ?? Number.NaN },
      pass: c1pass,
    },
    condition2: {
      formula: 'breakingKA ≥ shortCircuitKA',
      values: {
        breakingKA: breakingKA ?? Number.NaN,
        shortCircuitKA: shortCircuitKA ?? Number.NaN,
      },
      pass: c2pass,
    },
    status,
    disclaimer: PROTECTION_DISCLAIMER,
  };
}
