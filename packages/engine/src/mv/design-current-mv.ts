/**
 * Design current (IB) for the Korean MV system. Calc Spec v0.2 §2.
 *
 *   3-phase general/motor:
 *     IB = (P_kW × 1000) / (√3 × V × cosφ × η) × df
 *
 *   3-phase transformer (no derating — nameplate apparent power directly):
 *     IB = (S_MVA × 1,000,000) / (√3 × V)
 *
 *   Override path:
 *     IB = designCurrentOverrideA  (W-MV-IB-OVERRIDE)
 */

import Decimal from 'decimal.js';
import type { MvLoadType } from './types-mv.js';

export interface MvDesignCurrentInput {
  loadType: MvLoadType;
  voltageV: number;
  powerKW: number | null;
  apparentPowerMVA: number | null;
  powerFactor: number | null;
  efficiency: number | null;
  demandFactor: number | null;
  designCurrentOverrideA?: number | null | undefined;
}

export interface MvDesignCurrentBreakdown {
  designCurrentA: number;
  source: 'override' | 'general' | 'motor' | 'transformer';
  intermediate: Record<string, number>;
}

export class MvDesignCurrentError extends Error {
  constructor(
    message: string,
    readonly code: 'E-MV-VAL-002',
  ) {
    super(message);
    this.name = 'MvDesignCurrentError';
  }
}

export function designCurrentMv(input: MvDesignCurrentInput): MvDesignCurrentBreakdown {
  if (typeof input.designCurrentOverrideA === 'number' && input.designCurrentOverrideA > 0) {
    return {
      designCurrentA: input.designCurrentOverrideA,
      source: 'override',
      intermediate: { override: input.designCurrentOverrideA },
    };
  }

  if (input.voltageV <= 0) {
    throw new MvDesignCurrentError('voltageV must be > 0', 'E-MV-VAL-002');
  }
  const sqrt3 = new Decimal(3).sqrt();

  if (input.loadType === 'transformer') {
    if (input.apparentPowerMVA == null || input.apparentPowerMVA <= 0) {
      throw new MvDesignCurrentError('apparentPowerMVA required for transformer load', 'E-MV-VAL-002');
    }
    const sVA = new Decimal(input.apparentPowerMVA).mul(1_000_000);
    const ib = sVA.div(sqrt3.mul(input.voltageV));
    return {
      designCurrentA: ib.toNumber(),
      source: 'transformer',
      intermediate: { sVA: sVA.toNumber(), denom: sqrt3.mul(input.voltageV).toNumber() },
    };
  }

  // general or motor
  if (input.powerKW == null || input.powerKW <= 0) {
    throw new MvDesignCurrentError('powerKW required for general/motor load', 'E-MV-VAL-002');
  }
  if (input.powerFactor == null || input.powerFactor <= 0 || input.powerFactor > 1) {
    throw new MvDesignCurrentError('powerFactor must be in (0, 1]', 'E-MV-VAL-002');
  }
  if (input.efficiency == null || input.efficiency <= 0 || input.efficiency > 1) {
    throw new MvDesignCurrentError('efficiency must be in (0, 1]', 'E-MV-VAL-002');
  }
  if (input.demandFactor == null || input.demandFactor <= 0) {
    throw new MvDesignCurrentError('demandFactor must be > 0', 'E-MV-VAL-002');
  }

  const p = new Decimal(input.powerKW).mul(1000);
  const denom = sqrt3.mul(input.voltageV).mul(input.powerFactor).mul(input.efficiency);
  const preDf = p.div(denom);
  const ib = preDf.mul(input.demandFactor);

  return {
    designCurrentA: ib.toNumber(),
    source: input.loadType,
    intermediate: {
      powerW: p.toNumber(),
      denominator: denom.toNumber(),
      preDemandFactorA: preDf.toNumber(),
    },
  };
}
