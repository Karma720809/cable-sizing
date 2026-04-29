/**
 * MIG-TC fixture runner — Stage D §8 산출물 #3.
 *
 * Each fixture is a JSON document (Implementation_Spec_LV_v2.0 §7.2)
 * pinned to one of four migration policies. The runner dispatches on
 * `target` and asserts the documented `expected` shape so that the
 * migration policy's behaviour can be evolved by editing JSON, not TS.
 *
 * Fixtures live alongside the engine source so vitest's
 * `resolveJsonModule` import path stays a stable `./<id>.json`. Adding
 * a new MIG-TC just means dropping a JSON file and adding the import
 * below — no runner code change required.
 */
import { describe, it, expect } from 'vitest';
import {
  migrateLegacyInput,
  applyCorrectionFactorPolicy,
  type CorrectionFactorBundle,
  type LegacyKValues,
  checkEquivalence,
  type EquivalenceCheckArgs,
} from '../index.js';
import type { LegacyInput, MigrationOptions } from '../types.js';

import mig01 from './MIG-TC-01.json' with { type: 'json' };
import mig02a from './MIG-TC-02a.json' with { type: 'json' };
import mig02b from './MIG-TC-02b.json' with { type: 'json' };
import mig02c from './MIG-TC-02c.json' with { type: 'json' };
import mig03 from './MIG-TC-03.json' with { type: 'json' };
import mig04a from './MIG-TC-04a.json' with { type: 'json' };
import mig04b from './MIG-TC-04b.json' with { type: 'json' };
import mig04c from './MIG-TC-04c.json' with { type: 'json' };

type FixtureBase = { id: string; description: string; spec: string };
type Target =
  | 'migrateLegacyInput'
  | 'applyCorrectionFactorPolicy'
  | 'checkEquivalence';

interface MigrateFixture extends FixtureBase {
  target: 'migrateLegacyInput';
  legacyInput: LegacyInput;
  options: MigrationOptions;
  expected: {
    fieldChanges?: Array<{ fieldId: string; newSource: string }>;
    autoOverrideHaveNote?: string[];
    fieldChangesExclude?: string[];
    discardedFields?: Array<{ fieldId: string; preservedInBackup: boolean; reason: string }>;
    discardedFieldCount?: number;
    legacyPayloadBackupHasFields?: string[];
    correctionFactorSource?: string;
    correctionFactorValue?: CorrectionFactorBundle;
    userApprovalRequired?: boolean;
    fromVersion?: string;
  };
}

interface CfPolicyFixture extends FixtureBase {
  target: 'applyCorrectionFactorPolicy';
  args: {
    legacyKValues: LegacyKValues;
    sufficientInputsForRecalc: boolean;
    userApproved: boolean;
    /** Bundle the runner returns when the policy invokes recalculate(). */
    recalculatedBundle: CorrectionFactorBundle;
  };
  expected: {
    source: string;
    value: CorrectionFactorBundle;
    datasetRef?: string;
  };
}

interface EquivalenceFixture extends FixtureBase {
  target: 'checkEquivalence';
  args: EquivalenceCheckArgs;
  expected: {
    identical: boolean;
    toleranceUsed: number;
    legacyRecommendedCsa?: number;
    newRecommendedCsa?: number;
    divergenceReasonContains?: string;
  };
}

type Fixture = MigrateFixture | CfPolicyFixture | EquivalenceFixture;

const FIXTURES: ReadonlyArray<Fixture> = [
  mig01 as MigrateFixture,
  mig02a as MigrateFixture,
  mig02b as CfPolicyFixture,
  mig02c as CfPolicyFixture,
  mig03 as MigrateFixture,
  mig04a as EquivalenceFixture,
  mig04b as EquivalenceFixture,
  mig04c as EquivalenceFixture,
];

describe.each<Fixture>(FIXTURES as Fixture[])('$id — $description', (fx) => {
  switch (fx.target as Target) {
    case 'migrateLegacyInput':
      runMigrate(fx as MigrateFixture);
      break;
    case 'applyCorrectionFactorPolicy':
      runCfPolicy(fx as CfPolicyFixture);
      break;
    case 'checkEquivalence':
      runEquivalence(fx as EquivalenceFixture);
      break;
  }
});

function runMigrate(fx: MigrateFixture): void {
  const { newInput, report } = migrateLegacyInput(fx.legacyInput, fx.options);

  if (fx.expected.fromVersion !== undefined) {
    it('reports the source schemaVersion', () => {
      expect(report.fromVersion).toBe(fx.expected.fromVersion);
    });
  }

  if (fx.expected.fieldChanges) {
    it.each(fx.expected.fieldChanges)(
      'fieldChange[$fieldId] → newSource=$newSource',
      ({ fieldId, newSource }) => {
        const fc = report.fieldChanges.find((c) => c.fieldId === fieldId);
        expect(fc, `missing field change for ${fieldId}`).toBeDefined();
        expect(fc?.newSource).toBe(newSource);
        // Round-trip: legacy value must be preserved into newInput.fields.
        const fields = (newInput as { fields: Record<string, unknown> }).fields;
        expect(fields[fieldId]).toEqual(fc?.newValue);
      },
    );
  }

  if (fx.expected.autoOverrideHaveNote) {
    it.each(fx.expected.autoOverrideHaveNote)(
      'fieldChange[%s] carries the override-toggle note',
      (fieldId: string) => {
        const fc = report.fieldChanges.find((c) => c.fieldId === fieldId);
        expect(fc?.note).toContain('Override toggle starts ON');
      },
    );
  }

  if (fx.expected.fieldChangesExclude) {
    it('handled fields do not appear in fieldChanges', () => {
      for (const id of fx.expected.fieldChangesExclude!) {
        expect(report.fieldChanges.find((c) => c.fieldId === id)).toBeUndefined();
      }
    });
  }

  if (fx.expected.discardedFields) {
    it('discardedFields list matches fixture entries', () => {
      expect(report.discardedFields).toHaveLength(fx.expected.discardedFields!.length);
      for (const exp of fx.expected.discardedFields!) {
        const d = report.discardedFields.find((x) => x.fieldId === exp.fieldId);
        expect(d, `missing discarded field ${exp.fieldId}`).toBeDefined();
        expect(d?.preservedInBackup).toBe(exp.preservedInBackup);
        expect(d?.reason).toBe(exp.reason);
      }
    });
  } else if (fx.expected.discardedFieldCount !== undefined) {
    it(`reports ${fx.expected.discardedFieldCount} discarded field(s)`, () => {
      expect(report.discardedFields).toHaveLength(fx.expected.discardedFieldCount!);
    });
  }

  if (fx.expected.legacyPayloadBackupHasFields) {
    it('legacyPayloadBackup retains discarded fields verbatim', () => {
      const backup = report.legacyPayloadBackup as Record<string, unknown>;
      for (const id of fx.expected.legacyPayloadBackupHasFields!) {
        expect(backup[id]).toBeDefined();
      }
    });
  }

  if (fx.expected.correctionFactorSource !== undefined) {
    it(`correction-factor FieldState source = ${fx.expected.correctionFactorSource}`, () => {
      const cf = (newInput as { correctionFactor: { source: string; value: unknown } | null })
        .correctionFactor;
      expect(cf, 'correctionFactor missing in newInput').not.toBeNull();
      expect(cf?.source).toBe(fx.expected.correctionFactorSource);
    });
  }

  if (fx.expected.correctionFactorValue !== undefined) {
    it('preserved correction-factor value matches the legacy bundle', () => {
      const cf = (newInput as { correctionFactor: { value: CorrectionFactorBundle } | null })
        .correctionFactor;
      expect(cf?.value).toEqual(fx.expected.correctionFactorValue);
    });
  }

  if (fx.expected.userApprovalRequired !== undefined) {
    it(`userApprovalRequired = ${fx.expected.userApprovalRequired}`, () => {
      expect(report.userApprovalRequired).toBe(fx.expected.userApprovalRequired);
    });
  }
}

function runCfPolicy(fx: CfPolicyFixture): void {
  const result = applyCorrectionFactorPolicy({
    legacyKValues: fx.args.legacyKValues,
    sufficientInputsForRecalc: fx.args.sufficientInputsForRecalc,
    userApproved: fx.args.userApproved,
    recalculate: () => fx.args.recalculatedBundle,
  });

  it('returns a non-null FieldState', () => {
    expect(result).not.toBeNull();
  });
  it(`source = ${fx.expected.source}`, () => {
    expect(result?.source).toBe(fx.expected.source);
  });
  it('value matches expected bundle', () => {
    expect(result?.value).toEqual(fx.expected.value);
  });
  if (fx.expected.datasetRef !== undefined) {
    it(`datasetRef = ${fx.expected.datasetRef}`, () => {
      expect(result?.datasetRef).toBe(fx.expected.datasetRef);
    });
  }
}

function runEquivalence(fx: EquivalenceFixture): void {
  const out = checkEquivalence(fx.args);

  it(`identical = ${fx.expected.identical}`, () => {
    expect(out.identical).toBe(fx.expected.identical);
  });
  it(`toleranceUsed = ${fx.expected.toleranceUsed}`, () => {
    expect(out.toleranceUsed).toBe(fx.expected.toleranceUsed);
  });
  if (fx.expected.legacyRecommendedCsa !== undefined) {
    it('echoes legacy recommended CSA', () => {
      expect(out.legacyRecommendedCsa).toBe(fx.expected.legacyRecommendedCsa);
    });
  }
  if (fx.expected.newRecommendedCsa !== undefined) {
    it('echoes new recommended CSA', () => {
      expect(out.newRecommendedCsa).toBe(fx.expected.newRecommendedCsa);
    });
  }
  if (fx.expected.divergenceReasonContains !== undefined) {
    it('divergenceReason carries the documented hint', () => {
      expect(out.divergenceReason).toBeDefined();
      expect(out.divergenceReason!.toLowerCase()).toContain(
        fx.expected.divergenceReasonContains!.toLowerCase(),
      );
    });
  }
}
