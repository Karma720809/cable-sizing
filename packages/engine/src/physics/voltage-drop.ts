/**
 * Voltage drop — PRD §11.3.
 *
 *   3-phase: ΔU = √3 × IB × (R·cosφ + X·sinφ) × L_km
 *   1-phase: ΔU =   2 × IB × (R·cosφ + X·sinφ) × L_km
 *
 *   ΔU% = (ΔU / Un) × 100
 *
 * Caller (orchestrator) is responsible for setting X=0 when:
 *   - useReactance === false
 *   - candidate csa < ignoreReactanceBelowMm2
 */

import Decimal from 'decimal.js';
import type { Phase } from '../types/index.js';

export interface VoltageDropInput {
  designCurrentA: number;
  voltageV: number;
  phase: Phase;
  powerFactor: number;
  /** Resistance in Ω/km at reference temperature. */
  rOhmPerKm: number;
  /** Reactance in Ω/km. Pass 0 to ignore. */
  xOhmPerKm: number;
  lengthM: number;
}

export interface VoltageDropBreakdown {
  dropV: number;
  dropPercent: number;
  intermediate: {
    sinPhi: number;
    lengthKm: number;
    rCosPlusXSin: number;
    multiplier: number; // √3 or 2
  };
}

export function voltageDrop(input: VoltageDropInput): VoltageDropBreakdown {
  const { designCurrentA, voltageV, phase, powerFactor, rOhmPerKm, xOhmPerKm, lengthM } = input;

  if (voltageV <= 0) throw new Error('voltageV must be > 0');
  if (lengthM <= 0) throw new Error('lengthM must be > 0');
  if (powerFactor < 0 || powerFactor > 1) throw new Error('powerFactor must be in [0, 1]');

  const sinPhi = Math.sqrt(Math.max(0, 1 - powerFactor * powerFactor));
  const lengthKm = new Decimal(lengthM).div(1000);
  const rCosPlusXSin = new Decimal(rOhmPerKm).mul(powerFactor).plus(new Decimal(xOhmPerKm).mul(sinPhi));
  const multiplier = phase === 3 ? new Decimal(3).sqrt() : new Decimal(2);

  const dropV = multiplier.mul(designCurrentA).mul(rCosPlusXSin).mul(lengthKm);
  const dropPercent = dropV.div(voltageV).mul(100);

  return {
    dropV: dropV.toNumber(),
    dropPercent: dropPercent.toNumber(),
    intermediate: {
      sinPhi,
      lengthKm: lengthKm.toNumber(),
      rCosPlusXSin: rCosPlusXSin.toNumber(),
      multiplier: multiplier.toNumber(),
    },
  };
}
