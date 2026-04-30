/**
 * Host-level round-trip smoke test — Phase 4C hygiene addendum.
 *
 * Exercises the full host-side path without a real browser:
 *
 *     CircuitForm state  →  buildCircuitInput()  →  handleWorkerMessage()  →  ResultPanel inputs
 *
 * This is intentionally not an E2E / DOM test. We run the engine's own
 * worker handler (the exact module installed by installWorkerHandler in the
 * browser) against inputs produced by the host's form assembler, and assert
 * on the v1 envelope shape + key fields the UI actually renders. Any contract
 * drift between the host's assumptions and the engine's frozen envelope will
 * break here.
 */
import { describe, it, expect } from 'vitest';
import { handleWorkerMessage } from '@cable-sizing/engine';
import {
  buildCircuitInput,
  buildMvCircuitInput,
  INITIAL_FORM,
  type FormState,
} from './components/CircuitForm.js';

describe('host round-trip smoke — default form → sizeCable', () => {
  const input = buildCircuitInput(INITIAL_FORM);
  const res = handleWorkerMessage({ id: 'smoke-1', type: 'sizeCable', input });

  it('returns a v1 success envelope with sizeCable:result', () => {
    expect(res.ok).toBe(true);
    expect(res.type).toBe('sizeCable:result');
    expect(res.requestId).toBe('smoke-1');
  });

  it('result has a positive recommended CSA and a non-INCOMPLETE overall status', () => {
    if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('unreachable');
    const r = res.data.result;
    expect(r.recommendedCSAmm2).not.toBeNull();
    expect(r.recommendedCSAmm2!).toBeGreaterThan(0);
    expect(['PASS', 'WARNING', 'FAIL']).toContain(r.overallStatus);
  });

  it('surfaces the audit fields the DiagnosticsPanel renders', () => {
    if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('unreachable');
    const r = res.data.result;
    expect(r.selectionDriver).toMatch(/^(ampacity|voltage_drop|short_circuit|protection_recheck|mixed)$/);
    expect(r.ampacity.loadedConductorsUsed).toBe(3); // default form is 3-phase
    expect(r.ampacity.selectedDatasetId).toBeTruthy();
    expect(r.ampacity.selectedMethodRef).toBeTruthy();
    expect(r.ampacity.lookupPolicyUsed).toMatch(/^(exact|safe-side)$/);
  });
});

describe('host round-trip smoke — 1-phase form yields loadedConductorsUsed=2', () => {
  const onePhaseForm: FormState = { ...INITIAL_FORM, phase: 1, voltageV: 230 };
  const res = handleWorkerMessage({
    id: 'smoke-2',
    type: 'sizeCable',
    input: buildCircuitInput(onePhaseForm),
  });

  it('reports loadedConductorsUsed = 2 (L+N) per the frozen contract', () => {
    if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('unreachable');
    expect(res.data.result.ampacity.loadedConductorsUsed).toBe(2);
  });
});

describe('host round-trip smoke — structurally-invalid input hits E-API-002', () => {
  // powerKW set to a string — will fail zod structural validation.
  const base = buildCircuitInput(INITIAL_FORM) as { load: Record<string, unknown> };
  const badInput = {
    ...base,
    load: { ...base.load, powerKW: 'not-a-number' },
  };
  const res = handleWorkerMessage({ id: 'smoke-3', type: 'sizeCable', input: badInput });

  it('returns a v1 failure envelope with E-API-002 and dotted issue path', () => {
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error('unreachable');
    expect(res.error.code).toBe('E-API-002');
    expect(res.error.issues?.some((i) => i.path === 'load.powerKW')).toBe(true);
  });
});

describe('host form assembly — reference method compatibility guard', () => {
  it('does not submit a stale multicore method after switching to single-core', () => {
    const input = buildCircuitInput({
      ...INITIAL_FORM,
      cableType: 'single-core',
      methodCode: 'C',
    }) as { installation: { methodCode: string } };

    expect(input.installation.methodCode).toBe('B1');
  });

  it('does not submit a stale single-core method after switching to multicore', () => {
    const input = buildCircuitInput({
      ...INITIAL_FORM,
      cableType: 'multicore',
      methodCode: 'F',
    }) as { installation: { methodCode: string } };

    expect(input.installation.methodCode).toBe('B2');
  });

  it('keeps an existing method when it remains compatible', () => {
    const input = buildCircuitInput({
      ...INITIAL_FORM,
      cableType: 'multicore',
      methodCode: 'E',
    }) as { installation: { methodCode: string } };

    expect(input.installation.methodCode).toBe('E');
  });
});

describe('host round-trip smoke — MV form (TC-01) → sizeCableMv', () => {
  const mvForm: FormState = { ...INITIAL_FORM, voltageClass: 'MV' };
  const input = buildMvCircuitInput(mvForm);
  const res = handleWorkerMessage({ id: 'mv-smoke-1', type: 'sizeCableMv', input });

  it('returns a v1 sizeCableMv:result envelope', () => {
    expect(res.ok).toBe(true);
    expect(res.type).toBe('sizeCableMv:result');
  });

  it('TC-01 default form yields 60mm² PASS', () => {
    if (!(res.ok && res.type === 'sizeCableMv:result')) throw new Error('unreachable');
    const r = res.data.result;
    expect(r.kind).toBe('MV');
    expect(r.datasetId).toBe('mv_22kv_kr_v1');
    expect(r.recommendedCSAmm2).toBe(60);
  });
});
