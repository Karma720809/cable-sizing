/**
 * Charging current (Ic) for the Korean MV system. Calc Spec v0.2 §5.
 *
 *   Ic_per_km   [A/km] = 2π · f · C(F/km) · U₀(V)
 *   Ic_total    [A]    = Ic_per_km · L(km)
 *
 * The MV system is 22.9kV-Y multi-grounded, so U₀ = 22900 / √3 ≈ 13.2kV.
 * The dataset stores capacitance in μF/km (×10⁻⁶ F/km).
 *
 * Amendment 1 — when Ic ≥ threshold·IB, the engine folds Ic into IB as a
 * conservative absolute-value sum (W-MV-CHARGING-CONSERVATIVE):
 *
 *   I_eff = √(IB² + Ic²)
 *
 * Phase cancellation between charging and load currents is intentionally
 * ignored in MVP-1 (worst-case envelope).
 */

import Decimal from 'decimal.js';
import { exactOnly } from '../utils/lookup.js';
import type { MvCableType, MvCapacitanceDataset } from './types-mv.js';

export interface ChargingCurrentInputs {
  capacitance: { datasets: readonly MvCapacitanceDataset[] };
  cableType: MvCableType;
  csaMm2: number;
  /** Override (μF/km). When provided, supersedes the dataset value. */
  capacitanceOverrideUFPerKm: number | null | undefined;
  /** U₀ (line-to-ground voltage, V). 13200 for 22.9kV-Y. */
  lineToGroundV: number;
  frequencyHz: number;
  /** Cable length (m). */
  lengthM: number;
  /** Design current IB (A) for threshold comparison. */
  designCurrentA: number;
  /** Threshold = Ic/IB ratio above which Ic is folded into I_eff. */
  threshold: number;
}

export interface ChargingCurrentBreakdown {
  ok: true;
  capacitanceUFPerKm: number;
  ic_A_per_km: number;
  ic_A: number;
  effectiveCurrentA: number;
  applied: boolean;
  overrideUsed: boolean;
}

export interface ChargingCurrentLookupError {
  ok: false;
  code: 'E-MV-LOOKUP-003';
  message: string;
}

export function computeChargingCurrent(
  input: ChargingCurrentInputs,
): ChargingCurrentBreakdown | ChargingCurrentLookupError {
  let capUF: number | null = null;
  let overrideUsed = false;

  if (typeof input.capacitanceOverrideUFPerKm === 'number' && input.capacitanceOverrideUFPerKm > 0) {
    capUF = input.capacitanceOverrideUFPerKm;
    overrideUsed = true;
  } else {
    const ds = input.capacitance.datasets.find((d) => d.cableType === input.cableType);
    if (!ds) {
      return {
        ok: false,
        code: 'E-MV-LOOKUP-003',
        message: `No capacitance dataset for cableType=${input.cableType}`,
      };
    }
    const row = exactOnly(ds.rows, input.csaMm2, (r) => r.csaMm2);
    if (!row) {
      return {
        ok: false,
        code: 'E-MV-LOOKUP-003',
        message: `No capacitance row for csa=${input.csaMm2}mm² in ${ds.id}`,
      };
    }
    capUF = row.capacitance_uF_per_km;
  }

  // Ic_per_km (A/km) = 2π·f·C(F/km)·U₀
  const C_F_per_km = new Decimal(capUF).mul(1e-6); // μF → F
  const ic_per_km = new Decimal(2)
    .mul(Math.PI)
    .mul(input.frequencyHz)
    .mul(C_F_per_km)
    .mul(input.lineToGroundV);
  const lengthKm = new Decimal(input.lengthM).div(1000);
  const ic_total = ic_per_km.mul(lengthKm);

  const icNum = ic_total.toNumber();
  const ratio = input.designCurrentA > 0 ? icNum / input.designCurrentA : 0;
  const applied = ratio >= input.threshold;

  const i_eff = applied
    ? Math.sqrt(input.designCurrentA * input.designCurrentA + icNum * icNum)
    : input.designCurrentA;

  return {
    ok: true,
    capacitanceUFPerKm: capUF,
    ic_A_per_km: ic_per_km.toNumber(),
    ic_A: icNum,
    effectiveCurrentA: i_eff,
    applied,
    overrideUsed,
  };
}
