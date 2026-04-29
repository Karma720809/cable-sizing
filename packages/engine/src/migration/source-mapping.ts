/**
 * Patch-2: source mapping policy for v1.x → v1.5 migration.
 *
 *   Manual fields           → source = 'user'
 *   Auto + Override fields  → source = 'override'
 *   (any other / unknown)   → source = 'user' (conservative fallback)
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §12.2.1.
 */
import type { FieldSource } from '../types/field-state.js';

/**
 * Manual fields per §7 of the design change. A v1.x project value in
 * any of these slots becomes `source = 'user'` post-migration.
 */
export const MANUAL_FIELDS = [
  'voltage',
  'phase',
  'frequency',
  'topology',
  'loadType',
  'powerKW',
  'fla',
  'kva',
  'powerFactor',
  'efficiency',
  'demandFactor',
  'conductorMaterial',
  'insulationType',
  'cableType',
  'installationMethod',
  'ambientTemp',
  'groupCount',
  'soilResistivity',
  'burialDepth',
  'length',
  'maxVoltageDropPercent',
  'scCurrent',
  'scClearingTime',
  'protectionRatedCurrent',
] as const;

/**
 * Auto + Override fields per §7. A directly-entered v1.x value in any
 * of these slots becomes `source = 'override'` post-migration, with the
 * Override toggle starting in the ON position so the value is honoured.
 */
export const AUTO_OVERRIDE_FIELDS = [
  'designCurrent',
  'loadedConductors',
  'armourCsaMm2',
] as const;

const MANUAL_SET = new Set<string>(MANUAL_FIELDS);
const AUTO_OVERRIDE_SET = new Set<string>(AUTO_OVERRIDE_FIELDS);

/**
 * Map a legacy field id to its v1.5 FieldState `source`. Defaults to
 * `'user'` for fields not in either bucket — Manual is the safer
 * fallback because it disables auto-derivation for the unknown field
 * and makes the human-entered value authoritative until reviewed.
 */
export function mapLegacyFieldSource(fieldId: string): FieldSource {
  if (AUTO_OVERRIDE_SET.has(fieldId)) return 'override';
  if (MANUAL_SET.has(fieldId)) return 'user';
  return 'user';
}
