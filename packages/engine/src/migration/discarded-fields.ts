/**
 * Patch-3: legacy field discard policy.
 *
 * `capacitance` and `screenCsaMm2` belong to MV (medium-voltage) and
 * have no place in the v1.5 LV schema. Per §12.4, a v1.x project
 * carrying either field gets the value preserved in the legacy backup
 * and listed in the migration report — they are NEVER auto-converted to
 * armour CSA.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.4.
 */
import type { DiscardedField, LegacyInput } from './types.js';

export const DISCARDED_FIELD_NAMES = ['capacitance', 'screenCsaMm2'] as const;

const DISCARDED_SET = new Set<string>(DISCARDED_FIELD_NAMES);

/**
 * Pull the §12.4 discarded fields out of a legacy payload. Each match
 * is returned with `preservedInBackup: true` so the caller knows the
 * original value lives in `legacyPayloadBackup`.
 *
 * Fields that are present but `null`/`undefined` are NOT reported —
 * v1.x projects carry many empty MV slots even when they are LV, and
 * reporting those would clutter the migration preview with no signal.
 */
export function extractDiscardedFields(legacy: LegacyInput): DiscardedField[] {
  const out: DiscardedField[] = [];
  for (const key of Object.keys(legacy)) {
    if (!DISCARDED_SET.has(key)) continue;
    const v = legacy[key];
    if (v === null || v === undefined) continue;
    out.push({
      fieldId: key,
      legacyValue: v,
      reason: 'patch3_capacitance_screen',
      preservedInBackup: true,
    });
  }
  return out;
}
