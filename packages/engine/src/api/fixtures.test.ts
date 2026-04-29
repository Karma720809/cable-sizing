/**
 * Contract fixtures — Phase 4A.5.
 *
 * These tests freeze the *shape* of a worker success/failure envelope for the
 * canonical happy path and the canonical validation-error path. They serve
 * two purposes:
 *
 *  1. As a regression net: any accidental field rename or type change in the
 *     envelope will break a concrete assertion here.
 *  2. As a reference for downstream consumers (UI, external tooling): the
 *     fixture definitions at the top of this file are ready to copy into
 *     consumer contract tests.
 *
 * When engine semantics legitimately change (e.g. a new field is added), the
 * assertions below should be updated in the same PR as the envelope change,
 * together with `docs/versioning-policy.md`.
 */
import { describe, it, expect } from 'vitest';
import { handleWorkerMessage } from './worker.js';

// ── Fixture: canonical "happy path" sizeCable request ─────────────────
const FX_SIZECABLE_SUCCESS_REQUEST = {
  id: 'fx-success-001',
  type: 'sizeCable' as const,
  input: {
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
  },
};

// ── Fixture: canonical zod-validation-error sizeCable request ─────────
const FX_SIZECABLE_VALIDATION_ERROR_REQUEST = {
  id: 'fx-verr-001',
  type: 'sizeCable' as const,
  input: {
    ...FX_SIZECABLE_SUCCESS_REQUEST.input,
    system: { ...FX_SIZECABLE_SUCCESS_REQUEST.input.system, phase: 2 },
    cable: { ...FX_SIZECABLE_SUCCESS_REQUEST.input.cable, insulationType: 'EPR' },
  },
};

describe('Contract fixtures — sizeCable success envelope (v1)', () => {
  const res = handleWorkerMessage(FX_SIZECABLE_SUCCESS_REQUEST);

  it('envelope has { ok: true, type: "sizeCable:result", requestId, data }', () => {
    expect(res.ok).toBe(true);
    expect(res.type).toBe('sizeCable:result');
    expect(res.requestId).toBe('fx-success-001');
    if (res.ok && res.type === 'sizeCable:result') {
      expect(res.data).toHaveProperty('result');
    }
  });

  it('SizingResult exposes every Phase-4A.3 field on the happy path', () => {
    if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('unreachable');
    const r = res.data.result;
    expect(r).toMatchObject({
      overallStatus: 'PASS',
      recommendedCSAmm2: expect.any(Number),
      selectionDriver: expect.stringMatching(/^(ampacity|voltage_drop|short_circuit|protection_recheck|mixed)$/),
      apiVersion: 1,
      engineVersion: expect.any(String),
      datasetId: 'iec60364_lv_v1',
    });
    expect(r.ampacity).toMatchObject({
      selectedDatasetId: expect.any(String),
      selectedMethodRef: expect.any(String),
      loadedConductorsUsed: expect.any(Number),
      lookupPolicyUsed: expect.stringMatching(/^(exact|safe-side)$/),
    });
  });

  it('all required top-level keys are present (stable v1 result surface)', () => {
    if (!(res.ok && res.type === 'sizeCable:result')) throw new Error('unreachable');
    const keys = new Set(Object.keys(res.data.result));
    // v1 frozen keys — must always be present (Adjustment-3: outer envelope unchanged).
    const REQUIRED_V1 = [
      'ampacity',
      'apiVersion',
      'auditTrail',
      'datasetId',
      'designCurrentA',
      'engineVersion',
      'errors',
      'overallStatus',
      'protectionCoordination',
      'recommendedCSAmm2',
      'selectionDriver',
      'shortCircuit',
      'voltageDrop',
      'warnings',
    ];
    for (const k of REQUIRED_V1) {
      expect(keys.has(k)).toBe(true);
    }
    // v1.3 optional sidecar keys (Stage B emits fieldStates always; info only
    // when an InfoMessage was raised). Allowed but not required.
    const OPTIONAL_V13 = new Set(['fieldStates', 'info']);
    for (const k of keys) {
      if (REQUIRED_V1.includes(k) || OPTIONAL_V13.has(k)) continue;
      throw new Error(`unexpected top-level key in v1.3 envelope: ${k}`);
    }
  });
});

describe('Contract fixtures — sizeCable validation-error envelope (v1)', () => {
  const res = handleWorkerMessage(FX_SIZECABLE_VALIDATION_ERROR_REQUEST);

  it('envelope has { ok: false, type: "error", requestId, error }', () => {
    expect(res.ok).toBe(false);
    expect(res.type).toBe('error');
    expect(res.requestId).toBe('fx-verr-001');
    if (!res.ok) {
      expect(res.error.code).toBe('E-API-002');
      expect(res.error).toHaveProperty('message');
      expect(res.error.issues).toBeInstanceOf(Array);
    }
  });

  it('collects an issue per invalid field with dotted paths', () => {
    if (res.ok) throw new Error('unreachable');
    const paths = res.error.issues!.map((i) => i.path).sort();
    expect(paths).toContain('system.phase');
    expect(paths).toContain('cable.insulationType');
  });

  it('never carries a data field on failure envelope', () => {
    expect('data' in res).toBe(false);
  });
});

describe('Contract fixtures — manifest response (v1)', () => {
  const res = handleWorkerMessage({ id: 'fx-m-001', type: 'manifest' });

  it('envelope has { ok: true, type: "manifest:result", data.manifest }', () => {
    if (!(res.ok && res.type === 'manifest:result')) throw new Error('unreachable');
    expect(res.data.manifest.datasetId).toBe('iec60364_lv_v1');
    expect(res.data.manifest.apiVersion).toBe(1);
    expect(res.data.manifest.bundledDatasets.length).toBeGreaterThan(0);
  });
});
