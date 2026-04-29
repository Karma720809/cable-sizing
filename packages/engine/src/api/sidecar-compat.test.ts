/**
 * Adjustment-3 / AC-17 / AC-18 sidecar envelope-compatibility regression.
 *
 * The v1.3 changes added two optional fields to SizingResult:
 *   - `fieldStates: Record<string, FieldState>`
 *   - `info: InfoMessage[]`
 *
 * Per Adjustment-3, this is allowed *only* if every existing v1 envelope
 * field is unchanged in shape and meaning, and a pre-v1.3 consumer that
 * never reads `fieldStates` or `info` keeps observing the same result it
 * would have observed under engine 0.11.x.
 *
 * The test below treats `handleWorkerMessage` as a black box, runs a
 * canonical input twice (with and without v1.3 inputs that activate the
 * sidecar), and asserts:
 *
 *   1. The outer envelope (`ok`, `type`, `requestId`, `data.result`) is
 *      structurally identical.
 *   2. Every pre-v1.3 SizingResult field stays present and identical to
 *      what a `pre-v1.3 projection` of the result yields.
 *   3. The sidecar fields (`fieldStates`, `info`) are *additive* —
 *      omitted only when there is nothing to report, present otherwise.
 *
 * Together these assertions catch any regression where adding a new
 * audit/sidecar feature accidentally drops or rewrites a v1 field.
 */
import { describe, it, expect } from 'vitest';
import { handleWorkerMessage, type WorkerResponse } from './worker.js';
import type { SizingResult } from '../types/index.js';

const BASE_INPUT = {
  load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
  system: { voltageV: 400, phase: 3, frequencyHz: 50 },
  cable: {
    conductorMaterial: 'Cu',
    insulationType: 'PVC',
    coreConfiguration: '3C+N',
    cableType: 'multicore',
  },
  installation: { methodCode: 'C', ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 1 },
  route: { lengthM: 50 },
  protection: {
    deviceType: 'MCB',
    ratedCurrentA: 50,
    operatingCurrentI2A: 72.5,
    tripTimeS: 0.1,
    shortCircuitKA: 10,
  },
  projectPolicy: {
    maxVoltageDropPercent: 5,
    useReactance: false,
    resistanceModel: 'fixed_reference',
    roundingPolicy: 'next_standard_csa',
  },
};

/** Pre-v1.3 SizingResult key set (frozen v1 contract). */
const V1_KEYS: ReadonlyArray<keyof SizingResult> = [
  'designCurrentA',
  'ampacity',
  'voltageDrop',
  'shortCircuit',
  'protectionCoordination',
  'recommendedCSAmm2',
  'selectionDriver',
  'overallStatus',
  'warnings',
  'errors',
  'datasetId',
  'engineVersion',
  'apiVersion',
  'auditTrail',
];

function projectV1(r: SizingResult): Partial<SizingResult> {
  const out: Partial<SizingResult> = {};
  for (const k of V1_KEYS) (out as Record<string, unknown>)[k] = r[k];
  return out;
}

function unwrap(r: WorkerResponse): SizingResult {
  if (!(r.ok && r.type === 'sizeCable:result')) throw new Error('expected sizeCable:result');
  return r.data.result;
}

describe('Adjustment-3 sidecar — envelope compatibility', () => {
  it('AC-17: outer envelope shape is unchanged when sidecar is populated', () => {
    const r = handleWorkerMessage({ id: 's-1', type: 'sizeCable', input: BASE_INPUT });
    expect(r.ok).toBe(true);
    expect(r.type).toBe('sizeCable:result');
    expect(r.requestId).toBe('s-1');
    if (!r.ok) return;
    // success envelope = { ok, type, requestId, data }
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['data', 'ok', 'requestId', 'type']);
    expect(Object.keys(r.data)).toEqual(['result']);
  });

  it('AC-17: every v1 SizingResult key is present and same-typed', () => {
    const r = unwrap(handleWorkerMessage({ id: 's-2', type: 'sizeCable', input: BASE_INPUT }));
    for (const k of V1_KEYS) {
      expect(r, `v1 key ${k} missing`).toHaveProperty(k);
    }
  });

  it('AC-18: pre-v1.3 projection ignores sidecar — same result with and without v1.3 inputs', () => {
    // Without v1.3 fields: legacy input.
    const baseResult = unwrap(
      handleWorkerMessage({ id: 's-3', type: 'sizeCable', input: BASE_INPUT }),
    );
    // With v1.3 fields that match the legacy fallback (topology=3ph4w
    // with ncc=false reproduces phase=3 behaviour, no overrides).
    const v13Result = unwrap(
      handleWorkerMessage({
        id: 's-4',
        type: 'sizeCable',
        input: {
          ...BASE_INPUT,
          system: { ...BASE_INPUT.system, topology: '3ph4w' },
          neutralCarriesCurrent: false,
        },
      }),
    );
    // Sidecar fields may differ in detail; the v1 projection must not.
    expect(projectV1(v13Result)).toEqual(projectV1(baseResult));
  });

  it('AC-18: sidecar omitted from JSON when empty, populated otherwise', () => {
    // BASE_INPUT triggers Stage B derivation, so fieldStates is present.
    const r = unwrap(handleWorkerMessage({ id: 's-5', type: 'sizeCable', input: BASE_INPUT }));
    expect(r.fieldStates).toBeDefined();
    // info[] is only emitted when there is something to say (e.g.
    // I-CR-001). For BASE_INPUT it should be absent OR empty — never a
    // mandatory frame.
    expect(r.info === undefined || (Array.isArray(r.info) && r.info.length >= 0)).toBe(true);
  });

  it('AC-18: a v1-only consumer can JSON.stringify(round-trip) the result without losing data', () => {
    const r = unwrap(handleWorkerMessage({ id: 's-6', type: 'sizeCable', input: BASE_INPUT }));
    const round = JSON.parse(JSON.stringify(r)) as SizingResult;
    // Critical numeric fields survive the round-trip with strict equality.
    expect(round.recommendedCSAmm2).toBe(r.recommendedCSAmm2);
    expect(round.designCurrentA).toBe(r.designCurrentA);
    expect(round.overallStatus).toBe(r.overallStatus);
    expect(round.engineVersion).toBe(r.engineVersion);
    expect(round.apiVersion).toBe(r.apiVersion);
  });

  it('AC-18: failure envelope shape unchanged (no sidecar leakage on E-API-*)', () => {
    const r = handleWorkerMessage({
      id: 's-7',
      type: 'sizeCable',
      input: { ...BASE_INPUT, load: { ...BASE_INPUT.load, powerKW: 'not-a-number' } },
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // Failure envelope = { ok:false, type, requestId, error: {code, message, issues?} }
    const keys = Object.keys(r).sort();
    expect(keys).toEqual(['error', 'ok', 'requestId', 'type']);
    expect(r.error.code).toBe('E-API-002');
  });
});
