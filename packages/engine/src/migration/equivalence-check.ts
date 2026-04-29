/**
 * Equivalence check for migrated sizing results.
 *
 * In the `legacy_preserved` mode (Patch-1), the migrated input MUST
 * produce the exact same recommended CSA — that is the regression
 * compatibility guarantee. Any deviation, however small, is a bug and
 * is reported with `identical: false`.
 *
 * In the `recalculated` mode, the user has explicitly approved fresh
 * dataset lookups, so a small drift is expected. We allow ±1% by
 * default (per §13.1 of the design change — Golden Case tolerance).
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.6.
 */
import type { SizingResultComparison } from './types.js';

export interface EquivalenceCheckArgs {
  legacyResult: { recommendedCsaMm2: number };
  newResult: { recommendedCsaMm2: number };
  mode: 'legacy_preserved' | 'recalculated';
}

const TOLERANCE_LEGACY_PRESERVED = 0;
const TOLERANCE_RECALCULATED = 0.01;

export function checkEquivalence(args: EquivalenceCheckArgs): SizingResultComparison {
  const { legacyResult, newResult, mode } = args;
  const legacyCsa = legacyResult.recommendedCsaMm2;
  const newCsa = newResult.recommendedCsaMm2;
  const tolerance = mode === 'legacy_preserved' ? TOLERANCE_LEGACY_PRESERVED : TOLERANCE_RECALCULATED;

  // Guard divide-by-zero: a legacy result of 0 is nonsensical, but if it
  // happens we fall back to absolute equality.
  const denom = legacyCsa === 0 ? 1 : Math.abs(legacyCsa);
  const relativeDiff = Math.abs(newCsa - legacyCsa) / denom;
  const identical = relativeDiff <= tolerance;

  const base = {
    legacyRecommendedCsa: legacyCsa,
    newRecommendedCsa: newCsa,
    identical,
    toleranceUsed: tolerance,
  };
  if (identical) return base;
  return {
    ...base,
    divergenceReason:
      mode === 'legacy_preserved'
        ? 'Legacy-preserved mode requires exact match; recommended CSA changed.'
        : `Recalculated mode allows ±${(tolerance * 100).toFixed(1)}%; drift exceeded.`,
  };
}
