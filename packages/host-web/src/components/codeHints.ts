/**
 * Short human-readable hints for engine `WarningCode` / `ErrorCode` values
 * and the worker protocol's API errors. Used as `title=""` tooltips and as
 * inline expansion text in the result panel.
 *
 * Kept as a simple lookup (not a union-typed map) so it tolerates unknown
 * codes gracefully — useful forward-compat for engine versions newer than
 * this host.
 */
export const CODE_HINTS: Record<string, string> = {
  // ─ Warnings (engine) ─
  'W-DEFAULT-APPLIED':
    'At least one optional field was left blank; the engine filled in a documented default.',
  'W-REACTANCE-IGNORED':
    'Reactance was set to 0 for csa below the configured threshold (policy.ignoreReactanceBelowMm2).',
  'W-IB-OVERRIDE':
    'IB was supplied directly via designCurrentOverrideA; load power/voltage/cosφ inputs were bypassed.',
  'W-I2-MISSING':
    'operatingCurrentI2A was not supplied, so protection condition 2 (I2 ≤ 1.45·IZ) is INCOMPLETE.',
  'W-LOOKUP-SAFE-SIDE':
    'At least one correction factor was resolved via the safe-side (conservative) neighbor rule.',
  'W-PROTECTION-RECHECK':
    'IZ at the initial recommended csa did not satisfy protection; size was bumped to the next standard.',
  'W-REACTANCE-60HZ-DEFERRED':
    '60 Hz request without a bundled 60 Hz reactance dataset for this (material, cableType); X = 0 used.',
  'W-RESISTANCE-50HZ-USED-AT-60HZ':
    '60 Hz request without a bundled 60 Hz impedance dataset; R reused from the 50 Hz bundle (valid for LV CSA ≤ 300 mm²).',
  'W-TEMP-CORRECTION-APPLIED':
    'Resistance was temperature-corrected per IEC 60287-1-1 using the loading-ratio θ_op estimate.',
  'W-TEMP-CORRECTION-CAPPED':
    'One or more scanned csa had IB > IZ; loading ratio was clamped to 1.0 for the θ_op estimate.',

  // ─ Errors (engine) ─
  'E-VAL-001': 'Voltage must be > 0.',
  'E-VAL-002': 'Power factor out of range.',
  'E-VAL-003': 'Ground installation selected but soil resistivity is missing.',
  'E-VAL-004': 'No designCurrentOverrideA and no powerKW — cannot compute IB.',
  'E-VAL-005': 'Route length must be > 0.',
  'E-VAL-006': 'Group count must be ≥ 1.',
  'E-VAL-007': 'Ambient temperature is required.',
  'E-VAL-008': 'Efficiency or demand factor out of range.',
  'E-VAL-009': 'maxVoltageDropPercent must be > 0.',
  'E-VAL-010': 'Invalid phase or frequency.',
  'E-LOOKUP-001': 'The requested ampacity combination is not bundled.',
  'E-LOOKUP-002':
    'A correction factor could not be resolved (not even via the safe-side neighbor rule).',
  'E-LOOKUP-003': 'Impedance value for the requested csa is missing.',
  'E-LOOKUP-004': 'k-value combination for short-circuit calculation is not bundled.',
  'E-DOMAIN-001': 'Efficiency is zero — division by zero blocked.',
  'E-CSA-001': 'Required csa exceeds the largest standard size (or no csa satisfies ΔU%).',
  'E-DATA-001': 'Dataset failed the loader quality check.',
  'E-TEMP-AMBIENT-OVER-MAX':
    'Ambient temperature ≥ rated conductor maximum; temperature-corrected resistance is ill-defined.',

  // ─ Worker protocol (API) ─
  'E-API-001': 'Malformed worker request envelope.',
  'E-API-002': 'Structural (zod) validation of CircuitInput failed.',
  'E-API-003': 'Engine threw an unexpected exception during sizeCable.',
};

/** Lookup with a graceful fallback for unknown codes. */
export function hintFor(code: string): string {
  return CODE_HINTS[code] ?? 'No hint available for this code.';
}
