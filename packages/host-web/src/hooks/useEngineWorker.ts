/**
 * useEngineWorker — React hook wrapping the engine worker in a Promise-based
 * request/response API, correlated by `requestId`.
 *
 * Consumers do NOT know the worker protocol's wire shape; they just call
 *
 *   const { ping, manifest, validate, sizeCable } = useEngineWorker();
 *   const res = await sizeCable(input);
 *
 * and receive a `WorkerResponse` (the frozen v1 envelope). The hook deliberately
 * does not interpret the envelope — routing success/failure is the UI's job, so
 * that the contract stays visible at the call site.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  WorkerRequest,
  WorkerResponse,
} from '@cable-sizing/engine';

type Pending = {
  resolve: (r: WorkerResponse) => void;
  reject: (e: unknown) => void;
};

export interface UseEngineWorker {
  ready: boolean;
  ping: () => Promise<WorkerResponse>;
  manifest: () => Promise<WorkerResponse>;
  validate: (input: unknown) => Promise<WorkerResponse>;
  sizeCable: (input: unknown) => Promise<WorkerResponse>;
}

export function useEngineWorker(): UseEngineWorker {
  const workerRef = useRef<Worker | null>(null);
  const pendingRef = useRef<Map<string, Pending>>(new Map());
  const idSeqRef = useRef(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const w = new Worker(new URL('../worker/engine.worker.ts', import.meta.url), {
      type: 'module',
    });

    w.addEventListener('message', (ev: MessageEvent) => {
      const res = ev.data as WorkerResponse;
      const p = pendingRef.current.get(res.requestId);
      if (!p) return; // unknown requestId — ignore (should not happen in v1)
      pendingRef.current.delete(res.requestId);
      p.resolve(res);
    });

    w.addEventListener('error', (ev: ErrorEvent) => {
      // Reject all pending — worker crashed.
      for (const [, p] of pendingRef.current) p.reject(ev.error ?? new Error(ev.message));
      pendingRef.current.clear();
    });

    workerRef.current = w;
    setReady(true);
    return () => {
      w.terminate();
      workerRef.current = null;
      setReady(false);
    };
  }, []);

  const send = useCallback((partial: { type: WorkerRequest['type']; input?: unknown }): Promise<WorkerResponse> => {
    const w = workerRef.current;
    if (!w) return Promise.reject(new Error('worker not initialised'));
    const id = `req-${++idSeqRef.current}`;
    const full = { id, ...partial } as WorkerRequest;
    return new Promise<WorkerResponse>((resolve, reject) => {
      pendingRef.current.set(id, { resolve, reject });
      w.postMessage(full);
    });
  }, []);

  return useMemo<UseEngineWorker>(
    () => ({
      ready,
      ping: () => send({ type: 'ping' }),
      manifest: () => send({ type: 'manifest' }),
      validate: (input: unknown) => send({ type: 'validate', input }),
      sizeCable: (input: unknown) => send({ type: 'sizeCable', input }),
    }),
    [ready, send],
  );
}
