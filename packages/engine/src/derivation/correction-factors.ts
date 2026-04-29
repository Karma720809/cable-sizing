/**
 * v1.3 Stage B — correction-factors derivation with FieldState provenance.
 *
 * Wraps `standards/iec60364/corrections.computeCorrections()` and produces
 * one FieldState per factor (k1·k2·k3) plus an aggregate FieldState for
 * `kTotal`. The underlying numeric logic is unchanged — Stage B only adds
 * provenance + dataset references.
 *
 * The orchestrator continues to use the existing `computeCorrections()`
 * call directly for its sizing decisions; this derivation runs alongside
 * to populate `fieldStates` in the SizingResult sidecar.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §6.3;
 *       Implementation_Spec_LV_v2.0 §3.1.
 */
import type { CircuitInput, Dataset, FieldState } from '../types/index.js';
import { FieldStateBuilder } from '../types/field-state.js';
import {
  computeCorrections,
  type CombinedCorrections,
  type CorrectionResolveError,
} from '../standards/iec60364/corrections.js';

export interface DeriveCorrectionFactorsResult {
  /** Per-factor FieldStates keyed by id. */
  fieldStates: {
    k1: FieldState<number>;
    k2: FieldState<number>;
    k3: FieldState<number>;
    kTotal: FieldState<number>;
  };
  /** Underlying combined object (for downstream consumers that need details). */
  combined: CombinedCorrections | null;
  /** Resolve error, when one of k1/k2/k3 failed lookup. */
  error?: CorrectionResolveError;
}

const DATASET_REFS = {
  k1: 'iec60364_lv_v1.corrections.ambient',
  k2: 'iec60364_lv_v1.corrections.soilResistivity',
  k3: 'iec60364_lv_v1.corrections.grouping',
} as const;

export function deriveCorrectionFactors(
  input: CircuitInput,
  dataset: Dataset,
): DeriveCorrectionFactorsResult {
  const r = computeCorrections(dataset, {
    method: input.installation.methodCode,
    insulation: input.cable.insulationType,
    ambientTempC: input.installation.ambientTempC as number,
    soilResistivityK_m_W: input.installation.soilResistivityK_m_W ?? null,
    groupCount: input.installation.groupCount as number,
  });
  if (!r.ok) {
    return {
      fieldStates: {
        k1: FieldStateBuilder.incomplete('no_dataset_match'),
        k2: FieldStateBuilder.incomplete('no_dataset_match'),
        k3: FieldStateBuilder.incomplete('no_dataset_match'),
        kTotal: FieldStateBuilder.incomplete('no_dataset_match'),
      },
      combined: null,
      error: r.error,
    };
  }
  const c = r.combined;
  return {
    fieldStates: {
      k1: FieldStateBuilder.autoDataset<number>(c.k1, DATASET_REFS.k1),
      k2: FieldStateBuilder.autoDataset<number>(c.k2, DATASET_REFS.k2),
      k3: FieldStateBuilder.autoDataset<number>(c.k3, DATASET_REFS.k3),
      kTotal: FieldStateBuilder.autoFormula<number>(c.total, 'k_total = k1·k2·k3', {
        k1: c.k1,
        k2: c.k2,
        k3: c.k3,
      }),
    },
    combined: c,
  };
}
