/**
 * Short-circuit k-constant lookup — PRD §11.5 / §14.3.
 *
 *   Exact match on (conductorMaterial, insulationType).
 */

import type { Dataset, ConductorMaterial, InsulationType, ErrorCode } from '../../types/index.js';

export interface KValueHit {
  kValue: number;
  initialTempC: number;
  finalTempC: number;
  sourceRef: string;
}

export interface KValueLookupError {
  code: ErrorCode;
  message: string;
}

export function lookupKValue(
  dataset: Dataset,
  material: ConductorMaterial,
  insulation: InsulationType,
): { ok: true; hit: KValueHit } | { ok: false; error: KValueLookupError } {
  const hit = dataset.shortCircuit.kValues.values.find(
    (v) => v.conductorMaterial === material && v.insulationType === insulation,
  );
  if (!hit) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-004', message: `k value not found for ${material}/${insulation}` },
    };
  }
  return {
    ok: true,
    hit: {
      kValue: hit.kValue,
      initialTempC: hit.initialTempC,
      finalTempC: hit.finalTempC,
      sourceRef: dataset.shortCircuit.kValues.sourceRef,
    },
  };
}
