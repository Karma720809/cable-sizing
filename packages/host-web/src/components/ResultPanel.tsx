/**
 * ResultPanel (App-MVP-1) — renders a SizingResult (or a worker failure)
 * with the structure a user actually needs for a first usable UI:
 *
 *   1. A big recommended-CSA hero with the overall status chip.
 *   2. Per-criterion pass/fail row (Ampacity / ΔU% / Short-circuit /
 *      Protection coordination), each with the numeric detail that
 *      made the verdict.
 *   3. Warnings and errors as collapsible lists, with code tooltips
 *      (tooltip content lives in `codeHints.ts` — stable, forward-
 *      compatible lookup).
 *   4. A collapsible audit trail — raw `AuditStep[]` rendered verbatim
 *      so the engine's PRD §16 contract surfaces end-to-end.
 *
 * Optional Stage 5C fields (`cableR_atOperatingTemp_ohm_per_km`,
 * `operatingTempC`) are rendered only when populated, keeping the
 * panel tolerant of older engine bundles per the versioning policy.
 */
import React from 'react';
import type { WorkerResponse, SizingResult, AuditStep } from '@cable-sizing/engine';
import { hintFor } from './codeHints.js';

export function ResultPanel({ res }: { res: WorkerResponse | null }): React.ReactElement {
  if (!res) {
    return (
      <section className="panel">
        <h2>Result</h2>
        <p className="muted">Fill the form and press “Size cable”.</p>
      </section>
    );
  }

  // Protocol-level failure envelope (E-API-*).
  if (!res.ok) {
    return (
      <section className="panel panel-error" aria-live="polite">
        <h2>
          Request failed — <CodeChip code={res.error.code} />
        </h2>
        <p>{res.error.message}</p>
        {res.error.issues && res.error.issues.length > 0 && (
          <ul className="issue-list">
            {res.error.issues.map((i, idx) => (
              <li key={idx}>
                <code>{i.path || '(root)'}</code> — {i.message}
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  if (res.type !== 'sizeCable:result') {
    return (
      <section className="panel">
        <h2>Unexpected response</h2>
        <p>
          type: <code>{res.type}</code>
        </p>
      </section>
    );
  }

  const r = res.data.result;
  return (
    <section
      className={`panel status-${r.overallStatus.toLowerCase()}`}
      aria-label="Sizing result"
      aria-live="polite"
    >
      <h2>
        Result — <span className="status-chip">{r.overallStatus}</span>
      </h2>

      {/* Hero: recommended CSA */}
      <div className="hero">
        <div className="hero-csa">
          <span className="hero-label">Recommended CSA</span>
          <span className="hero-value" data-testid="recommended-csa">
            {r.recommendedCSAmm2 != null ? `${r.recommendedCSAmm2} mm²` : '—'}
          </span>
        </div>
        <div className="hero-meta">
          <KV k="IB (design current)" v={`${round(r.designCurrentA, 2)} A`} />
          <KV k="Driver" v={<code>{r.selectionDriver}</code>} />
        </div>
      </div>

      <Criteria r={r} />

      {/* Stage 5C extras (only when populated) */}
      {r.voltageDrop.cableR_atOperatingTemp_ohm_per_km != null && (
        <div className="subsection" data-testid="temp-correction-block">
          <h3>Temperature-corrected resistance</h3>
          <div className="summary">
            <KV
              k="θ_op (estimated)"
              v={`${round(r.voltageDrop.operatingTempC ?? null, 1)} °C`}
            />
            <KV
              k="R @ reference"
              v={`${round(r.voltageDrop.cableR_ohm_per_km, 4)} Ω/km`}
            />
            <KV
              k="R @ θ_op"
              v={`${round(r.voltageDrop.cableR_atOperatingTemp_ohm_per_km, 4)} Ω/km`}
            />
          </div>
        </div>
      )}

      {r.warnings.length > 0 && (
        <details open data-testid="warnings">
          <summary>Warnings ({r.warnings.length})</summary>
          <ul className="issue-list">
            {r.warnings.map((w, i) => (
              <li key={i}>
                <CodeChip code={w.code} /> {w.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      {r.errors.length > 0 && (
        <details open data-testid="errors">
          <summary>Engine errors ({r.errors.length})</summary>
          <ul className="issue-list">
            {r.errors.map((e, i) => (
              <li key={i}>
                <CodeChip code={e.code} /> {e.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <details data-testid="audit-trail">
        <summary>Audit trail ({r.auditTrail.length} steps)</summary>
        <AuditTrail steps={r.auditTrail} />
      </details>
    </section>
  );
}

// ─── Criteria table ───────────────────────────────────────────────────

function Criteria({ r }: { r: SizingResult }): React.ReactElement {
  return (
    <table className="criteria" aria-label="Criteria">
      <thead>
        <tr>
          <th>Criterion</th>
          <th>Status</th>
          <th>Detail</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Ampacity (IZ ≥ IB)</td>
          <td>
            <StatusChip s={r.ampacity.status} />
          </td>
          <td>
            IZ = {round(r.ampacity.cableRatingA, 1)} A @ {r.ampacity.selectedCSAmm2 ?? '—'}{' '}
            mm² (k<sub>total</sub> = {r.ampacity.correctionFactors.total.toFixed(3)})
          </td>
        </tr>
        <tr>
          <td>Voltage drop</td>
          <td>
            <StatusChip s={r.voltageDrop.status} />
          </td>
          <td>
            ΔU = {round(r.voltageDrop.calculatedDropPercent, 3)} % (limit{' '}
            {r.voltageDrop.maxAllowedPercent} %)
          </td>
        </tr>
        <tr>
          <td>Short-circuit (I²t)</td>
          <td>
            <StatusChip s={r.shortCircuit.status} />
          </td>
          <td>
            S<sub>req</sub> = {round(r.shortCircuit.minimumCSAmm2, 2)} mm² (k ={' '}
            {r.shortCircuit.kValue})
          </td>
        </tr>
        <tr>
          <td>Protection coord.</td>
          <td>
            <StatusChip s={r.protectionCoordination.status} />
          </td>
          <td>
            C1 (IB≤In≤IZ): <Ok p={r.protectionCoordination.condition1.pass} /> — C2
            (I₂≤1.45·IZ): <Ok p={r.protectionCoordination.condition2.pass} />
          </td>
        </tr>
      </tbody>
    </table>
  );
}

// ─── Audit trail ──────────────────────────────────────────────────────

function AuditTrail({ steps }: { steps: AuditStep[] }): React.ReactElement {
  return (
    <ol className="audit">
      {steps.map((s) => (
        <li key={s.step} className={`audit-step decision-${s.decision.toLowerCase()}`}>
          <div className="audit-head">
            <span className="audit-n">#{s.step}</span>
            <span className="audit-criterion">{s.criterion}</span>
            <span className="audit-decision">{s.decision}</span>
            {s.code && <CodeChip code={s.code} />}
          </div>
          <div className="audit-reason">{s.reason}</div>
          <details>
            <summary>formula & values</summary>
            <div className="audit-formula">
              <code>{s.formula}</code>
            </div>
            <pre className="audit-json">{JSON.stringify(s.intermediateValues, null, 2)}</pre>
          </details>
        </li>
      ))}
    </ol>
  );
}

// ─── Tiny building blocks ─────────────────────────────────────────────

function KV({ k, v }: { k: string; v: React.ReactNode }): React.ReactElement {
  return (
    <div className="kv">
      <span className="k">{k}</span>
      <span className="v">{v}</span>
    </div>
  );
}

function StatusChip({ s }: { s: string }): React.ReactElement {
  return <span className={`mini-chip mini-${s.toLowerCase()}`}>{s}</span>;
}

function Ok({ p }: { p: boolean | null }): React.ReactElement {
  if (p === null) return <span className="mini-chip mini-incomplete">INCOMPLETE</span>;
  return p ? (
    <span className="mini-chip mini-pass">PASS</span>
  ) : (
    <span className="mini-chip mini-fail">FAIL</span>
  );
}

function CodeChip({ code }: { code: string }): React.ReactElement {
  return (
    <code className="code-chip" title={hintFor(code)}>
      {code}
    </code>
  );
}

function round(n: number | null | undefined, d: number): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return n.toFixed(d);
}
