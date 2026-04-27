/**
 * Conservative correction-factor lookup for the Korean MV dataset.
 *
 * Calc Spec v0.2 §4 — for every k1·k2·k3·k4 lookup the engine selects the
 * tabulated row whose key is **the smallest value greater than or equal to**
 * the user input (i.e. always rounds the input toward harsher conditions).
 * If the user input exceeds the table's last row, the engine returns a
 * fatal error rather than extrapolating.
 *
 * Inputs that fall *below* the first row use the first row as a safe-side
 * neighbor with a W-MV-LOOKUP-SAFE-SIDE warning — the resulting factor is
 * conservative because the table is monotonically larger toward harsher
 * conditions.
 */

import type {
  MvAmbientFactorDataset,
  MvBurialDepthFactorDataset,
  MvCorrectionFactors,
  MvErrorCode,
  MvGroupingFactorDataset,
  MvInstallationMethod,
  MvSoilFactorDataset,
} from './types-mv.js';

export interface CorrectionLookupOk<T> {
  ok: true;
  /** The factor returned. */
  factor: number;
  /** Whether the lookup was an exact key hit or a conservative neighbor. */
  matchType: 'exact' | 'safe-side';
  /** The matched row (passed back so callers can audit with full detail). */
  row: T;
}

export interface CorrectionLookupErr {
  ok: false;
  code: MvErrorCode;
  message: string;
  inputValue: number;
  /** The maximum (or minimum) tabulated key, when relevant. */
  bound: number;
}

export type CorrectionLookup<T> = CorrectionLookupOk<T> | CorrectionLookupErr;

// ─────────────────────────────────────────────────────────────────────
// Generic conservative lookup
// ─────────────────────────────────────────────────────────────────────

interface ConservativeOpts<T> {
  rows: readonly T[];
  input: number;
  keyOf: (row: T) => number;
  factorOf: (row: T) => number;
  outOfRangeCode: MvErrorCode;
  contextLabel: string;
}

function conservativeLookup<T>(opts: ConservativeOpts<T>): CorrectionLookup<T> {
  const { rows, input, keyOf, factorOf, outOfRangeCode, contextLabel } = opts;
  if (rows.length === 0) {
    return {
      ok: false,
      code: outOfRangeCode,
      message: `${contextLabel}: empty table`,
      inputValue: input,
      bound: Number.NaN,
    };
  }
  const sorted = [...rows].sort((a, b) => keyOf(a) - keyOf(b));
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  if (input > keyOf(last)) {
    return {
      ok: false,
      code: outOfRangeCode,
      message: `${contextLabel}: input ${input} exceeds tabulated max ${keyOf(last)}`,
      inputValue: input,
      bound: keyOf(last),
    };
  }

  // Below-range input → use the first (most-derating-side) row with safe-side flag.
  if (input < keyOf(first)) {
    return { ok: true, factor: factorOf(first), matchType: 'safe-side', row: first };
  }

  // Otherwise pick the first row with key ≥ input (rounds toward harsher conditions).
  for (const r of sorted) {
    if (keyOf(r) === input) return { ok: true, factor: factorOf(r), matchType: 'exact', row: r };
    if (keyOf(r) > input) return { ok: true, factor: factorOf(r), matchType: 'safe-side', row: r };
  }
  // Defensive — should be unreachable because of the >last check above.
  /* c8 ignore next */
  return { ok: true, factor: factorOf(last), matchType: 'safe-side', row: last };
}

// ─────────────────────────────────────────────────────────────────────
// k1 — ground temperature
// ─────────────────────────────────────────────────────────────────────

export function lookupK1(
  ds: MvAmbientFactorDataset,
  ambientTempC: number,
): CorrectionLookup<{ ambientTempC: number; factor: number }> {
  return conservativeLookup({
    rows: ds.rows,
    input: ambientTempC,
    keyOf: (r) => r.ambientTempC,
    factorOf: (r) => r.factor,
    outOfRangeCode: 'E-MV-LOOKUP-006',
    contextLabel: 'k1 (ground temperature)',
  });
}

// ─────────────────────────────────────────────────────────────────────
// k2 — soil thermal resistivity
// ─────────────────────────────────────────────────────────────────────

export function lookupK2(
  ds: MvSoilFactorDataset,
  soilResistivityK_m_W: number,
): CorrectionLookup<{ soilResistivityK_m_W: number; factor: number }> {
  return conservativeLookup({
    rows: ds.rows,
    input: soilResistivityK_m_W,
    keyOf: (r) => r.soilResistivityK_m_W,
    factorOf: (r) => r.factor,
    outOfRangeCode: 'E-MV-LOOKUP-007',
    contextLabel: 'k2 (soil resistivity)',
  });
}

// ─────────────────────────────────────────────────────────────────────
// k3 — grouping (column varies by installation method)
// ─────────────────────────────────────────────────────────────────────

export function lookupK3(
  ds: MvGroupingFactorDataset,
  installation: MvInstallationMethod,
  groupCount: number,
): CorrectionLookup<{ groupCount: number; factor: number }> {
  if (groupCount < 1 || !Number.isFinite(groupCount)) {
    return {
      ok: false,
      code: 'E-MV-LOOKUP-005',
      message: `k3 (grouping): groupCount must be ≥ 1 (got ${groupCount})`,
      inputValue: groupCount,
      bound: 1,
    };
  }
  // Project per-method column into the standard {key,factor} shape.
  const projected = ds.rows.map((r) => ({ groupCount: r.groupCount, factor: r[installation] }));
  return conservativeLookup({
    rows: projected,
    input: groupCount,
    keyOf: (r) => r.groupCount,
    factorOf: (r) => r.factor,
    outOfRangeCode: 'E-MV-LOOKUP-005',
    contextLabel: `k3 (grouping, ${installation})`,
  });
}

// ─────────────────────────────────────────────────────────────────────
// k4 — burial depth (only meaningful for direct_buried)
// ─────────────────────────────────────────────────────────────────────

export function lookupK4(
  ds: MvBurialDepthFactorDataset,
  burialDepthM: number,
): CorrectionLookup<{ burialDepth_m: number; factor: number }> {
  return conservativeLookup({
    rows: ds.rows,
    input: burialDepthM,
    keyOf: (r) => r.burialDepth_m,
    factorOf: (r) => r.factor,
    outOfRangeCode: 'E-MV-LOOKUP-008',
    contextLabel: 'k4 (burial depth)',
  });
}

// ─────────────────────────────────────────────────────────────────────
// Aggregate
// ─────────────────────────────────────────────────────────────────────

export interface MvCorrectionInputs {
  ambientTempC: number;
  soilResistivityK_m_W: number;
  groupCount: number;
  burialDepthM: number;
  installation: MvInstallationMethod;
}

export interface ComputeCorrectionsResult {
  ok: boolean;
  factors: MvCorrectionFactors;
  /** Errors (out-of-range conditions). When non-empty `ok=false`. */
  errors: Array<{ code: MvErrorCode; message: string; field: string }>;
  /** Per-factor audit detail. */
  detail: {
    k1: { factor: number; matchType: 'exact' | 'safe-side'; sourceRow: unknown };
    k2: { factor: number; matchType: 'exact' | 'safe-side'; sourceRow: unknown };
    k3: { factor: number; matchType: 'exact' | 'safe-side'; sourceRow: unknown };
    k4: { factor: number; matchType: 'exact' | 'safe-side'; sourceRow: unknown };
  };
}

export function computeMvCorrections(
  ds: {
    ambientGround: MvAmbientFactorDataset;
    soilResistivity: MvSoilFactorDataset;
    grouping: MvGroupingFactorDataset;
    burialDepth: MvBurialDepthFactorDataset;
  },
  inputs: MvCorrectionInputs,
): ComputeCorrectionsResult {
  const { ambientTempC, soilResistivityK_m_W, groupCount, burialDepthM, installation } = inputs;

  const r1 = lookupK1(ds.ambientGround, ambientTempC);
  const r2 = lookupK2(ds.soilResistivity, soilResistivityK_m_W);
  const r3 = lookupK3(ds.grouping, installation, groupCount);
  // k4 only applies for direct_buried; otherwise we use 1.0 (no derating).
  const r4: CorrectionLookup<{ burialDepth_m: number; factor: number }> =
    installation === 'direct_buried'
      ? lookupK4(ds.burialDepth, burialDepthM)
      : { ok: true, factor: 1.0, matchType: 'exact', row: { burialDepth_m: burialDepthM, factor: 1.0 } };

  const errors: ComputeCorrectionsResult['errors'] = [];
  if (!r1.ok) errors.push({ code: r1.code, message: r1.message, field: 'installation.ambientTempC' });
  if (!r2.ok) errors.push({ code: r2.code, message: r2.message, field: 'installation.soilResistivityK_m_W' });
  if (!r3.ok) errors.push({ code: r3.code, message: r3.message, field: 'installation.groupCount' });
  if (!r4.ok) errors.push({ code: r4.code, message: r4.message, field: 'installation.burialDepthM' });

  const f1 = r1.ok ? r1.factor : 1;
  const f2 = r2.ok ? r2.factor : 1;
  const f3 = r3.ok ? r3.factor : 1;
  const f4 = r4.ok ? r4.factor : 1;

  // Lookup policy is "exact" only when every active lookup matched exactly.
  const allExact = (r1.ok && r1.matchType === 'exact')
    && (r2.ok && r2.matchType === 'exact')
    && (r3.ok && r3.matchType === 'exact')
    && (r4.ok && r4.matchType === 'exact');

  return {
    ok: errors.length === 0,
    factors: {
      k1: f1,
      k2: f2,
      k3: f3,
      k4: f4,
      total: f1 * f2 * f3 * f4,
      lookupPolicy: allExact ? 'exact' : 'safe-side',
    },
    errors,
    detail: {
      k1: { factor: f1, matchType: r1.ok ? r1.matchType : 'safe-side', sourceRow: r1.ok ? r1.row : null },
      k2: { factor: f2, matchType: r2.ok ? r2.matchType : 'safe-side', sourceRow: r2.ok ? r2.row : null },
      k3: { factor: f3, matchType: r3.ok ? r3.matchType : 'safe-side', sourceRow: r3.ok ? r3.row : null },
      k4: { factor: f4, matchType: r4.ok ? r4.matchType : 'safe-side', sourceRow: r4.ok ? r4.row : null },
    },
  };
}
