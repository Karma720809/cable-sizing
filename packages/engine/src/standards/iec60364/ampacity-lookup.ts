/**
 * Ampacity table lookup — PRD §11.2 / §14.3.
 *
 *   1. Locate the ampacity table for the (material, insulation, loadedConductors,
 *      cableType, frequency) combination — MVP dataset currently supports
 *      Cu/PVC/3-loaded/multicore/50 Hz only.
 *   2. Within that table, select the reference method sub-table.
 *   3. For a given required IZ' (= IB / k_total), return the first csa whose
 *      rated ampacity ≥ required.
 *   4. For a given csa, return the rated ampacity (used during protection recheck).
 */

import type {
  Dataset,
  ReferenceMethod,
  ConductorMaterial,
  InsulationType,
  CableType,
  FrequencyHz,
  ErrorCode,
} from '../../types/index.js';
import { selectFirstAtLeast, exactOnly } from '../../utils/lookup.js';

export interface AmpacityTableKey {
  conductorMaterial: ConductorMaterial;
  insulationType: InsulationType;
  loadedConductors: 2 | 3;
  cableType: CableType;
  frequencyHz: FrequencyHz;
  method: ReferenceMethod;
}

export interface AmpacityLookupError {
  code: ErrorCode;
  message: string;
}

/** Resolve the sub-table rows for the given key, or return an error. */
export function resolveAmpacityRows(
  dataset: Dataset,
  key: AmpacityTableKey,
):
  | { ok: true; rows: readonly { csaMm2: number; ampacityA: number }[]; tableRef: string; datasetId: string; methodRef: string }
  | { ok: false; error: AmpacityLookupError } {
  // Stage 3A: multiple ampacity datasets (Cu/PVC, Cu/XLPE, Al/PVC, Al/XLPE).
  // Find the dataset whose (material, insulation, loadedConductors, cableType, frequency) matches.
  const a = dataset.ampacity.datasets.find(
    (d) =>
      d.conductorMaterial === key.conductorMaterial &&
      d.insulationType === key.insulationType &&
      d.loadedConductors === key.loadedConductors &&
      d.cableType === key.cableType &&
      d.frequencyHz === key.frequencyHz,
  );
  if (!a) {
    const supported = dataset.ampacity.datasets
      .map((d) => `${d.conductorMaterial}/${d.insulationType}/${d.loadedConductors}L/${d.cableType}/${d.frequencyHz}Hz`)
      .join(', ');
    return {
      ok: false,
      error: {
        code: 'E-LOOKUP-001',
        message: `ampacity dataset not available for ${key.conductorMaterial}/${key.insulationType}/${key.loadedConductors}-loaded/${key.cableType}/${key.frequencyHz}Hz (bundled: ${supported})`,
      },
    };
  }

  const sub = a.tables[key.method];
  if (!sub) {
    return {
      ok: false,
      error: {
        code: 'E-LOOKUP-001',
        message: `reference method ${key.method} is not present in ampacity table ${a.id}`,
      },
    };
  }

  return {
    ok: true,
    rows: sub.rows,
    tableRef: `${a.id}/${key.method}`,
    datasetId: a.id,
    methodRef: key.method,
  };
}

/** Returns the first csa whose rated ampacity ≥ requiredIzA. */
export function selectCsaForRequiredIz(
  rows: readonly { csaMm2: number; ampacityA: number }[],
  requiredIzA: number,
): { csaMm2: number; ampacityA: number } | undefined {
  return selectFirstAtLeast(rows, requiredIzA, (r) => r.ampacityA);
}

/** Returns the tabulated rated ampacity for a specific csa (strict exact match). */
export function ampacityAtCsa(
  rows: readonly { csaMm2: number; ampacityA: number }[],
  csaMm2: number,
): number | undefined {
  return exactOnly(rows, csaMm2, (r) => r.csaMm2)?.ampacityA;
}
