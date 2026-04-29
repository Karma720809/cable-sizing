/**
 * Integration test for the migration entry point.
 *
 * Drives a realistic v1.x payload through migrateLegacyInput() and
 * verifies the four policies cooperate correctly:
 *
 *   - Manual fields → user
 *   - Auto+Override (designCurrent, loadedConductors) → override + note
 *   - Legacy correction factors → legacy_preserved (no approval)
 *   - capacitance / screenCsaMm2 → discardedFields, preservedInBackup
 *
 * If any of the four pure-function helpers regresses, this test catches
 * the cross-helper interaction even when the unit tests pass.
 */
import { describe, it, expect } from 'vitest';
import { migrateLegacyInput } from './migrate-legacy-input.js';

const LEGACY = {
  schemaVersion: 'v1.2',
  voltage: 415,
  phase: 3,
  powerKW: 440,
  powerFactor: 0.85,
  length: 50,
  designCurrent: 720, // user manually entered I_B
  loadedConductors: 4, // user manually entered LC
  correctionFactors: { k1: 0.91, k2: 0.85, kTotal: 0.77 },
  capacitance: 0.42, // §12.4 discard
  screenCsaMm2: 16, // §12.4 discard
};

describe('migrateLegacyInput — end-to-end (no recalc)', () => {
  const { newInput, report } = migrateLegacyInput(LEGACY);

  it('reports the source schemaVersion of the legacy payload', () => {
    expect(report.fromVersion).toBe('v1.2');
  });

  it('Manual fields are mapped to user source', () => {
    const voltage = report.fieldChanges.find((c) => c.fieldId === 'voltage');
    expect(voltage?.newSource).toBe('user');
    expect(voltage?.newValue).toBe(415);
  });

  it('Auto+Override fields are mapped to override source with note', () => {
    const dc = report.fieldChanges.find((c) => c.fieldId === 'designCurrent');
    const lc = report.fieldChanges.find((c) => c.fieldId === 'loadedConductors');
    expect(dc?.newSource).toBe('override');
    expect(dc?.note).toContain('Override toggle starts ON');
    expect(lc?.newSource).toBe('override');
  });

  it('correctionFactors is preserved under legacy_preserved (no approval)', () => {
    const cf = (newInput as { correctionFactor: { source: string; value: unknown } | null })
      .correctionFactor;
    expect(cf).not.toBeNull();
    expect(cf?.source).toBe('legacy_preserved');
    expect(cf?.value).toEqual({ k1: 0.91, k2: 0.85, kTotal: 0.77 });
  });

  it('correctionFactors does not appear in fieldChanges (handled separately)', () => {
    expect(report.fieldChanges.find((c) => c.fieldId === 'correctionFactors')).toBeUndefined();
  });

  it('capacitance and screenCsaMm2 are listed as discarded with preservedInBackup', () => {
    expect(report.discardedFields).toHaveLength(2);
    for (const d of report.discardedFields) {
      expect(d.preservedInBackup).toBe(true);
      expect(d.reason).toBe('patch3_capacitance_screen');
    }
  });

  it('discarded fields are NOT in fieldChanges (no auto-conversion)', () => {
    expect(report.fieldChanges.find((c) => c.fieldId === 'capacitance')).toBeUndefined();
    expect(report.fieldChanges.find((c) => c.fieldId === 'screenCsaMm2')).toBeUndefined();
    expect(report.fieldChanges.find((c) => c.fieldId === 'armourCsaMm2')).toBeUndefined();
  });

  it('legacyPayloadBackup is a deep clone (mutating backup does not affect reads)', () => {
    expect(report.legacyPayloadBackup).toEqual(LEGACY);
    (report.legacyPayloadBackup as Record<string, unknown>).voltage = 999;
    expect(LEGACY.voltage).toBe(415);
  });

  it('userApprovalRequired is true when legacy correction factors exist', () => {
    expect(report.userApprovalRequired).toBe(true);
  });
});

describe('migrateLegacyInput — no legacy correction factors', () => {
  it('userApprovalRequired is false and correctionFactor is null', () => {
    const { newInput, report } = migrateLegacyInput({
      voltage: 415,
      powerKW: 100,
    });
    expect(report.userApprovalRequired).toBe(false);
    expect(
      (newInput as { correctionFactor: unknown }).correctionFactor,
    ).toBeNull();
    expect(report.discardedFields).toEqual([]);
  });
});

describe('migrateLegacyInput — explicit recalc approval (Stage A scope)', () => {
  it('Stage A pins sufficientInputsForRecalc=false → still legacy_preserved', () => {
    // Stage A cannot inspect the installation conditions to know whether
    // a fresh dataset lookup is feasible, so the entry point hardcodes
    // sufficientInputsForRecalc=false. Even when the user approves the
    // recalculation, the policy correctly returns legacy_preserved —
    // the upgrade path is wired through in Stage B (derivation/correctionFactors).
    const { newInput } = migrateLegacyInput(
      { correctionFactors: { kTotal: 0.77 } },
      { acceptCorrectionFactorRecalculation: true },
    );
    const cf = (newInput as { correctionFactor: { source: string } | null })
      .correctionFactor;
    expect(cf?.source).toBe('legacy_preserved');
  });
});
