import { describe, it, expect } from 'vitest';
import { voltageDrop } from './voltage-drop.js';

describe('voltageDrop', () => {
  it('computes 3-phase drop with pure resistive', () => {
    // IB=100A, V=400, cosφ=1, R=1 Ω/km, X=0, L=100m → ΔU = √3 * 100 * 1 * 0.1 = 17.32 V
    const r = voltageDrop({
      designCurrentA: 100,
      voltageV: 400,
      phase: 3,
      powerFactor: 1,
      rOhmPerKm: 1,
      xOhmPerKm: 0,
      lengthM: 100,
    });
    expect(r.dropV).toBeCloseTo(17.3205, 3);
    expect(r.dropPercent).toBeCloseTo(4.3301, 3);
  });

  it('includes reactance term when X > 0 and PF < 1', () => {
    // PF=0.8 → sinφ=0.6. R·cosφ + X·sinφ = 1*0.8 + 0.1*0.6 = 0.86
    const r = voltageDrop({
      designCurrentA: 100,
      voltageV: 400,
      phase: 3,
      powerFactor: 0.8,
      rOhmPerKm: 1,
      xOhmPerKm: 0.1,
      lengthM: 100,
    });
    // ΔU = √3 * 100 * 0.86 * 0.1 = 14.895
    expect(r.dropV).toBeCloseTo(14.8953, 3);
  });

  it('uses factor 2 for single-phase', () => {
    const r3 = voltageDrop({
      designCurrentA: 100,
      voltageV: 400,
      phase: 3,
      powerFactor: 1,
      rOhmPerKm: 1,
      xOhmPerKm: 0,
      lengthM: 100,
    });
    const r1 = voltageDrop({
      designCurrentA: 100,
      voltageV: 400,
      phase: 1,
      powerFactor: 1,
      rOhmPerKm: 1,
      xOhmPerKm: 0,
      lengthM: 100,
    });
    // ratio 2 / √3 ≈ 1.1547
    expect(r1.dropV / r3.dropV).toBeCloseTo(2 / Math.sqrt(3), 5);
  });

  it('honours X=0 (caller-supplied) for small csa behavior', () => {
    const withX = voltageDrop({
      designCurrentA: 100, voltageV: 400, phase: 3, powerFactor: 0.8, rOhmPerKm: 1, xOhmPerKm: 0.1, lengthM: 100,
    });
    const noX = voltageDrop({
      designCurrentA: 100, voltageV: 400, phase: 3, powerFactor: 0.8, rOhmPerKm: 1, xOhmPerKm: 0, lengthM: 100,
    });
    expect(withX.dropV).toBeGreaterThan(noX.dropV);
  });
});
