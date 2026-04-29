/**
 * v1.3 Stage B — design current (I_B) derivation with FieldState provenance.
 *
 * Resolution order (CR-OQ-1, plus Stage B precedence rule):
 *   1. `overrides.designCurrent`              → source = override, W-CR-001
 *   2. `load.designCurrentOverrideA` (legacy) → source = override, W-IB-OVERRIDE + W-CR-006 (deprecation)
 *   3. derived from load fields per `load.type`:
 *        motor + fla present  → I_B = FLA · df              (formula = IB_FLA)
 *        transformer + kva    → I_B = (kVA·1000)/(√3 V) · df (3φ, IB_3PH_KVA)
 *                             | I_B = (kVA·1000)/V · df       (1φ, IB_1PH_KVA)
 *        otherwise (powerKW)  → existing physics/current.ts formula
 *      Returns FieldState<number> with source = auto_formula.
 *
 * Pure function. No engine logic outside the formulas; orchestrator
 * applies the warnings + audit step.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §6.1;
 *       Implementation_Spec_LV_v2.0 §3.1.
 */
import Decimal from 'decimal.js';
import type { CircuitInput, FieldState, WarningCode, Warning } from '../types/index.js';
import { FieldStateBuilder } from '../types/field-state.js';
import { designCurrent as designCurrentPowerKW } from '../physics/current.js';

export const FORMULA_IDS = {
  IB_3PH_KW: 'IB_3PH_KW',
  IB_1PH_KW: 'IB_1PH_KW',
  IB_FLA: 'IB_FLA',
  IB_3PH_KVA: 'IB_3PH_KVA',
  IB_1PH_KVA: 'IB_1PH_KVA',
  OVERRIDE: 'IB_OVERRIDE',
} as const;

export interface DeriveDesignCurrentResult {
  state: FieldState<number>;
  /** Resolved I_B value if status === 'valid'; else null. */
  designCurrentA: number | null;
  /** Warnings the pipeline should append (in order). */
  warnings: Warning[];
  /** Audit-ready intermediate values for the FieldState's `inputs` snapshot. */
  intermediate: Record<string, unknown>;
}

function pushWarning(out: Warning[], code: WarningCode, message: string, field?: string): void {
  out.push(field ? { code, message, field } : { code, message });
}

export function deriveDesignCurrent(input: CircuitInput): DeriveDesignCurrentResult {
  const warnings: Warning[] = [];

  // ── 1. New-style override (CR-OQ-1) ────────────────────────────────
  const newOverride = input.overrides?.designCurrent;
  if (typeof newOverride === 'number' && Number.isFinite(newOverride) && newOverride > 0) {
    pushWarning(
      warnings,
      'W-CR-001',
      `designCurrent overridden to ${newOverride} A via overrides.designCurrent (load params ignored)`,
      'overrides.designCurrent',
    );
    return {
      state: FieldStateBuilder.override<number>(newOverride),
      designCurrentA: newOverride,
      warnings,
      intermediate: { source: 'overrides.designCurrent', I_B: newOverride },
    };
  }

  // ── 2. Legacy override (deprecated) ────────────────────────────────
  const legacyOverride = input.load.designCurrentOverrideA;
  if (typeof legacyOverride === 'number' && Number.isFinite(legacyOverride) && legacyOverride > 0) {
    pushWarning(
      warnings,
      'W-IB-OVERRIDE',
      `designCurrent overridden to ${legacyOverride} A (load params ignored)`,
      'load.designCurrentOverrideA',
    );
    pushWarning(
      warnings,
      'W-CR-006',
      'load.designCurrentOverrideA is deprecated; use overrides.designCurrent (Stage B coexistence window)',
      'load.designCurrentOverrideA',
    );
    return {
      state: FieldStateBuilder.override<number>(legacyOverride),
      designCurrentA: legacyOverride,
      warnings,
      intermediate: { source: 'load.designCurrentOverrideA', I_B: legacyOverride },
    };
  }

  // ── 3. Derived from load type ──────────────────────────────────────
  const phase = input.system.phase;
  const voltageV = input.system.voltageV;
  const df = input.load.demandFactor ?? 1.0;

  // 3a. motor + FLA → I_B = FLA · df
  if (input.load.type === 'motor') {
    const fla = input.load.fla;
    if (typeof fla === 'number' && Number.isFinite(fla) && fla > 0) {
      const ib = new Decimal(fla).mul(df).toNumber();
      const inputs = { fla, demandFactor: df, formula: 'IB = FLA · df' };
      return {
        state: FieldStateBuilder.autoFormula<number>(ib, FORMULA_IDS.IB_FLA, inputs),
        designCurrentA: ib,
        warnings,
        intermediate: { ...inputs, I_B: ib },
      };
    }
  }

  // 3b. transformer + kVA → IB = (kVA·1000)/(√3·V) · df (or /V for 1φ)
  if (input.load.type === 'transformer') {
    const kva = input.load.kva;
    if (typeof kva === 'number' && Number.isFinite(kva) && kva > 0 && voltageV > 0) {
      const sqrt3 = new Decimal(3).sqrt();
      const denom = phase === 3 ? sqrt3.mul(voltageV) : new Decimal(voltageV);
      const ib = new Decimal(kva).mul(1000).div(denom).mul(df).toNumber();
      const formulaId = phase === 3 ? FORMULA_IDS.IB_3PH_KVA : FORMULA_IDS.IB_1PH_KVA;
      const formula =
        phase === 3 ? 'IB = (kVA·1000)/(√3·V) · df' : 'IB = (kVA·1000)/V · df';
      const inputs = { kva, voltageV, phase, demandFactor: df, formula };
      return {
        state: FieldStateBuilder.autoFormula<number>(ib, formulaId, inputs),
        designCurrentA: ib,
        warnings,
        intermediate: { ...inputs, I_B: ib },
      };
    }
    // kva missing on transformer — treat as incomplete
    return {
      state: FieldStateBuilder.incomplete('missing_input'),
      designCurrentA: null,
      warnings,
      intermediate: { reason: 'transformer requires kva input' },
    };
  }

  // 3c. powerKW path (general / lighting / heater / motor without FLA)
  const powerKW = input.load.powerKW;
  const cosphi = input.load.powerFactor;
  const eta = input.load.efficiency;
  if (
    typeof powerKW !== 'number' ||
    !Number.isFinite(powerKW) ||
    powerKW <= 0 ||
    typeof cosphi !== 'number' ||
    !Number.isFinite(cosphi) ||
    cosphi <= 0 ||
    typeof eta !== 'number' ||
    !Number.isFinite(eta) ||
    eta <= 0
  ) {
    return {
      state: FieldStateBuilder.incomplete('missing_input'),
      designCurrentA: null,
      warnings,
      intermediate: { reason: 'powerKW / powerFactor / efficiency missing or invalid' },
    };
  }
  const { designCurrentA: ib, intermediate } = designCurrentPowerKW({
    powerKW,
    voltageV,
    phase,
    powerFactor: cosphi,
    efficiency: eta,
    demandFactor: df,
  });
  const formulaId = phase === 3 ? FORMULA_IDS.IB_3PH_KW : FORMULA_IDS.IB_1PH_KW;
  const formula =
    phase === 3
      ? 'IB = (P·1000)/(√3·V·cosφ·η) · df'
      : 'IB = (P·1000)/(V·cosφ·η) · df';
  const inputs = {
    powerKW,
    voltageV,
    phase,
    powerFactor: cosphi,
    efficiency: eta,
    demandFactor: df,
    formula,
  };
  return {
    state: FieldStateBuilder.autoFormula<number>(ib, formulaId, inputs),
    designCurrentA: ib,
    warnings,
    intermediate: { ...inputs, ...intermediate, I_B: ib },
  };
}
