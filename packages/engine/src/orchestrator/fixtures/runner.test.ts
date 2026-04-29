/**
 * GC-LV-* fixture runner — Stage D §8 산출물 #1, #4, #5.
 *
 * Each fixture is a JSON document (Implementation_Spec_LV_v2.0 §7.1 +
 * Stage D §8) holding a CircuitInput and the expected slice of the
 * SizingResult. The runner only looks at fields the fixture explicitly
 * documents; missing fields are not asserted, so adding a new fixture
 * never forces a runner change.
 *
 * Two fixture families are supported here:
 *   - GC-LV-AUTO-* : automation behaviour (FieldState provenance, info /
 *                    warning codes, derivation path proof). Numeric
 *                    expectations are loose where they are not the
 *                    central claim.
 *   - GC-LV-NN     : real-number accuracy fixtures (recommendedCSAmm2,
 *                    overallStatus). Mostly carried over from the
 *                    Phase 4A inline TC-001..TC-012 set so the legacy
 *                    coverage moves to JSON without a behaviour change.
 */
import { describe, it, expect } from 'vitest';
import { sizeCable } from '../pipeline.js';
import type {
  CircuitInput,
  ErrorCode,
  FieldSource,
  FieldStatus,
  InfoCode,
  WarningCode,
} from '../../types/index.js';

// AUTO fixtures (provenance / info / warning behaviour)
import auto01 from './GC-LV-AUTO-01.json' with { type: 'json' };
import auto02 from './GC-LV-AUTO-02.json' with { type: 'json' };
import auto03 from './GC-LV-AUTO-03.json' with { type: 'json' };
import auto04 from './GC-LV-AUTO-04.json' with { type: 'json' };
import auto05 from './GC-LV-AUTO-05.json' with { type: 'json' };

// Real-number accuracy fixtures (recommendedCSAmm2 etc.)
import gc01 from './GC-LV-01.json' with { type: 'json' };
import gc02 from './GC-LV-02.json' with { type: 'json' };
import gc03 from './GC-LV-03.json' with { type: 'json' };
import gc04 from './GC-LV-04.json' with { type: 'json' };
import gc05 from './GC-LV-05.json' with { type: 'json' };
import gc06 from './GC-LV-06.json' with { type: 'json' };
import gc07 from './GC-LV-07.json' with { type: 'json' };
import gc08 from './GC-LV-08.json' with { type: 'json' };
import gc09 from './GC-LV-09.json' with { type: 'json' };
import gc10 from './GC-LV-10.json' with { type: 'json' };
import gc11 from './GC-LV-11.json' with { type: 'json' };
import gc12 from './GC-LV-12.json' with { type: 'json' };
import gc13 from './GC-LV-13.json' with { type: 'json' };
import gc14 from './GC-LV-14.json' with { type: 'json' };
import gc15 from './GC-LV-15.json' with { type: 'json' };

interface FieldStateExpectation {
  source?: FieldSource;
  status?: FieldStatus;
  formula?: string;
  reason?: string;
  /** For numeric value comparisons — exact match. */
  valueExact?: number | string | null;
}

interface FixtureExpected {
  designCurrentApprox?: number;
  designCurrentTolerance?: number;
  recommendedCSAmm2?: number | null;
  recommendedCSAmm2AtLeast?: number;
  recommendedCSAmm2AtMost?: number;
  overallStatus?: 'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE';
  overallStatusOneOf?: Array<'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE'>;
  warningCodes?: WarningCode[];
  excludesWarning?: WarningCode[];
  errorCodes?: ErrorCode[];
  infoCodes?: InfoCode[];
  fieldStates?: Record<string, FieldStateExpectation>;
  loadedConductorsUsedExact?: number;
}

interface Fixture {
  id: string;
  description: string;
  spec?: string;
  source?: string;
  sourceRef?: string;
  input: CircuitInput;
  expected: FixtureExpected;
}

const FIXTURES: ReadonlyArray<Fixture> = [
  auto01, auto02, auto03, auto04, auto05,
  gc01, gc02, gc03, gc04, gc05, gc06, gc07, gc08, gc09, gc10, gc11, gc12,
  gc13, gc14, gc15,
] as Fixture[];

describe.each<Fixture>(FIXTURES as Fixture[])('$id — $description', (fx) => {
  const result = sizeCable(fx.input);

  if (fx.expected.designCurrentApprox !== undefined) {
    const tol = fx.expected.designCurrentTolerance ?? 0.05;
    it(`designCurrentA ≈ ${fx.expected.designCurrentApprox} ± ${tol}`, () => {
      expect(result.designCurrentA).toBeCloseTo(fx.expected.designCurrentApprox!, decimalsFor(tol));
    });
  }

  if (fx.expected.recommendedCSAmm2 !== undefined) {
    it(`recommendedCSAmm2 = ${fx.expected.recommendedCSAmm2}`, () => {
      expect(result.recommendedCSAmm2).toBe(fx.expected.recommendedCSAmm2);
    });
  }
  if (fx.expected.recommendedCSAmm2AtLeast !== undefined) {
    it(`recommendedCSAmm2 ≥ ${fx.expected.recommendedCSAmm2AtLeast}`, () => {
      expect(result.recommendedCSAmm2 ?? 0).toBeGreaterThanOrEqual(
        fx.expected.recommendedCSAmm2AtLeast!,
      );
    });
  }
  if (fx.expected.recommendedCSAmm2AtMost !== undefined) {
    it(`recommendedCSAmm2 ≤ ${fx.expected.recommendedCSAmm2AtMost}`, () => {
      expect(result.recommendedCSAmm2 ?? Infinity).toBeLessThanOrEqual(
        fx.expected.recommendedCSAmm2AtMost!,
      );
    });
  }

  if (fx.expected.overallStatus !== undefined) {
    it(`overallStatus = ${fx.expected.overallStatus}`, () => {
      expect(result.overallStatus).toBe(fx.expected.overallStatus);
    });
  }
  if (fx.expected.overallStatusOneOf) {
    it(`overallStatus ∈ {${fx.expected.overallStatusOneOf.join(', ')}}`, () => {
      expect(fx.expected.overallStatusOneOf!).toContain(result.overallStatus);
    });
  }

  if (fx.expected.warningCodes) {
    it.each(fx.expected.warningCodes)('emits warning %s', (code: WarningCode) => {
      expect(result.warnings.map((w) => w.code)).toContain(code);
    });
  }
  if (fx.expected.excludesWarning) {
    it.each(fx.expected.excludesWarning)('does NOT emit warning %s', (code: WarningCode) => {
      expect(result.warnings.map((w) => w.code)).not.toContain(code);
    });
  }
  if (fx.expected.errorCodes) {
    it.each(fx.expected.errorCodes)('emits error %s', (code: ErrorCode) => {
      expect(result.errors.map((e) => e.code)).toContain(code);
    });
  }
  if (fx.expected.infoCodes) {
    it.each(fx.expected.infoCodes)('emits info %s', (code: InfoCode) => {
      const codes = (result.info ?? []).map((m) => m.code);
      expect(codes).toContain(code);
    });
  }

  if (fx.expected.fieldStates) {
    for (const [fieldId, exp] of Object.entries(fx.expected.fieldStates)) {
      it(`fieldStates[${fieldId}] matches ${describeExpectation(exp)}`, () => {
        const fs = result.fieldStates?.[fieldId];
        expect(fs, `fieldStates[${fieldId}] missing`).toBeDefined();
        if (exp.source !== undefined) expect(fs!.source).toBe(exp.source);
        if (exp.status !== undefined) expect(fs!.status).toBe(exp.status);
        if (exp.formula !== undefined) expect(fs!.formula).toBe(exp.formula);
        if (exp.reason !== undefined) expect(fs!.reason).toBe(exp.reason);
        if (exp.valueExact !== undefined) expect(fs!.value).toBe(exp.valueExact);
      });
    }
  }

  if (fx.expected.loadedConductorsUsedExact !== undefined) {
    it(`ampacity.loadedConductorsUsed = ${fx.expected.loadedConductorsUsedExact}`, () => {
      expect(result.ampacity.loadedConductorsUsed).toBe(fx.expected.loadedConductorsUsedExact);
    });
  }
});

function decimalsFor(tolerance: number): number {
  if (tolerance >= 1) return 0;
  if (tolerance >= 0.1) return 1;
  if (tolerance >= 0.01) return 2;
  if (tolerance >= 0.001) return 3;
  return 4;
}

function describeExpectation(e: FieldStateExpectation): string {
  const bits: string[] = [];
  if (e.source) bits.push(`source=${e.source}`);
  if (e.status) bits.push(`status=${e.status}`);
  if (e.formula) bits.push(`formula=${e.formula}`);
  if (e.reason) bits.push(`reason=${e.reason}`);
  if (e.valueExact !== undefined) bits.push(`value=${String(e.valueExact)}`);
  return bits.join(', ');
}
