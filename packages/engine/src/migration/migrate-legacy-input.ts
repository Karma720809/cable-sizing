/**
 * Top-level v1.x → v1.5 migration entry point.
 *
 * Composes the four pure-function policies:
 *   1. Backup the original payload (§12.1).
 *   2. Map field provenance via Patch-2 (source-mapping).
 *   3. Decide correction-factor strategy via Patch-1 (correction-factor-policy).
 *   4. Extract Patch-3 discarded fields (capacitance, screenCsaMm2).
 *   5. Assemble a MigrationReport.
 *
 * The actual reconstruction of a CircuitInput (with FieldState wrappers)
 * is delegated to the calling code — the migration helpers operate on
 * pure data and do not own the final input shape, which keeps Stage A
 * decoupled from the detailed v1.5 input surface.
 *
 * No I/O. No side effects. Pure function — easy to fixture-test and
 * cheap to keep alive while a UI consumer is still pending.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.2.
 */
import { mapLegacyFieldSource, AUTO_OVERRIDE_FIELDS } from './source-mapping.js';
import { extractDiscardedFields, DISCARDED_FIELD_NAMES } from './discarded-fields.js';
import {
  applyCorrectionFactorPolicy,
  type CorrectionFactorBundle,
  type LegacyKValues,
} from './correction-factor-policy.js';
import type {
  LegacyInput,
  MigrationFieldChange,
  MigrationOptions,
  MigrationReport,
  MigrationResult,
} from './types.js';

const SCHEMA_VERSION_TARGET = 'v1.5';

/** Identifier for the legacy version shipped in the report. */
function detectLegacyVersion(legacy: LegacyInput): string {
  const v = legacy['schemaVersion'];
  return typeof v === 'string' && v.length > 0 ? v : 'v1.x';
}

/** Pull legacy correction factors out of a v1.x payload, if present. */
function readLegacyKValues(legacy: LegacyInput): LegacyKValues | undefined {
  const cf = legacy['correctionFactors'];
  if (cf === null || cf === undefined || typeof cf !== 'object') return undefined;
  const obj = cf as Record<string, unknown>;
  const out: LegacyKValues = {};
  for (const k of ['k1', 'k2', 'k3', 'kTotal'] as const) {
    const v = obj[k];
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Identity stand-in for the dataset recalculation. Real recalculation
 * is wired in Stage B once correctionFactors derivation lands. Until
 * then, callers that ask for recalculation get the legacy bundle back
 * unchanged — but the policy still emits source = `auto_dataset` so the
 * type-system contract is preserved.
 */
function noopRecalculate(legacyKValues: LegacyKValues | undefined): () => CorrectionFactorBundle {
  return () => ({
    k1: legacyKValues?.k1 ?? 1,
    k2: legacyKValues?.k2 ?? 1,
    kTotal:
      legacyKValues?.kTotal ??
      (legacyKValues?.k1 ?? 1) *
        (legacyKValues?.k2 ?? 1) *
        (legacyKValues?.k3 ?? 1),
  });
}

export function migrateLegacyInput(
  legacy: LegacyInput,
  options: MigrationOptions = {},
): MigrationResult {
  // 1. Backup (deep clone so caller mutation cannot poison the report).
  const legacyPayloadBackup: LegacyInput = JSON.parse(JSON.stringify(legacy)) as LegacyInput;

  // 2. Source mapping for every present, non-null field.
  const fieldChanges: MigrationFieldChange[] = [];
  const discardedKeys = new Set<string>(DISCARDED_FIELD_NAMES);
  // Migration namespace + correctionFactors are special-cased below.
  const handledKeys = new Set<string>([
    ...DISCARDED_FIELD_NAMES,
    'correctionFactors',
    'schemaVersion',
  ]);
  for (const key of Object.keys(legacy)) {
    if (handledKeys.has(key)) continue;
    if (discardedKeys.has(key)) continue;
    const v = legacy[key];
    if (v === null || v === undefined) continue;
    const newSource = mapLegacyFieldSource(key);
    fieldChanges.push({
      fieldId: key,
      legacyValue: v,
      newSource,
      newValue: v,
      ...((AUTO_OVERRIDE_FIELDS as readonly string[]).includes(key)
        ? { note: 'Override toggle starts ON; user may disable to re-enable derivation.' }
        : {}),
    });
  }

  // 3. Correction-factor policy.
  const legacyKValues = readLegacyKValues(legacy);
  const correctionFactorState = applyCorrectionFactorPolicy({
    // exactOptionalPropertyTypes: only spread when present.
    ...(legacyKValues ? { legacyKValues } : {}),
    sufficientInputsForRecalc: false, // caller can re-run with true once it knows
    userApproved: options.acceptCorrectionFactorRecalculation === true,
    recalculate: noopRecalculate(legacyKValues),
  });

  // 4. Patch-3 discards.
  const discardedFields = extractDiscardedFields(legacy);

  // 5. Report.
  const report: MigrationReport = {
    fromVersion: detectLegacyVersion(legacy),
    fieldChanges,
    discardedFields,
    correctionFactorComparisons: [], // populated only when sizing comparison runs
    legacyPayloadBackup,
    userApprovalRequired: legacyKValues !== undefined,
  };

  // The shape of `newInput` is intentionally generic at this layer —
  // Stage D will graft a real CircuitInput on top. We surface the field
  // changes and any preserved correction-factor FieldState so callers
  // can construct the final input without re-deriving the policy.
  const newInput = {
    schemaVersion: SCHEMA_VERSION_TARGET,
    fields: Object.fromEntries(fieldChanges.map((c) => [c.fieldId, c.newValue])),
    correctionFactor: correctionFactorState,
  };

  return { newInput, report };
}
