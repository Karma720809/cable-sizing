/**
 * LoadInputFields — load-type-specific input layout (CR-OQ-1).
 *
 * Per Implementation_Spec §4.5:
 *   motor       → FLA primary + P_kW fallback
 *   transformer → kVA only
 *   general / lighting / heater → P_kW
 *
 * Hiding the irrelevant fields directly addresses AC-1 ("input field
 * count reduced — natural fields per load type"). powerFactor,
 * efficiency and demandFactor live above the type-specific block as
 * shared modifiers; the form keeps them where users already expect
 * them.
 */
import React from 'react';

export type LoadType = 'general' | 'motor' | 'heater' | 'lighting' | 'transformer';

export interface LoadValues {
  loadType: LoadType;
  powerKW: number;
  fla: number;
  kva: number;
}

interface Props {
  values: LoadValues;
  onChange: (patch: Partial<LoadValues>) => void;
}

export function LoadInputFields({ values, onChange }: Props): React.ReactElement {
  const { loadType } = values;

  return (
    <div className="load-input-fields" data-testid="load-input-fields">
      <SelectField
        label="Load type"
        value={loadType}
        options={[
          ['general', 'General'],
          ['motor', 'Motor'],
          ['heater', 'Heater'],
          ['lighting', 'Lighting'],
          ['transformer', 'Transformer (kVA)'],
        ]}
        onChange={(s) => onChange({ loadType: s as LoadType })}
        testId="load-type-select"
      />

      {loadType === 'motor' && (
        <>
          <NumField
            label="FLA (A)"
            value={values.fla}
            onChange={(n) => onChange({ fla: n })}
            testId="load-fla"
          />
          <details className="advanced">
            <summary>Power input fallback</summary>
            <NumField
              label="Power (kW) — used if FLA unavailable"
              value={values.powerKW}
              onChange={(n) => onChange({ powerKW: n })}
              testId="load-powerkw-fallback"
            />
          </details>
        </>
      )}

      {loadType === 'transformer' && (
        <NumField
          label="Apparent power (kVA)"
          value={values.kva}
          step={1}
          onChange={(n) => onChange({ kva: n })}
          testId="load-kva"
        />
      )}

      {loadType !== 'motor' && loadType !== 'transformer' && (
        <NumField
          label="Power (kW)"
          value={values.powerKW}
          onChange={(n) => onChange({ powerKW: n })}
          testId="load-powerkw"
        />
      )}
    </div>
  );
}

// ─── Local primitives (do not depend on CircuitForm to keep this leaf
// independently mountable in tests) ──────────────────────────────────

function NumField({
  label,
  value,
  onChange,
  step = 1,
  testId,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  step?: number;
  testId?: string;
}): React.ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
        data-testid={testId}
      />
    </label>
  );
}

function SelectField<V extends string>({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: V;
  options: ReadonlyArray<readonly [V, string]>;
  onChange: (v: V) => void;
  testId?: string;
}): React.ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as V)}
        data-testid={testId}
      >
        {options.map(([v, text]) => (
          <option key={v} value={v}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
