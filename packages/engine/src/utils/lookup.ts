/**
 * Lookup utilities (PRD §14.3 + Stage 1 Gate correction).
 *
 *   - exactOrSafeSide: the engineering-correct policy for correction-factor
 *     tables. Returns exact key match if present; otherwise, between the
 *     two adjacent neighbors (lower and upper by key), returns the one
 *     whose *factor value* is smaller — i.e. the more-derating, and
 *     therefore more conservative, choice. When the target falls outside
 *     the tabulated range (only one neighbor exists), returns undefined
 *     so the caller can raise an explicit error instead of silently
 *     extrapolating with a less-safe value.
 *
 *   - exactOnly: used for ampacity / impedance / k-value tables where
 *     the PRD mandates strict exact match.
 *
 *   - selectFirstAtLeast / nextStandardAtLeast: pick the smallest value
 *     in an ascending list that satisfies a lower bound — this is the
 *     natural safe-side for ampacity (bigger IZ is safer) and csa rounding.
 */

export type LookupMatchType = 'exact' | 'safe-side';

export interface LookupHit<T> {
  row: T;
  matchType: LookupMatchType;
}

/**
 * Safe-side neighbor lookup for correction-factor tables.
 *
 * Both `keyOf` and `valueOf` are required. `keyOf` is the x-axis
 * (ambient °C, group count, soil resistivity, …). `valueOf` is the
 * derating factor on which safe-side is decided.
 *
 * Semantics:
 *   - exact key match  → { matchType: 'exact' }
 *   - both neighbors   → return the one with the smaller factor
 *                        ({ matchType: 'safe-side' })
 *   - target out of range (only one or zero neighbors) → undefined
 */
export function exactOrSafeSide<T>(
  rows: readonly T[],
  targetKey: number,
  keyOf: (row: T) => number,
  valueOf: (row: T) => number,
): LookupHit<T> | undefined {
  let exact: T | undefined;
  let lower: T | undefined;
  let upper: T | undefined;

  for (const r of rows) {
    const k = keyOf(r);
    if (k === targetKey) {
      exact = r;
      break;
    }
    if (k < targetKey) {
      if (lower === undefined || k > keyOf(lower)) lower = r;
    } else {
      if (upper === undefined || k < keyOf(upper)) upper = r;
    }
  }

  if (exact) return { row: exact, matchType: 'exact' };
  if (lower !== undefined && upper !== undefined) {
    return { row: valueOf(lower) <= valueOf(upper) ? lower : upper, matchType: 'safe-side' };
  }
  // Out of range (target < min key or > max key): refuse to extrapolate.
  return undefined;
}

/** Strict exact-key lookup. */
export function exactOnly<T>(rows: readonly T[], target: number, keyOf: (row: T) => number): T | undefined {
  for (const r of rows) {
    if (keyOf(r) === target) return r;
  }
  return undefined;
}

/**
 * Returns the first row in an ascending list whose `valueOf(row) >= threshold`.
 * Used for "pick next standard csa ≥ required" — bigger ampacity is always safer.
 */
export function selectFirstAtLeast<T>(
  rows: readonly T[],
  threshold: number,
  valueOf: (row: T) => number,
): T | undefined {
  for (const r of rows) {
    if (valueOf(r) >= threshold) return r;
  }
  return undefined;
}

/**
 * Returns the smallest value from an ascending list that is >= threshold.
 * Used for rounding a raw csa up to the next standard size.
 */
export function nextStandardAtLeast(standardSizes: readonly number[], threshold: number): number | undefined {
  for (const s of standardSizes) {
    if (s >= threshold) return s;
  }
  return undefined;
}
