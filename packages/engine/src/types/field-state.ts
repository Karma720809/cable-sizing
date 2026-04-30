/**
 * FieldState — derived-field provenance model (LV v1.3 / Stage A).
 *
 * Each derived value (designCurrent, loadedConductors, k1·k2·k3, R, X,
 * armour CSA, …) is wrapped in a FieldState so callers can tell where
 * the number came from (auto formula, dataset lookup, user input,
 * explicit override, or a v1.x project preserved during migration) and
 * whether it is currently usable.
 *
 * The model is intentionally additive: nothing in the existing pipeline
 * is required to emit FieldState today. Stage B turns it on; Stage A
 * just lays down the shapes and a builder so call sites can adopt the
 * vocabulary one-by-one.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §4.3,
 *       §11.1; Implementation_Spec_LV_v2.0 §2.1.
 */

/**
 * Where the value came from.
 *   - auto_formula     : computed by an engine formula (e.g. I_B from P_kW)
 *   - auto_dataset     : pulled from a bundled dataset (e.g. R from impedance table)
 *   - user             : user-entered Manual field (e.g. voltage, length)
 *   - override         : user-entered value overriding an Auto field
 *   - legacy_preserved : v1.x project value preserved across migration (Patch-1)
 */
export type FieldSource =
  | 'auto_formula'
  | 'auto_dataset'
  | 'user'
  | 'override'
  | 'legacy_preserved';

/**
 * Whether the value is currently usable for sizing.
 *   - valid       : ready for use
 *   - unavailable : dataset/feature not applicable in this context
 *   - incomplete  : upstream input missing, computation skipped
 *   - invalid     : value is out of allowed range
 */
export type FieldStatus = 'valid' | 'unavailable' | 'incomplete' | 'invalid';

/**
 * Coarse reason code for non-`valid` statuses. Free-text detail goes
 * into the `warnings` array on FieldState; this is the machine-readable
 * tag UI renderers branch on.
 */
export type FieldReason =
  | 'missing_input'
  | 'no_dataset_match'
  | 'not_applicable'
  | 'out_of_range'
  | 'loaded_conductors_override_out_of_range'
  | 'armour_csa_override_must_be_positive'
  | 'missing_transformer_kva'
  | 'transformer_kva_must_be_positive'
  | 'short_circuit_current_must_be_positive'
  | 'trip_time_must_be_positive'
  | 'default_fallback'
  | 'override_applied'
  | 'legacy_preserved_no_recalc';

export interface FieldState<T = unknown> {
  source: FieldSource;
  status: FieldStatus;
  value: T | null;
  reason?: FieldReason;
  /** Identifier of the formula used (e.g. 'IB_3PH_KW'). auto_formula only. */
  formula?: string;
  /** Snapshot of upstream inputs used to derive `value`. */
  inputs?: Record<string, unknown>;
  /** Dataset entry reference (e.g. 'iec60364_lv_v1.impedance.cuMulticore50'). */
  datasetRef?: string;
  /** ISO-8601 timestamp the override was applied (override only). */
  overriddenAt?: string;
  /** Free-text warnings/notes specific to this field. */
  warnings?: string[];
}

/**
 * Single entry in {@link AuditStep.derivedFields}. Lets a pipeline step
 * record the provenance of one or more derived values without polluting
 * the existing `inputs/intermediateValues` payload.
 */
export interface DerivedFieldRecord {
  /** Stable id, e.g. 'designCurrent', 'k1', 'armourCsaMm2'. */
  fieldId: string;
  state: FieldState;
  description?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Info channel (parallels Warning/Error). New in 0.12.0-stage-a so
// I-CR-001 has a home that does not pollute the warnings array.
// ─────────────────────────────────────────────────────────────────────

/**
 * Informational message codes. Strictly additive — non-blocking,
 * non-warning, non-error. Surfaced in {@link SizingResult.info}.
 */
export type InfoCode =
  /** Neutral-carries-current toggle promoted loadedConductors from 3 to 4. */
  | 'I-CR-001';

export interface InfoMessage {
  code: InfoCode;
  message: string;
  field?: string;
}

// ─────────────────────────────────────────────────────────────────────
// Builder — keeps call sites terse and consistent.
// ─────────────────────────────────────────────────────────────────────

/**
 * Builders for the six well-defined FieldState shapes. Use these instead
 * of constructing FieldState literals — the builders enforce that
 * `source`/`status` combinations stay in the documented quadrants.
 */
export const FieldStateBuilder = {
  autoFormula<T>(value: T, formula: string, inputs: Record<string, unknown>): FieldState<T> {
    return { source: 'auto_formula', status: 'valid', value, formula, inputs };
  },
  autoDataset<T>(value: T, datasetRef: string): FieldState<T> {
    return { source: 'auto_dataset', status: 'valid', value, datasetRef };
  },
  user<T>(value: T): FieldState<T> {
    return { source: 'user', status: 'valid', value };
  },
  override<T>(value: T, overriddenAt?: string): FieldState<T> {
    return {
      source: 'override',
      status: 'valid',
      value,
      reason: 'override_applied',
      ...(overriddenAt ? { overriddenAt } : {}),
    };
  },
  legacyPreserved<T>(value: T): FieldState<T> {
    return {
      source: 'legacy_preserved',
      status: 'valid',
      value,
      reason: 'legacy_preserved_no_recalc',
    };
  },
  incomplete(reason: FieldReason = 'missing_input'): FieldState<never> {
    return { source: 'auto_formula', status: 'incomplete', value: null, reason };
  },
  unavailable(reason: FieldReason = 'not_applicable'): FieldState<never> {
    return { source: 'auto_dataset', status: 'unavailable', value: null, reason };
  },
  invalid<T>(
    source: FieldSource,
    reason: FieldReason = 'out_of_range',
    opts?: { formula?: string; inputs?: Record<string, unknown> },
  ): FieldState<T> {
    return {
      source,
      status: 'invalid',
      value: null,
      reason,
      ...(opts?.formula ? { formula: opts.formula } : {}),
      ...(opts?.inputs ? { inputs: opts.inputs } : {}),
    };
  },
};
