/**
 * Voltage drop scan for the Korean MV system. Calc Spec v0.2 §6.
 *
 * Iterates the standard size ladder beginning at `startCsaMm2`, looks up
 * R/X/C for each candidate, recomputes Ic + I_eff (since C is csa-dependent),
 * and selects the first csa whose ΔU% ≤ maxAllowedPercent. Reactance is
 * always included for MV (per spec — no LV-style ignoreBelow shortcut).
 *
 * The actual ΔU formula is shared with the LV physics primitive.
 */

import { exactOnly } from '../utils/lookup.js';
import { voltageDrop } from '../physics/voltage-drop.js';
import { computeChargingCurrent } from './charging-current.js';
import type {
  MvCableType,
  MvCapacitanceDataset,
  MvImpedanceDataset,
} from './types-mv.js';

export interface VoltageDropScanInput {
  /** Standard sizes in ascending order. */
  standardSizes: readonly number[];
  /** Smallest csa to evaluate (the ampacity-driven minimum). */
  startCsaMm2: number;
  /** Maximum csa to evaluate (the largest standard size). Inclusive. */
  endCsaMm2: number;
  impedance: { datasets: readonly MvImpedanceDataset[] };
  capacitance: { datasets: readonly MvCapacitanceDataset[] };
  cableType: MvCableType;
  capacitanceOverrideUFPerKm: number | null | undefined;
  /** Phase-to-phase nominal (V). MV is always 22900 V. */
  voltageV: number;
  lineToGroundV: number;
  powerFactor: number;
  /** IB (A) — base design current. */
  designCurrentA: number;
  /** Length (m). */
  lengthM: number;
  frequencyHz: number;
  chargingCurrentThreshold: number;
  maxAllowedPercent: number;
}

export interface VoltageDropCandidate {
  csaMm2: number;
  rOhmPerKm: number;
  xOhmPerKm: number;
  capacitanceUFPerKm: number;
  ic_A: number;
  effectiveCurrentA: number;
  dropV: number;
  dropPercent: number;
  pass: boolean;
}

export interface VoltageDropScanOk {
  ok: true;
  /** First csa whose ΔU% ≤ max. May be null if none satisfies. */
  selectedCSAmm2: number | null;
  /** Final detailed result for the selected csa (or last evaluated if none pass). */
  selected: VoltageDropCandidate | null;
  /** Every candidate evaluated (in order). */
  candidates: VoltageDropCandidate[];
}

export interface VoltageDropScanErr {
  ok: false;
  code: 'E-MV-LOOKUP-002' | 'E-MV-LOOKUP-003';
  message: string;
}

export function voltageDropScan(input: VoltageDropScanInput): VoltageDropScanOk | VoltageDropScanErr {
  // Choose the impedance dataset matching cableType — there is exactly one in v1.
  const imp = input.impedance.datasets.find((d) => d.cableType === input.cableType);
  if (!imp) {
    return {
      ok: false,
      code: 'E-MV-LOOKUP-002',
      message: `No impedance dataset for cableType=${input.cableType}`,
    };
  }

  const candidates: VoltageDropCandidate[] = [];
  let chosen: VoltageDropCandidate | null = null;

  for (const csa of input.standardSizes) {
    if (csa < input.startCsaMm2) continue;
    if (csa > input.endCsaMm2) break;

    const impRow = exactOnly(imp.rows, csa, (r) => r.csaMm2);
    if (!impRow) {
      return {
        ok: false,
        code: 'E-MV-LOOKUP-002',
        message: `No impedance row for csa=${csa}mm² in ${imp.id}`,
      };
    }

    // Charging current (csa-dependent).
    const ic = computeChargingCurrent({
      capacitance: input.capacitance,
      cableType: input.cableType,
      csaMm2: csa,
      capacitanceOverrideUFPerKm: input.capacitanceOverrideUFPerKm,
      lineToGroundV: input.lineToGroundV,
      frequencyHz: input.frequencyHz,
      lengthM: input.lengthM,
      designCurrentA: input.designCurrentA,
      threshold: input.chargingCurrentThreshold,
    });
    if (!ic.ok) {
      return { ok: false, code: 'E-MV-LOOKUP-003', message: ic.message };
    }

    const vd = voltageDrop({
      designCurrentA: ic.effectiveCurrentA,
      voltageV: input.voltageV,
      phase: 3,
      powerFactor: input.powerFactor,
      rOhmPerKm: impRow.r_ohm_per_km,
      xOhmPerKm: impRow.x_ohm_per_km,
      lengthM: input.lengthM,
    });

    const candidate: VoltageDropCandidate = {
      csaMm2: csa,
      rOhmPerKm: impRow.r_ohm_per_km,
      xOhmPerKm: impRow.x_ohm_per_km,
      capacitanceUFPerKm: ic.capacitanceUFPerKm,
      ic_A: ic.ic_A,
      effectiveCurrentA: ic.effectiveCurrentA,
      dropV: vd.dropV,
      dropPercent: vd.dropPercent,
      pass: vd.dropPercent <= input.maxAllowedPercent,
    };
    candidates.push(candidate);
    if (candidate.pass && chosen === null) {
      chosen = candidate;
    }
  }

  return {
    ok: true,
    selectedCSAmm2: chosen?.csaMm2 ?? null,
    selected: chosen ?? candidates[candidates.length - 1] ?? null,
    candidates,
  };
}
