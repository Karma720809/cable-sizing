/**
 * App (App-MVP-1) — single-circuit cable sizing UI.
 *
 * Frozen boundary contract (inherited from Phase 4C, still non-negotiable):
 *   • No engine logic lives here; every calculation goes through the worker.
 *   • No new envelope shapes are invented; we consume WorkerResponse v1 only.
 *   • No new warning/error semantics are introduced.
 *
 * App-MVP-1 adds:
 *   • Full CircuitInput coverage via the sectioned CircuitForm.
 *   • Structured ResultPanel (recommended-csa hero + criteria + warnings
 *     + errors + audit trail + code tooltips).
 *   • Footer with engineVersion / datasetId / apiVersion (V-2).
 *
 * Scope explicitly *not* in App-MVP-1: persistence, multi-circuit,
 * charts, formula rendering.
 */
import React, { useEffect, useState } from 'react';
import { useEngineWorker } from './hooks/useEngineWorker.js';
import {
  CircuitForm,
  INITIAL_FORM,
  buildCircuitInput,
  buildMvCircuitInput,
  type FormState,
} from './components/CircuitForm.js';
import { ResultPanel } from './components/ResultPanel.js';
import { DiagnosticsPanel } from './components/DiagnosticsPanel.js';
import type {
  WorkerResponse,
  SizingResult,
  DatasetManifest,
} from '@cable-sizing/engine';

export function App(): React.ReactElement {
  const engine = useEngineWorker();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [lastRes, setLastRes] = useState<WorkerResponse | null>(null);
  const [pong, setPong] = useState<{ engineVersion: string; apiVersion: number } | null>(null);
  const [manifest, setManifest] = useState<DatasetManifest | null>(null);
  const [busy, setBusy] = useState(false);

  // On worker ready: ping + manifest once.
  useEffect(() => {
    if (!engine.ready) return;
    void (async () => {
      const p = await engine.ping();
      if (p.ok && p.type === 'pong') setPong(p.data);
      const m = await engine.manifest();
      if (m.ok && m.type === 'manifest:result') setManifest(m.data.manifest);
    })();
  }, [engine]);

  const onSubmit = async (): Promise<void> => {
    setBusy(true);
    try {
      const res =
        form.voltageClass === 'MV'
          ? await engine.sizeCableMv(buildMvCircuitInput(form))
          : await engine.sizeCable(buildCircuitInput(form));
      setLastRes(res);
    } finally {
      setBusy(false);
    }
  };

  const lastResult: SizingResult | null =
    lastRes && lastRes.ok && lastRes.type === 'sizeCable:result' ? lastRes.data.result : null;

  return (
    <div className="app">
      <header>
        <h1>Cable Sizing Calculator</h1>
        <p className="muted">
          Single-circuit IEC 60364-5-52 sizing, powered by{' '}
          <code>@cable-sizing/engine</code>.
        </p>
      </header>

      <main className="layout">
        <div className="col col-form">
          <CircuitForm
            value={form}
            onChange={setForm}
            onSubmit={() => void onSubmit()}
            busy={busy}
          />
        </div>
        <div className="col col-result">
          <ResultPanel res={lastRes} />
        </div>
        <div className="col col-diag">
          <DiagnosticsPanel pong={pong} manifest={manifest} lastResult={lastResult} />
        </div>
      </main>

      <footer className="app-footer" data-testid="app-footer">
        <span>
          engine <code>{pong?.engineVersion ?? manifest?.engineVersion ?? '—'}</code>
        </span>
        <span>
          dataset <code>{manifest?.datasetId ?? '—'}</code>
        </span>
        <span>
          apiVersion <code>{pong?.apiVersion ?? manifest?.apiVersion ?? '—'}</code>
        </span>
      </footer>
    </div>
  );
}
