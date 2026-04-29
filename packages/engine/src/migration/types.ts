/**
 * Migration types — v1.x → v1.5 project conversion (LV input automation v1.3).
 *
 * Pure types, no runtime behavior. Stage A ships these alongside the
 * five policy helpers (sourceMapping, correctionFactorPolicy,
 * discardedFields, equivalenceCheck, migrateLegacyInput) so a future
 * storage feature can drive migration without re-deriving the contract.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12;
 *       Implementation_Spec_LV_v2.0 §2.5.
 */
import type { FieldSource } from '../types/field-state.js';

/**
 * Opaque legacy v1.x project payload. We never strongly-type the legacy
 * shape — projects from older versions may contain unknown keys, and the
 * migration helpers must be robust to that. Use `Record<string, unknown>`
 * at call sites and let the helpers narrow.
 */
export type LegacyInput = Record<string, unknown>;

export interface MigrationFieldChange {
  fieldId: string;
  legacyValue: unknown;
  newSource: FieldSource;
  newValue: unknown;
  note?: string;
}

export interface DiscardedField {
  fieldId: string;
  legacyValue: unknown;
  /**
   * - `patch3_capacitance_screen` — explicitly listed in §12.4
   *   (capacitance, screenCsaMm2 — concept moved to MV / armour CSA).
   * - `unknown_field` — present in legacy but unrecognized in v1.5.
   */
  reason: 'patch3_capacitance_screen' | 'unknown_field';
  preservedInBackup: true;
}

export interface CorrectionFactorComparison {
  fieldId: string;
  legacyValue: number;
  recalculatedValue: number | null;
  recalculationPossible: boolean;
  reasonIfImpossible?: string;
}

export interface SizingResultComparison {
  legacyRecommendedCsa: number;
  newRecommendedCsa: number;
  identical: boolean;
  divergenceReason?: string;
  toleranceUsed: number;
}

export interface MigrationReport {
  fromVersion: string;
  fieldChanges: MigrationFieldChange[];
  discardedFields: DiscardedField[];
  correctionFactorComparisons: CorrectionFactorComparison[];
  sizingComparison?: SizingResultComparison;
  legacyPayloadBackup: LegacyInput;
  userApprovalRequired: boolean;
}

export interface MigrationOptions {
  /**
   * If true and the migrated input has sufficient installation conditions
   * to derive correction factors from datasets, the legacy directly-entered
   * k values are replaced with dataset values (source = `auto_dataset`).
   * If false (default) the legacy values are preserved (Patch-1).
   */
  acceptCorrectionFactorRecalculation?: boolean;
}

export interface MigrationResult {
  /**
   * Migrated input shaped like a v1.5 CircuitInput. Typed as `unknown`
   * here because Stage A keeps the migration module decoupled from the
   * full CircuitInput surface — Stage D wires it through end-to-end.
   */
  newInput: unknown;
  report: MigrationReport;
}
