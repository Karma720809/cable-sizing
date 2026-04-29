/**
 * StatusBadge — colour-coded chip for FieldState.status.
 *
 * Visually parallels the existing .mini-chip used by ResultPanel so the
 * derivation-aware fields fit alongside the criteria table without
 * looking like a different component family.
 *
 * Spec: Implementation_Spec_LV_v2.0 §4.1
 *   valid       → green (--pass)
 *   unavailable → grey  (--incomplete) + "N/A" label
 *   incomplete  → red   (--fail)
 *   invalid     → red   (--fail)
 */
import React from 'react';
import type { FieldStatus } from '@cable-sizing/engine';

const LABELS: Record<FieldStatus, string> = {
  valid: 'OK',
  unavailable: 'N/A',
  incomplete: 'INCOMPLETE',
  invalid: 'INVALID',
};

const TITLES: Record<FieldStatus, string> = {
  valid: 'Value is ready for sizing.',
  unavailable: 'Not applicable to this configuration.',
  incomplete: 'Upstream input missing — value not derived.',
  invalid: 'Value is out of allowed range.',
};

interface Props {
  status: FieldStatus;
  /** Override the default short label (e.g. show a reason code). */
  label?: string;
  className?: string;
}

export function StatusBadge({ status, label, className }: Props): React.ReactElement {
  const cls = ['mini-chip', `field-status-${status}`, className].filter(Boolean).join(' ');
  return (
    <span
      className={cls}
      data-testid={`status-badge-${status}`}
      data-status={status}
      title={TITLES[status]}
    >
      {label ?? LABELS[status]}
    </span>
  );
}
