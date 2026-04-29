/**
 * Patch-1: correction factor preservation policy.
 *
 * Decision matrix (§12.3.1):
 *
 *   legacy k absent          → null  (no action)
 *   legacy k present, sufficientInputs=false, *           → legacy_preserved
 *   legacy k present, sufficientInputs=true,  approved=false → legacy_preserved
 *   legacy k present, sufficientInputs=true,  approved=true  → recalculate (auto_dataset)
 *
 * The policy is responsible for *deciding which value wins*, not for
 * computing the dataset value — that is delegated to a `recalculate()`
 * callback the caller wires up. Keeps this module decoupled from the
 * actual correction-factor lookup logic.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.3.
 */
import type { FieldState } from '../types/field-state.js';
import { FieldStateBuilder } from '../types/field-state.js';

export interface LegacyKValues {
  k1?: number;
  k2?: number;
  k3?: number;
  kTotal?: number;
}

export interface CorrectionFactorBundle {
  k1: number;
  k2: number;
  kTotal: number;
}

export interface ApplyPolicyArgs {
  legacyKValues?: LegacyKValues;
  /**
   * True when the migrated input carries enough installation conditions
   * (ambientTemp, groupCount, soilResistivity if underground, etc.) for
   * a fresh dataset-based lookup to be possible.
   */
  sufficientInputsForRecalc: boolean;
  /**
   * True when the user has explicitly approved replacing the legacy
   * factors with dataset recalculation in the migration preview UI.
   */
  userApproved: boolean;
  /**
   * Caller-supplied dataset lookup. Only invoked when both
   * `sufficientInputsForRecalc` and `userApproved` are true.
   */
  recalculate: () => CorrectionFactorBundle;
}

/** True iff at least one legacy k value is present and finite. */
function hasAnyLegacyK(k?: LegacyKValues): k is LegacyKValues {
  if (!k) return false;
  return (
    Number.isFinite(k.k1) ||
    Number.isFinite(k.k2) ||
    Number.isFinite(k.k3) ||
    Number.isFinite(k.kTotal)
  );
}

/** Compute kTotal from parts if not directly given. */
function deriveKTotal(k: LegacyKValues): number {
  if (Number.isFinite(k.kTotal)) return k.kTotal as number;
  const k1 = Number.isFinite(k.k1) ? (k.k1 as number) : 1;
  const k2 = Number.isFinite(k.k2) ? (k.k2 as number) : 1;
  const k3 = Number.isFinite(k.k3) ? (k.k3 as number) : 1;
  return k1 * k2 * k3;
}

/**
 * Resolve the post-migration correction-factor FieldState, or `null`
 * when the legacy project carried no directly-entered correction
 * factors (in which case the standard derivation flow runs).
 */
export function applyCorrectionFactorPolicy(
  args: ApplyPolicyArgs,
): FieldState<CorrectionFactorBundle> | null {
  const { legacyKValues, sufficientInputsForRecalc, userApproved, recalculate } = args;

  if (!hasAnyLegacyK(legacyKValues)) return null;

  const legacyTotal = deriveKTotal(legacyKValues);
  const legacyBundle: CorrectionFactorBundle = {
    k1: Number.isFinite(legacyKValues.k1) ? (legacyKValues.k1 as number) : 1,
    k2: Number.isFinite(legacyKValues.k2) ? (legacyKValues.k2 as number) : 1,
    kTotal: legacyTotal,
  };

  if (sufficientInputsForRecalc && userApproved) {
    const fresh = recalculate();
    return FieldStateBuilder.autoDataset(fresh, 'iec60364_lv_v1.corrections.<recalculated>');
  }

  return FieldStateBuilder.legacyPreserved(legacyBundle);
}
