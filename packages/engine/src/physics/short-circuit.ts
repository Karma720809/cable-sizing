/**
 * Short-circuit withstand (adiabatic) — PRD §11.5.
 *
 *   S_min = (Isc × √t) / k
 *
 * Returns the raw required CSA in mm². Caller rounds up to the next
 * standard size.
 */

import Decimal from 'decimal.js';

export interface ShortCircuitInput {
  /** Prospective short-circuit current (A). */
  shortCircuitA: number;
  /** Protection clearing time (s). */
  tripTimeS: number;
  /** k constant (material/insulation dependent, IEC 60364-5-54). */
  kValue: number;
}

export interface ShortCircuitBreakdown {
  requiredCSARaw: number;
  intermediate: {
    sqrtT: number;
  };
}

export function shortCircuitCSA(input: ShortCircuitInput): ShortCircuitBreakdown {
  const { shortCircuitA, tripTimeS, kValue } = input;
  if (shortCircuitA <= 0) throw new Error('shortCircuitA must be > 0');
  if (tripTimeS <= 0) throw new Error('tripTimeS must be > 0');
  if (kValue <= 0) throw new Error('kValue must be > 0');

  const sqrtT = new Decimal(tripTimeS).sqrt();
  const s = new Decimal(shortCircuitA).mul(sqrtT).div(kValue);

  return {
    requiredCSARaw: s.toNumber(),
    intermediate: { sqrtT: sqrtT.toNumber() },
  };
}
