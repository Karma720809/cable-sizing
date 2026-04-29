/**
 * MIG-TC-04 — sizing-result equivalence (Patch-1 guarantee).
 *
 * legacy_preserved mode: 0% tolerance — exact recommended CSA match.
 * recalculated mode:    ±1% tolerance.
 */
import { describe, it, expect } from 'vitest';
import { checkEquivalence } from './equivalence-check.js';

describe('MIG-TC-04: checkEquivalence', () => {
  it('legacy_preserved mode marks identical when values match exactly', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 95 },
      newResult: { recommendedCsaMm2: 95 },
      mode: 'legacy_preserved',
    });
    expect(r.identical).toBe(true);
    expect(r.toleranceUsed).toBe(0);
    expect(r.divergenceReason).toBeUndefined();
  });

  it('legacy_preserved mode flags any drift, even tiny', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 95 },
      newResult: { recommendedCsaMm2: 95.0001 },
      mode: 'legacy_preserved',
    });
    expect(r.identical).toBe(false);
    expect(r.divergenceReason).toContain('exact match');
  });

  it('recalculated mode permits ±1%', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 100 },
      newResult: { recommendedCsaMm2: 100.5 }, // 0.5% drift
      mode: 'recalculated',
    });
    expect(r.identical).toBe(true);
    expect(r.toleranceUsed).toBeCloseTo(0.01, 6);
  });

  it('recalculated mode rejects beyond ±1%', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 100 },
      newResult: { recommendedCsaMm2: 102 }, // 2% drift
      mode: 'recalculated',
    });
    expect(r.identical).toBe(false);
    expect(r.divergenceReason).toContain('1.0%');
  });

  it('reports both legacy and new CSA in the comparison', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 70 },
      newResult: { recommendedCsaMm2: 95 },
      mode: 'legacy_preserved',
    });
    expect(r.legacyRecommendedCsa).toBe(70);
    expect(r.newRecommendedCsa).toBe(95);
  });

  it('handles zero legacy CSA without dividing by zero', () => {
    const r = checkEquivalence({
      legacyResult: { recommendedCsaMm2: 0 },
      newResult: { recommendedCsaMm2: 0 },
      mode: 'legacy_preserved',
    });
    expect(r.identical).toBe(true);
  });
});
