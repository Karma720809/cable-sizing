/**
 * ReferenceMethodSelector — Hybrid disclosure for IEC 60364-5-52
 * reference methods (CR-OQ-6).
 *
 * Default: shows the methods that are common AND compatible with the
 * current `cableType`. Toggling "Show all methods" surfaces every method
 * the engine supports, with incompatible ones disabled and a tooltip
 * explaining why.
 *
 * Compatibility rules are minimal — the engine itself rejects
 * incompatible combinations via E-LOOKUP-* errors, so the UI hint
 * doesn't need to mirror the dataset matrix exactly. We just need the
 * obvious-bad combinations grayed out:
 *   - F, G : single-core in free air → multicore is incompatible
 *   - A2, B2, C, E : multicore variants → single-core is incompatible
 *
 * The compatibility map intentionally lives here rather than in the
 * engine's DatasetManifest because the v1.3 spec calls for *UI* hints —
 * pulling it from manifest metadata would couple Stage C to a Stage D
 * dataset-side change.
 */
import React from 'react';

export type ReferenceMethodCode =
  | 'A1'
  | 'A2'
  | 'B1'
  | 'B2'
  | 'C'
  | 'D1'
  | 'D2'
  | 'E'
  | 'F'
  | 'G';

export type CableTypeForMethod = 'multicore' | 'single-core';

interface MethodMeta {
  code: ReferenceMethodCode;
  label: string;
  /** Cable types this method applies to. */
  appliesTo: ReadonlyArray<CableTypeForMethod>;
  /** Whether the method ships in the "common" default subset. */
  common: boolean;
  /** UI tooltip text. */
  tooltip: string;
}

const METHODS: ReadonlyArray<MethodMeta> = [
  {
    code: 'A1',
    label: 'A1 — insulated conductors in conduit in thermally insulated wall',
    appliesTo: ['single-core'],
    common: false,
    tooltip: 'Single-core conductors in conduit, thermally insulated wall (uncommon).',
  },
  {
    code: 'A2',
    label: 'A2 — multicore cable in conduit in thermally insulated wall',
    appliesTo: ['multicore'],
    common: false,
    tooltip: 'Multicore cable in conduit, thermally insulated wall (uncommon).',
  },
  {
    code: 'B1',
    label: 'B1 — insulated conductors in conduit on a wall',
    appliesTo: ['single-core'],
    common: true,
    tooltip: 'Single-core in conduit on a wall.',
  },
  {
    code: 'B2',
    label: 'B2 — multicore cable in conduit on a wall',
    appliesTo: ['multicore'],
    common: true,
    tooltip: 'Multicore in conduit on a wall.',
  },
  {
    code: 'C',
    label: 'C — multicore cable on a wall or surface',
    appliesTo: ['multicore'],
    common: true,
    tooltip: 'Multicore clipped directly to a wall or surface.',
  },
  {
    code: 'D1',
    label: 'D1 — multicore cable in buried conduit',
    appliesTo: ['multicore'],
    common: true,
    tooltip: 'Buried — requires soil resistivity input.',
  },
  {
    code: 'D2',
    label: 'D2 — multicore cable direct buried',
    appliesTo: ['multicore'],
    common: true,
    tooltip: 'Direct buried — requires soil resistivity input.',
  },
  {
    code: 'E',
    label: 'E — multicore in free air',
    appliesTo: ['multicore'],
    common: true,
    tooltip: 'Multicore in free air (e.g. cable tray).',
  },
  {
    code: 'F',
    label: 'F — single-core in free air (touching)',
    appliesTo: ['single-core'],
    common: true,
    tooltip: 'Single-core in free air, conductors touching.',
  },
  {
    code: 'G',
    label: 'G — single-core in free air (spaced)',
    appliesTo: ['single-core'],
    common: false,
    tooltip: 'Single-core in free air, spaced > 1·D apart.',
  },
];

export function isReferenceMethodCompatible(
  methodCode: ReferenceMethodCode,
  cableType: CableTypeForMethod,
): boolean {
  return METHODS.some((m) => m.code === methodCode && m.appliesTo.includes(cableType));
}

export function defaultReferenceMethodForCableType(
  cableType: CableTypeForMethod,
): ReferenceMethodCode {
  return METHODS.find((m) => m.common && m.appliesTo.includes(cableType))!.code;
}

export function coerceReferenceMethodForCableType(
  methodCode: ReferenceMethodCode,
  cableType: CableTypeForMethod,
): ReferenceMethodCode {
  return isReferenceMethodCompatible(methodCode, cableType)
    ? methodCode
    : defaultReferenceMethodForCableType(cableType);
}

interface Props {
  cableType: CableTypeForMethod;
  value: ReferenceMethodCode;
  onChange: (m: ReferenceMethodCode) => void;
  /** Controlled "show all" toggle. Optional — defaults to internal state. */
  showAll?: boolean;
  onToggleShowAll?: (showAll: boolean) => void;
}

export function ReferenceMethodSelector({
  cableType,
  value,
  onChange,
  showAll: showAllProp,
  onToggleShowAll,
}: Props): React.ReactElement {
  const [showAllState, setShowAllState] = React.useState(false);
  const showAll = showAllProp ?? showAllState;
  const setShowAll = (next: boolean): void => {
    if (onToggleShowAll) onToggleShowAll(next);
    else setShowAllState(next);
  };

  const coercedValue = coerceReferenceMethodForCableType(value, cableType);

  React.useEffect(() => {
    if (coercedValue !== value) onChange(coercedValue);
  }, [coercedValue, onChange, value]);

  const visible = showAll
    ? METHODS
    : METHODS.filter((m) => m.common && m.appliesTo.includes(cableType));

  return (
    <div className="ref-method-selector" data-testid="reference-method-selector">
      <label className="field">
        <span>Reference method</span>
        <select
          value={coercedValue}
          onChange={(e) => onChange(e.target.value as ReferenceMethodCode)}
          data-testid="reference-method-select"
        >
          {visible.map((m) => {
            const incompatible = !m.appliesTo.includes(cableType);
            return (
              <option
                key={m.code}
                value={m.code}
                disabled={incompatible}
                title={
                  incompatible
                    ? `Method ${m.code} requires ${m.appliesTo.join(' or ')} (current: ${cableType}).`
                    : m.tooltip
                }
              >
                {m.label}
                {incompatible ? ' — N/A for current cable type' : ''}
              </option>
            );
          })}
        </select>
      </label>
      <label className="field field-check">
        <span>Show all installation methods</span>
        <input
          type="checkbox"
          checked={showAll}
          onChange={(e) => setShowAll(e.target.checked)}
          data-testid="reference-method-show-all"
        />
      </label>
    </div>
  );
}
