/**
 * Correction factors k1·k2·k3 — PRD §11.2 + Stage 1 Gate correction.
 *
 *   k1 = ambient temperature factor (air or ground, insulation-specific)
 *   k2 = soil thermal-resistivity factor (ground only; for air: 1.0)
 *   k3 = grouping factor
 *
 * Lookup policy (safe-side, v0.1.1):
 *   exact key match preferred → else the neighbor whose factor is SMALLER
 *   (more derating, more conservative) → else error if the target falls
 *   outside the tabulated range. The prior "nearest lower key" policy
 *   was replaced because on monotonically-decreasing factor tables it
 *   selected the LARGER factor, which is non-conservative.
 *
 * A non-exact hit raises W-LOOKUP-SAFE-SIDE via `combined.warningCode`;
 * the audit trail records which key was actually used.
 */

import type { Dataset, InsulationType, ReferenceMethod, WarningCode } from '../../types/index.js';
import { environmentOf, groupingTableKey, soilTableKey } from './reference-methods.js';
import { exactOrSafeSide, type LookupMatchType } from '../../utils/lookup.js';

export interface CorrectionFactorHit {
  factor: number;
  matchType: LookupMatchType;
  sourceRef: string;
  keyUsed: number;
}

export interface CorrectionResolveError {
  code: 'E-LOOKUP-002';
  field: string;
  message: string;
}

export type CorrectionResolve =
  | { ok: true; hit: CorrectionFactorHit }
  | { ok: false; error: CorrectionResolveError };

// ─── k1: ambient ─────────────────────────────────────────────────────

export interface K1Input {
  method: ReferenceMethod;
  insulation: InsulationType;
  ambientTempC: number;
}

export function computeK1(dataset: Dataset, input: K1Input): CorrectionResolve {
  const env = environmentOf(input.method);
  const tblSet = env === 'air' ? dataset.corrections.ambientAir : dataset.corrections.ambientGround;
  const tbl = tblSet.tables[input.insulation];
  if (!tbl) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-002', field: 'k1', message: `ambient-${env} table missing for insulation ${input.insulation}` },
    };
  }
  const hit = exactOrSafeSide(tbl.rows, input.ambientTempC, (r) => r.ambientTempC, (r) => r.factor);
  if (!hit) {
    return {
      ok: false,
      error: {
        code: 'E-LOOKUP-002',
        field: 'k1',
        message: `ambientTempC ${input.ambientTempC}°C is outside the tabulated range for ${env}/${input.insulation}`,
      },
    };
  }
  return {
    ok: true,
    hit: { factor: hit.row.factor, matchType: hit.matchType, sourceRef: tblSet.sourceRef, keyUsed: hit.row.ambientTempC },
  };
}

// ─── k2: soil resistivity ────────────────────────────────────────────

export interface K2Input {
  method: ReferenceMethod;
  soilResistivityK_m_W: number | null;
}

/** For air methods, k2 is hard-coded to 1.0. Caller gets an "exact" hit. */
export function computeK2(dataset: Dataset, input: K2Input): CorrectionResolve {
  if (environmentOf(input.method) === 'air') {
    return { ok: true, hit: { factor: 1.0, matchType: 'exact', sourceRef: 'N/A (air method)', keyUsed: 0 } };
  }
  const soil = input.soilResistivityK_m_W;
  if (soil == null) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-002', field: 'k2', message: 'soilResistivityK_m_W is required for ground methods (D1, D2)' },
    };
  }
  const tbl = dataset.corrections.soilResistivity.tables[soilTableKey(input.method)];
  if (!tbl) {
    return { ok: false, error: { code: 'E-LOOKUP-002', field: 'k2', message: `soil table for method ${input.method} missing` } };
  }
  const hit = exactOrSafeSide(tbl.rows, soil, (r) => r.soilResistivityK_m_W, (r) => r.factor);
  if (!hit) {
    return {
      ok: false,
      error: {
        code: 'E-LOOKUP-002',
        field: 'k2',
        message: `soilResistivityK_m_W ${soil} is outside the tabulated range`,
      },
    };
  }
  return {
    ok: true,
    hit: {
      factor: hit.row.factor,
      matchType: hit.matchType,
      sourceRef: dataset.corrections.soilResistivity.sourceRef,
      keyUsed: hit.row.soilResistivityK_m_W,
    },
  };
}

// ─── k3: grouping ────────────────────────────────────────────────────

export interface K3Input {
  method: ReferenceMethod;
  groupCount: number;
}

export function computeK3(dataset: Dataset, input: K3Input): CorrectionResolve {
  if (input.groupCount < 1) {
    return { ok: false, error: { code: 'E-LOOKUP-002', field: 'k3', message: 'groupCount must be >= 1' } };
  }
  const tbl = dataset.corrections.grouping.tables[groupingTableKey(input.method)];
  if (!tbl) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-002', field: 'k3', message: `grouping table for method ${input.method} missing` },
    };
  }
  const hit = exactOrSafeSide(tbl.rows, input.groupCount, (r) => r.groupCount, (r) => r.factor);
  if (!hit) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-002', field: 'k3', message: `groupCount ${input.groupCount} is outside the tabulated range` },
    };
  }
  return {
    ok: true,
    hit: { factor: hit.row.factor, matchType: hit.matchType, sourceRef: dataset.corrections.grouping.sourceRef, keyUsed: hit.row.groupCount },
  };
}

// ─── public aggregate ───────────────────────────────────────────────

export interface CombinedCorrections {
  k1: number;
  k2: number;
  k3: number;
  total: number;
  details: {
    k1: CorrectionFactorHit;
    k2: CorrectionFactorHit;
    k3: CorrectionFactorHit;
  };
  /** W-LOOKUP-SAFE-SIDE when any factor was resolved non-exactly. */
  warningCode?: WarningCode;
}

export function computeCorrections(
  dataset: Dataset,
  input: { method: ReferenceMethod; insulation: InsulationType; ambientTempC: number; soilResistivityK_m_W: number | null; groupCount: number },
): { ok: true; combined: CombinedCorrections } | { ok: false; error: CorrectionResolveError } {
  const r1 = computeK1(dataset, { method: input.method, insulation: input.insulation, ambientTempC: input.ambientTempC });
  if (!r1.ok) return r1;
  const r2 = computeK2(dataset, { method: input.method, soilResistivityK_m_W: input.soilResistivityK_m_W });
  if (!r2.ok) return r2;
  const r3 = computeK3(dataset, { method: input.method, groupCount: input.groupCount });
  if (!r3.ok) return r3;

  const anySafeSide =
    r1.hit.matchType === 'safe-side' || r2.hit.matchType === 'safe-side' || r3.hit.matchType === 'safe-side';

  const out: CombinedCorrections = {
    k1: r1.hit.factor,
    k2: r2.hit.factor,
    k3: r3.hit.factor,
    total: r1.hit.factor * r2.hit.factor * r3.hit.factor,
    details: { k1: r1.hit, k2: r2.hit, k3: r3.hit },
    ...(anySafeSide ? { warningCode: 'W-LOOKUP-SAFE-SIDE' as WarningCode } : {}),
  };
  return { ok: true, combined: out };
}
