/**
 * Design current (IB) — PRD §11.1.
 *
 *   3-phase: IB = (P × 1000) / (√3 × V × cosφ × η) × df
 *   1-phase: IB = (P × 1000) / (V × cosφ × η) × df
 *
 * Override path (OQ-5) is handled by the orchestrator — this module only
 * covers the load-based calculation.
 */

import Decimal from 'decimal.js';
import type { Phase } from '../types/index.js';

export interface DesignCurrentInput {
  powerKW: number;
  voltageV: number;
  phase: Phase;
  powerFactor: number;
  efficiency: number;
  demandFactor: number;
}

export interface DesignCurrentBreakdown {
  designCurrentA: number;
  /** Intermediate values for audit trail. */
  intermediate: {
    powerW: number;
    denominator: number;
    preDemandFactorA: number;
  };
}

export function designCurrent(input: DesignCurrentInput): DesignCurrentBreakdown {
  const { powerKW, voltageV, phase, powerFactor, efficiency, demandFactor } = input;

  // Guard — should already be caught by validation, but keep the math sane.
  if (powerFactor <= 0) throw new Error('powerFactor must be > 0');
  if (efficiency <= 0) throw new Error('efficiency must be > 0');
  if (voltageV <= 0) throw new Error('voltageV must be > 0');

  const p = new Decimal(powerKW).mul(1000); // W
  const sqrt3 = new Decimal(3).sqrt();
  const denom =
    phase === 3
      ? sqrt3.mul(voltageV).mul(powerFactor).mul(efficiency)
      : new Decimal(voltageV).mul(powerFactor).mul(efficiency);

  const preDf = p.div(denom);
  const ib = preDf.mul(demandFactor);

  return {
    designCurrentA: ib.toNumber(),
    intermediate: {
      powerW: p.toNumber(),
      denominator: denom.toNumber(),
      preDemandFactorA: preDf.toNumber(),
    },
  };
}
