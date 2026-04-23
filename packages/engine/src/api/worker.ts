/**
 * Web Worker API wrapper — Phase 4A.2 (envelope v1).
 *
 * The engine is pure/synchronous, but host apps render cable sizing in a Worker
 * to keep long audits off the main thread. This module defines the wire
 * protocol and a pure `handleWorkerMessage` function so the protocol can be
 * exhaustively tested without spinning up a real Worker.
 *
 * Envelope contract (v1) — every response is one of these two shapes:
 *
 *   success:  { ok: true,  type: 'pong' | 'validate:result' | 'sizeCable:result' | 'manifest:result',
 *               requestId: string,
 *               data: <type-specific payload> }
 *
 *   failure:  { ok: false, type: 'error',
 *               requestId: string,
 *               error: { code: string, message: string,
 *                        issues?: Array<{ path: string; message: string }> } }
 *
 * Failure mode catalogue:
 *   E-API-001  unknown request type
 *   E-API-002  request input failed zod structural validation (issues included)
 *
 * Request types:
 *   'ping'       → pong { engineVersion, apiVersion }
 *   'manifest'   → manifest:result { manifest: DatasetManifest }
 *   'validate'   → validate:result { valid: boolean, issues?: [...] }
 *   'sizeCable'  → sizeCable:result { result: SizingResult }  | error E-API-002
 */
import { sizeCable } from '../orchestrator/pipeline.js';
import { parseCircuitInput } from './schema.js';
import { getDatasetManifest, API_VERSION, type DatasetManifest } from './manifest.js';
import { ENGINE_VERSION } from '../version.js';
import type { SizingResult } from '../types/index.js';

export type WorkerValidationIssue = { path: string; message: string };

export type WorkerRequest =
  | { id: string; type: 'ping' }
  | { id: string; type: 'manifest' }
  | { id: string; type: 'validate'; input: unknown }
  | { id: string; type: 'sizeCable'; input: unknown };

export type WorkerApiErrorCode = 'E-API-001' | 'E-API-002';

/** Discriminator on `ok` — the primary branching key for consumers. */
export type WorkerResponse = WorkerSuccess | WorkerFailure;

export type WorkerSuccess =
  | {
      ok: true;
      type: 'pong';
      requestId: string;
      data: { engineVersion: string; apiVersion: number };
    }
  | {
      ok: true;
      type: 'manifest:result';
      requestId: string;
      data: { manifest: DatasetManifest };
    }
  | {
      ok: true;
      type: 'validate:result';
      requestId: string;
      data: { valid: true } | { valid: false; issues: WorkerValidationIssue[] };
    }
  | {
      ok: true;
      type: 'sizeCable:result';
      requestId: string;
      data: { result: SizingResult };
    };

export interface WorkerFailure {
  ok: false;
  type: 'error';
  requestId: string;
  error: {
    code: WorkerApiErrorCode;
    message: string;
    issues?: WorkerValidationIssue[];
  };
}

// ─────────────────────────────────────────────────────────────────────
// Envelope builders
// ─────────────────────────────────────────────────────────────────────

function ok<T extends WorkerSuccess['type']>(
  requestId: string,
  type: T,
  data: Extract<WorkerSuccess, { type: T }>['data'],
): WorkerSuccess {
  return { ok: true, type, requestId, data } as WorkerSuccess;
}

function fail(
  requestId: string,
  code: WorkerApiErrorCode,
  message: string,
  issues?: WorkerValidationIssue[],
): WorkerFailure {
  return {
    ok: false,
    type: 'error',
    requestId,
    error: issues ? { code, message, issues } : { code, message },
  };
}

// ─────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────

/**
 * Pure request → response function. Handles the full protocol including
 * structural validation. Call as:
 *
 *   self.addEventListener('message', (ev) =>
 *     self.postMessage(handleWorkerMessage(ev.data))
 *   );
 *
 * or use `installWorkerHandler()` below.
 */
export function handleWorkerMessage(req: WorkerRequest): WorkerResponse {
  const id = (req as { id?: string }).id ?? '';

  switch (req.type) {
    case 'ping':
      return ok(id, 'pong', { engineVersion: ENGINE_VERSION, apiVersion: API_VERSION });

    case 'manifest':
      return ok(id, 'manifest:result', { manifest: getDatasetManifest() });

    case 'validate': {
      const p = parseCircuitInput(req.input);
      if (p.ok) return ok(id, 'validate:result', { valid: true });
      return ok(id, 'validate:result', { valid: false, issues: p.issues });
    }

    case 'sizeCable': {
      const p = parseCircuitInput(req.input);
      if (!p.ok) {
        return fail(
          id,
          'E-API-002',
          `CircuitInput failed structural validation (${p.issues.length} issue(s))`,
          p.issues,
        );
      }
      const result = sizeCable(p.value);
      return ok(id, 'sizeCable:result', { result });
    }

    default: {
      const unknownType = (req as { type?: unknown }).type;
      return fail(id, 'E-API-001', `unknown request type: ${String(unknownType)}`);
    }
  }
}

/**
 * Installs the handler on `self` (Dedicated Worker global scope). No-op in
 * environments without `addEventListener` + `postMessage` (e.g. Node tests).
 *
 * Usage:
 *   // worker.ts
 *   import { installWorkerHandler } from '@cable-sizing/engine';
 *   installWorkerHandler();
 */
export function installWorkerHandler(): void {
  const g = globalThis as unknown as {
    addEventListener?: (e: 'message', cb: (ev: MessageEvent) => void) => void;
    postMessage?: (msg: unknown) => void;
  };
  if (typeof g.addEventListener !== 'function' || typeof g.postMessage !== 'function') return;
  g.addEventListener('message', (ev: MessageEvent) => {
    const res = handleWorkerMessage(ev.data as WorkerRequest);
    g.postMessage!(res);
  });
}
