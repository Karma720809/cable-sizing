/**
 * v1.3 Stage B — loaded-conductors derivation (CR-OQ-3).
 *
 * Decision table:
 *
 *   topology  | neutralCarriesCurrent | result
 *   --------- + --------------------- + ------
 *   1ph2w     | *                     |   2
 *   1ph3w     | false  (or undefined) |   2
 *   1ph3w     | true                  |   3
 *   3ph3w     | *                     |   3
 *   3ph4w     | false  (or undefined) |   3
 *   3ph4w     | true                  |   4   (I-CR-001)
 *
 *   topology absent → fall back to phase-based legacy:
 *     phase=1 → 2  (matches existing pipeline behavior)
 *     phase=3 → 3
 *
 * Resolution order:
 *   1. `overrides.loadedConductors`        → source = override, W-CR-005
 *   2. derivation table above              → source = auto_formula
 *
 * The orchestrator clamps the value to {2, 3} for the ampacity table
 * lookup (datasets cover 2-loaded and 3-loaded only). When the derived
 * value is 4, the orchestrator emits W-CR-008 noting that 4-loaded
 * derating (k4) is out of scope for v1.3 (§6.2 footnote).
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §6.2;
 *       Implementation_Spec_LV_v2.0 §3.1.
 */
import type {
  CircuitInput,
  FieldState,
  Warning,
  InfoMessage,
} from '../types/index.js';
import { FieldStateBuilder } from '../types/field-state.js';

export interface DeriveLoadedConductorsResult {
  state: FieldState<number>;
  /** Resolved value. 2 | 3 | 4 (or null on invalid override). */
  loadedConductors: number | null;
  /** True if topology + neutral toggle promoted the value to 4. */
  promotedByNeutral: boolean;
  warnings: Warning[];
  /** I-CR-001 message when neutralCarriesCurrent toggled 3 → 4. */
  info: InfoMessage[];
}

function classify(input: CircuitInput): {
  value: number;
  formula: string;
  inputs: Record<string, unknown>;
  promotedByNeutral: boolean;
} {
  const top = input.system.topology;
  const ncc = input.neutralCarriesCurrent === true;
  if (top != null) {
    switch (top) {
      case '1ph2w':
        return {
          value: 2,
          formula: 'topology=1ph2w → 2',
          inputs: { topology: top },
          promotedByNeutral: false,
        };
      case '1ph3w':
        return {
          value: ncc ? 3 : 2,
          formula: ncc ? 'topology=1ph3w + neutral → 3' : 'topology=1ph3w → 2',
          inputs: { topology: top, neutralCarriesCurrent: ncc },
          promotedByNeutral: ncc,
        };
      case '3ph3w':
        return {
          value: 3,
          formula: 'topology=3ph3w → 3',
          inputs: { topology: top },
          promotedByNeutral: false,
        };
      case '3ph4w':
        return {
          value: ncc ? 4 : 3,
          formula: ncc ? 'topology=3ph4w + neutral → 4' : 'topology=3ph4w → 3',
          inputs: { topology: top, neutralCarriesCurrent: ncc },
          promotedByNeutral: ncc,
        };
    }
  }
  // Fallback to legacy phase-based determination (matches pre-v1.3 pipeline).
  const phase = input.system.phase;
  return {
    value: phase === 1 ? 2 : 3,
    formula:
      phase === 1
        ? 'topology absent + phase=1 → 2 (legacy fallback)'
        : 'topology absent + phase=3 → 3 (legacy fallback)',
    inputs: { phase, topologyAbsent: true },
    promotedByNeutral: false,
  };
}

export function deriveLoadedConductors(input: CircuitInput): DeriveLoadedConductorsResult {
  const warnings: Warning[] = [];
  const info: InfoMessage[] = [];

  // ── 1. Override path ────────────────────────────────────────────────
  const ov = input.overrides?.loadedConductors;
  if (typeof ov === 'number' && Number.isFinite(ov) && Number.isInteger(ov) && ov >= 2 && ov <= 4) {
    warnings.push({
      code: 'W-CR-005',
      message: `loadedConductors overridden to ${ov} (derivation bypassed)`,
      field: 'overrides.loadedConductors',
    });
    return {
      state: FieldStateBuilder.override<number>(ov),
      loadedConductors: ov,
      promotedByNeutral: false,
      warnings,
      info,
    };
  }

  // ── 2. Derivation table ─────────────────────────────────────────────
  const c = classify(input);
  const state = FieldStateBuilder.autoFormula<number>(c.value, 'LC_TABLE_v1.3', c.inputs);
  if (c.promotedByNeutral && c.value === 4) {
    info.push({
      code: 'I-CR-001',
      message:
        '"중성선 부하 있음" 토글로 loadedConductors가 3 → 4로 자동 적용되었습니다 (3φ4선식)',
      field: 'neutralCarriesCurrent',
    });
  }
  return {
    state,
    loadedConductors: c.value,
    promotedByNeutral: c.promotedByNeutral && c.value === 4,
    warnings,
    info,
  };
}
