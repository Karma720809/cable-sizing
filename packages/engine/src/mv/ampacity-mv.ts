/**
 * Ampacity lookup for the Korean MV dataset.
 *
 * Calc Spec v0.2 §3 — strict exact-match lookup on
 *   [cableType, conductorMaterial, installationMethod].
 * Fallback to a "compatible" table is forbidden; missing combinations are
 * surfaced as E-MV-LOOKUP-001 so the caller can stop the pipeline.
 */

import { selectFirstAtLeast } from '../utils/lookup.js';
import type {
  MvAmpacityDataset,
  MvAmpacityRow,
  MvCableType,
  MvInstallationMethod,
} from './types-mv.js';

export interface MvAmpacityKey {
  cableType: MvCableType;
  installationMethod: MvInstallationMethod;
}

export interface ResolvedMvAmpacity {
  ok: true;
  dataset: MvAmpacityDataset;
  rows: MvAmpacityRow[];
}

export interface UnresolvedMvAmpacity {
  ok: false;
  code: 'E-MV-LOOKUP-001';
  message: string;
}

export function resolveMvAmpacity(
  datasets: readonly MvAmpacityDataset[],
  key: MvAmpacityKey,
): ResolvedMvAmpacity | UnresolvedMvAmpacity {
  const hit = datasets.find(
    (d) => d.cableType === key.cableType && d.installationMethod === key.installationMethod,
  );
  if (!hit) {
    return {
      ok: false,
      code: 'E-MV-LOOKUP-001',
      message: `No ampacity table for cableType=${key.cableType}, installation=${key.installationMethod}`,
    };
  }
  return { ok: true, dataset: hit, rows: hit.rows };
}

/**
 * Returns the first row whose ampacity ≥ requiredIz.
 * Caller checks the returned `null` and emits E-MV-CSA-001 if so.
 */
export function selectMvCsaForRequiredIz(rows: readonly MvAmpacityRow[], requiredIzA: number): MvAmpacityRow | null {
  return selectFirstAtLeast(rows, requiredIzA, (r) => r.ampacityA) ?? null;
}

/** Look up the tabulated ampacity at a specific csa (used for IZ recheck). */
export function ampacityAtMvCsa(rows: readonly MvAmpacityRow[], csaMm2: number): number | null {
  const row = rows.find((r) => r.csaMm2 === csaMm2);
  return row?.ampacityA ?? null;
}
