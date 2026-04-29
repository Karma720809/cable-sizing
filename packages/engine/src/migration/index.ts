/**
 * Migration helpers — v1.x → v1.5 project conversion (LV input automation v1.3).
 *
 * Pure functions, no callers yet (storage feature pending). See README.md.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.
 */
export type {
  LegacyInput,
  MigrationFieldChange,
  DiscardedField,
  CorrectionFactorComparison,
  SizingResultComparison,
  MigrationReport,
  MigrationOptions,
  MigrationResult,
} from './types.js';

export {
  mapLegacyFieldSource,
  MANUAL_FIELDS,
  AUTO_OVERRIDE_FIELDS,
} from './source-mapping.js';

export {
  applyCorrectionFactorPolicy,
} from './correction-factor-policy.js';
export type {
  ApplyPolicyArgs,
  CorrectionFactorBundle,
  LegacyKValues,
} from './correction-factor-policy.js';

export {
  extractDiscardedFields,
  DISCARDED_FIELD_NAMES,
} from './discarded-fields.js';

export { checkEquivalence } from './equivalence-check.js';
export type { EquivalenceCheckArgs } from './equivalence-check.js';

export { migrateLegacyInput } from './migrate-legacy-input.js';
