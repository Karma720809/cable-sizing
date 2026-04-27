import { describe, it, expect } from 'vitest';
import { loadMvDataset } from './data-mv.js';
import { computeChargingCurrent } from './charging-current.js';

describe('MV charging current Ic', () => {
  const ds = loadMvDataset();

  it('looks up capacitance from dataset @ 60mm² → 0.28 μF/km', () => {
    const r = computeChargingCurrent({
      capacitance: ds.capacitance,
      cableType: 'CNCV-W',
      csaMm2: 60,
      capacitanceOverrideUFPerKm: null,
      lineToGroundV: 13200,
      frequencyHz: 60,
      lengthM: 1000,
      designCurrentA: 200,
      threshold: 0.01,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.capacitanceUFPerKm).toBe(0.28);
      // Ic = 2π·60·0.28e-6·13200 ≈ 1.394 A/km × 1km
      expect(r.ic_A_per_km).toBeCloseTo(2 * Math.PI * 60 * 0.28e-6 * 13200, 6);
      expect(r.ic_A).toBeCloseTo(r.ic_A_per_km, 6);
    }
  });

  it('below threshold → effectiveCurrent equals IB', () => {
    const r = computeChargingCurrent({
      capacitance: ds.capacitance,
      cableType: 'CNCV-W',
      csaMm2: 60,
      capacitanceOverrideUFPerKm: null,
      lineToGroundV: 13200,
      frequencyHz: 60,
      lengthM: 200, // very short
      designCurrentA: 200,
      threshold: 0.01,
    });
    if (r.ok) {
      expect(r.applied).toBe(false);
      expect(r.effectiveCurrentA).toBe(200);
    }
  });

  it('above threshold → I_eff = √(IB² + Ic²) (conservative absolute sum)', () => {
    const r = computeChargingCurrent({
      capacitance: ds.capacitance,
      cableType: 'CNCV-W',
      csaMm2: 600, // largest C
      capacitanceOverrideUFPerKm: null,
      lineToGroundV: 13200,
      frequencyHz: 60,
      lengthM: 5000, // 5 km
      designCurrentA: 100,
      threshold: 0.01,
    });
    if (r.ok) {
      expect(r.applied).toBe(true);
      const expected = Math.sqrt(100 ** 2 + r.ic_A ** 2);
      expect(r.effectiveCurrentA).toBeCloseTo(expected, 6);
    }
  });

  it('user override (W-MV-030 path) supersedes dataset value', () => {
    const r = computeChargingCurrent({
      capacitance: ds.capacitance,
      cableType: 'CNCV-W',
      csaMm2: 60,
      capacitanceOverrideUFPerKm: 0.5,
      lineToGroundV: 13200,
      frequencyHz: 60,
      lengthM: 1000,
      designCurrentA: 200,
      threshold: 0.01,
    });
    if (r.ok) {
      expect(r.overrideUsed).toBe(true);
      expect(r.capacitanceUFPerKm).toBe(0.5);
    }
  });

  it('missing csa row → E-MV-LOOKUP-003', () => {
    const r = computeChargingCurrent({
      capacitance: ds.capacitance,
      cableType: 'CNCV-W',
      csaMm2: 75, // not in table
      capacitanceOverrideUFPerKm: null,
      lineToGroundV: 13200,
      frequencyHz: 60,
      lengthM: 1000,
      designCurrentA: 200,
      threshold: 0.01,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('E-MV-LOOKUP-003');
  });
});
