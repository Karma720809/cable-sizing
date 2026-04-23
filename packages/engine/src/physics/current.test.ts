import { describe, it, expect } from 'vitest';
import { designCurrent } from './current.js';

describe('designCurrent (IB)', () => {
  it('computes 3-phase with full factors', () => {
    // P=50 kW, V=400, cosφ=0.85, η=0.9, df=1.0
    // IB = 50_000 / (sqrt(3) * 400 * 0.85 * 0.9) = 94.338… A
    const r = designCurrent({
      powerKW: 50,
      voltageV: 400,
      phase: 3,
      powerFactor: 0.85,
      efficiency: 0.9,
      demandFactor: 1.0,
    });
    expect(r.designCurrentA).toBeCloseTo(94.3383, 3);
  });

  it('applies demand factor', () => {
    const base = designCurrent({
      powerKW: 50,
      voltageV: 400,
      phase: 3,
      powerFactor: 0.85,
      efficiency: 0.9,
      demandFactor: 1.0,
    });
    const scaled = designCurrent({
      powerKW: 50,
      voltageV: 400,
      phase: 3,
      powerFactor: 0.85,
      efficiency: 0.9,
      demandFactor: 0.8,
    });
    expect(scaled.designCurrentA).toBeCloseTo(base.designCurrentA * 0.8, 5);
  });

  it('computes single-phase (no sqrt3)', () => {
    // P=5 kW, V=230, cosφ=1, η=1, df=1 → IB = 5000/230 = 21.739 A
    const r = designCurrent({
      powerKW: 5,
      voltageV: 230,
      phase: 1,
      powerFactor: 1,
      efficiency: 1,
      demandFactor: 1,
    });
    expect(r.designCurrentA).toBeCloseTo(21.7391, 3);
  });

  it('throws on invalid factors', () => {
    expect(() =>
      designCurrent({ powerKW: 10, voltageV: 400, phase: 3, powerFactor: 0, efficiency: 1, demandFactor: 1 }),
    ).toThrow();
    expect(() =>
      designCurrent({ powerKW: 10, voltageV: 400, phase: 3, powerFactor: 1, efficiency: 0, demandFactor: 1 }),
    ).toThrow();
    expect(() =>
      designCurrent({ powerKW: 10, voltageV: 0, phase: 3, powerFactor: 1, efficiency: 1, demandFactor: 1 }),
    ).toThrow();
  });
});
