/**
 * DerivedFieldDisplay — renders one FieldState row from the engine's
 * sidecar (`SizingResult.fieldStates[fieldId]`).
 *
 * Layout (Implementation_Spec_LV_v2.0 §4.1):
 *
 *   [Label]:  [Value 126.06 A]  [SourceIcon]  [StatusBadge]
 *             [Source description / reason]
 *
 * The component does not render override controls itself — that is
 * OverrideToggle's job (composed by the host form). DerivedFieldDisplay
 * is *display only*, so it can be reused inside AuditTrailView without
 * pulling in form state.
 */
import React from 'react';
import type { FieldState, FieldSource } from '@cable-sizing/engine';
import { SourceIcon } from './SourceIcon.js';
import { StatusBadge } from './StatusBadge.js';

interface Props<T> {
  label: string;
  state: FieldState<T>;
  unit?: string;
  /** Custom value formatter; defaults to `String(value)` (or 3-decimal for numbers). */
  formatter?: (value: T) => string;
}

const SOURCE_DESC: Record<FieldSource, string> = {
  auto_formula: 'auto (formula)',
  auto_dataset: 'auto (dataset)',
  user: 'user input',
  override: 'override',
  legacy_preserved: 'legacy (preserved)',
};

const REASON_DESC: Record<string, string> = {
  missing_input: 'missing upstream input',
  no_dataset_match: 'no dataset entry matched',
  not_applicable: 'not applicable to this configuration',
  out_of_range: 'value is out of allowed range',
  default_fallback: 'default value applied',
  override_applied: 'manual override applied',
  legacy_preserved_no_recalc: 'preserved from v1.x — not recalculated',
};

function defaultFormat<T>(value: T): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—';
    // Three decimals is enough resolution for IB / k_total / R / X / etc.
    const abs = Math.abs(value);
    if (abs >= 100 || Number.isInteger(value)) return value.toFixed(2);
    return value.toFixed(3);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function DerivedFieldDisplay<T>({
  label,
  state,
  unit,
  formatter,
}: Props<T>): React.ReactElement {
  const fmt = formatter ?? defaultFormat;
  const valueStr = state.value == null ? '—' : fmt(state.value);
  const valueWithUnit = state.value != null && unit ? `${valueStr} ${unit}` : valueStr;

  // Reason / formula / datasetRef → secondary description line.
  const subtitle: string[] = [];
  if (state.reason) subtitle.push(REASON_DESC[state.reason] ?? state.reason);
  if (state.formula) subtitle.push(`formula: ${state.formula}`);
  if (state.datasetRef) subtitle.push(`dataset: ${state.datasetRef}`);

  return (
    <div
      className={`derived-field derived-field-${state.status}`}
      data-testid={`derived-field-${labelKey(label)}`}
      data-source={state.source}
      data-status={state.status}
    >
      <div className="derived-field-row">
        <span className="derived-field-label">{label}</span>
        <span className="derived-field-value">{valueWithUnit}</span>
        <SourceIcon source={state.source} className="derived-field-icon" />
        <StatusBadge status={state.status} />
      </div>
      <div className="derived-field-sub muted">
        <span>{SOURCE_DESC[state.source]}</span>
        {subtitle.length > 0 && <span> — {subtitle.join(' · ')}</span>}
        {state.warnings && state.warnings.length > 0 && (
          <ul className="derived-field-warnings">
            {state.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function labelKey(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
