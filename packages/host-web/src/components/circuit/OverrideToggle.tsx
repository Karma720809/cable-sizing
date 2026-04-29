/**
 * OverrideToggle — checkbox + numeric input pair backing the three
 * AUTO_OVERRIDE_FIELDS (designCurrent, loadedConductors, armourCsaMm2).
 *
 * Behaviour (Implementation_Spec §4.2 / CR-OQ-4):
 *   ON  → render the numeric input; current value preferred over the
 *         stored session draft; emits `onValueChange` on edit.
 *   OFF → numeric input hidden; the previously typed value stays in
 *         the parent's `OverrideDrafts` map (we never call clearDraft
 *         here).
 *   Re-ON → input pre-fills from drafts (parent handles via
 *           restoreDraft) without recomputing the engine's auto value.
 *
 * The component is *controlled*: parent owns both the boolean and the
 * numeric value. Drafts management lives in the parent because multiple
 * fields share the same drafts bag.
 */
import React from 'react';

interface Props {
  fieldId: string;
  label: string;
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  value: number;
  onValueChange: (n: number) => void;
  unit?: string | undefined;
  step?: number | undefined;
  min?: number | undefined;
  /** Optional precomputed auto value for the disabled hint. */
  autoHint?: string | undefined;
}

export function OverrideToggle({
  fieldId,
  label,
  enabled,
  onToggle,
  value,
  onValueChange,
  unit,
  step = 1,
  min,
  autoHint,
}: Props): React.ReactElement {
  const inputId = `override-${fieldId}`;
  return (
    <div className="override-toggle" data-testid={`override-toggle-${fieldId}`}>
      <label className="field field-check">
        <span>{label}</span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onToggle(e.target.checked)}
          aria-controls={inputId}
        />
      </label>
      {enabled ? (
        <label className="field" htmlFor={inputId}>
          <span>
            Override value{unit ? ` (${unit})` : ''}
          </span>
          <input
            id={inputId}
            type="number"
            value={value}
            step={step}
            min={min}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) onValueChange(n);
            }}
            data-testid={`override-input-${fieldId}`}
          />
        </label>
      ) : (
        autoHint && (
          <div className="override-hint muted" data-testid={`override-hint-${fieldId}`}>
            Auto: {autoHint}
          </div>
        )
      )}
    </div>
  );
}
