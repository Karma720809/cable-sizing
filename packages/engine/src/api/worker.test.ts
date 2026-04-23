import { describe, it, expect } from 'vitest';
import { handleWorkerMessage, type WorkerRequest } from './worker.js';
import { ENGINE_VERSION } from '../version.js';
import { API_VERSION } from './manifest.js';

const GOOD_INPUT = {
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

describe('handleWorkerMessage — envelope v1', () => {
  it('ping → success envelope with engineVersion + apiVersion', () => {
    const r = handleWorkerMessage({ id: 'req-1', type: 'ping' });
    expect(r.ok).toBe(true);
    expect(r.type).toBe('pong');
    expect(r.requestId).toBe('req-1');
    if (r.ok && r.type === 'pong') {
      expect(r.data).toEqual({ engineVersion: ENGINE_VERSION, apiVersion: API_VERSION });
    }
  });

  it('manifest → success envelope with a DatasetManifest payload', () => {
    const r = handleWorkerMessage({ id: 'm-1', type: 'manifest' });
    expect(r.ok).toBe(true);
    if (r.ok && r.type === 'manifest:result') {
      expect(r.data.manifest.datasetId).toBe('iec60364_lv_v1');
      expect(r.data.manifest.bundledDatasets.length).toBeGreaterThan(0);
    }
  });

  it('validate → success { valid: true } on well-formed input', () => {
    const r = handleWorkerMessage({ id: 'v-1', type: 'validate', input: GOOD_INPUT });
    expect(r.ok).toBe(true);
    if (r.ok && r.type === 'validate:result') {
      expect(r.data).toEqual({ valid: true });
    }
  });

  it('validate → success { valid: false, issues } on malformed input', () => {
    const bad = { ...GOOD_INPUT, system: { ...GOOD_INPUT.system, phase: 2 } };
    const r = handleWorkerMessage({ id: 'v-2', type: 'validate', input: bad });
    expect(r.ok).toBe(true);
    if (r.ok && r.type === 'validate:result' && r.data.valid === false) {
      expect(r.data.issues[0]!.path).toContain('system.phase');
    }
  });

  it('sizeCable → success with SizingResult on valid input', () => {
    const r = handleWorkerMessage({ id: 's-1', type: 'sizeCable', input: GOOD_INPUT });
    expect(r.ok).toBe(true);
    if (r.ok && r.type === 'sizeCable:result') {
      expect(r.data.result.overallStatus).toBe('PASS');
      expect(r.data.result.engineVersion).toBe(ENGINE_VERSION);
    }
  });

  it('sizeCable → failure envelope E-API-002 on structurally invalid input', () => {
    const bad = { ...GOOD_INPUT, cable: { ...GOOD_INPUT.cable, insulationType: 'EPR' } };
    const r = handleWorkerMessage({ id: 's-2', type: 'sizeCable', input: bad });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.type).toBe('error');
      expect(r.error.code).toBe('E-API-002');
      expect(r.error.issues?.some((i) => i.path === 'cable.insulationType')).toBe(true);
    }
  });

  it('unknown type → failure envelope E-API-001', () => {
    const r = handleWorkerMessage({
      id: 'x-1',
      type: 'frobnicate' as unknown as 'ping',
    } as WorkerRequest);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe('E-API-001');
  });

  it('preserves requestId across every response shape', () => {
    const reqs: WorkerRequest[] = [
      { id: 'a', type: 'ping' },
      { id: 'b', type: 'manifest' },
      { id: 'c', type: 'validate', input: GOOD_INPUT },
      { id: 'd', type: 'sizeCable', input: GOOD_INPUT },
      { id: 'e', type: 'sizeCable', input: { garbage: true } },
    ];
    const results = reqs.map(handleWorkerMessage);
    expect(results.map((r) => r.requestId)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('failure envelopes never contain a data field; success envelopes never contain error', () => {
    const good = handleWorkerMessage({ id: 'g', type: 'ping' });
    const bad = handleWorkerMessage({ id: 'b', type: 'sizeCable', input: {} });
    if (good.ok) expect('error' in good).toBe(false);
    if (!bad.ok) expect('data' in bad).toBe(false);
  });
});
