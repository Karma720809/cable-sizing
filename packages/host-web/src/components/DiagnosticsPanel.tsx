/**
 * DiagnosticsPanel — developer-oriented view of the engine's declared capability
 * (via `manifest`) + the audit fields surfaced by the last sizing result.
 *
 * Intentionally shows:
 *   - engineVersion + apiVersion (from pong and/or manifest)
 *   - datasetId + bundled dataset count (from manifest)
 *   - For the most recent SizingResult:
 *       selectionDriver, loadedConductorsUsed, selectedDatasetId,
 *       selectedMethodRef, lookupPolicyUsed
 */
import React from 'react';
import type { SizingResult, DatasetManifest } from '@cable-sizing/engine';

interface Props {
  pong: { engineVersion: string; apiVersion: number } | null;
  manifest: DatasetManifest | null;
  lastResult: SizingResult | null;
}

export function DiagnosticsPanel({ pong, manifest, lastResult }: Props): React.ReactElement {
  return (
    <aside className="diagnostics">
      <h3>Diagnostics</h3>

      <section>
        <h4>Runtime</h4>
        <dl>
          <dt>engineVersion</dt>
          <dd>
            <code>{pong?.engineVersion ?? manifest?.engineVersion ?? '—'}</code>
          </dd>
          <dt>apiVersion</dt>
          <dd>
            <code>{pong?.apiVersion ?? manifest?.apiVersion ?? '—'}</code>
          </dd>
          <dt>datasetId</dt>
          <dd>
            <code>{manifest?.datasetId ?? '—'}</code>
          </dd>
          <dt>bundled datasets</dt>
          <dd>
            <code>{manifest?.bundledDatasets.length ?? '—'}</code>
          </dd>
          <dt>supported combinations</dt>
          <dd>
            <code>{manifest?.supportedCombinations.length ?? '—'}</code>
          </dd>
        </dl>
      </section>

      <section>
        <h4>Last sizing — audit</h4>
        {lastResult ? (
          <dl>
            <dt>selectionDriver</dt>
            <dd>
              <code>{lastResult.selectionDriver}</code>
            </dd>
            <dt>loadedConductorsUsed</dt>
            <dd>
              <code>{lastResult.ampacity.loadedConductorsUsed ?? '—'}</code>
            </dd>
            <dt>selectedDatasetId</dt>
            <dd>
              <code>{lastResult.ampacity.selectedDatasetId ?? '—'}</code>
            </dd>
            <dt>selectedMethodRef</dt>
            <dd>
              <code>{lastResult.ampacity.selectedMethodRef ?? '—'}</code>
            </dd>
            <dt>lookupPolicyUsed</dt>
            <dd>
              <code>{lastResult.ampacity.lookupPolicyUsed ?? '—'}</code>
            </dd>
            <dt>k1 · k2 · k3 (total)</dt>
            <dd>
              <code>
                {lastResult.ampacity.correctionFactors.k1} ·{' '}
                {lastResult.ampacity.correctionFactors.k2} ·{' '}
                {lastResult.ampacity.correctionFactors.k3} ={' '}
                {lastResult.ampacity.correctionFactors.total.toFixed(3)}
              </code>
            </dd>
          </dl>
        ) : (
          <p className="muted">No sizing run yet.</p>
        )}
      </section>
    </aside>
  );
}
