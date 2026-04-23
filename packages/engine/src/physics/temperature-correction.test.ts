/**
 * Stage 5C — temperature-correction unit tests.
 */

import { describe, it, expect } from 'vitest';
import {
  correctR,
  estimateOperatingTempC,
  lookupAlpha,
} from './temperature-correction.js';
import type { AlphaCoefficientsDataset } from '../types/index.js';

const ALPHA_CU = 0.00393;
const ALPHA_AL = 0.00403;

const alphaDataset: AlphaCoefficientsDataset = {
  id: 'alpha_test',
  sourceRef: 'test',
  referenceTempC: 20,
  unit: 'per_K',
  values: [
    { conductorMaterial: 'Cu', alphaPerK: ALPHA_CU },
    { conductorMaterial: 'Al', alphaPerK: ALPHA_AL },
  ],
};

describe('correctR (IEC 60287-1-1 linear-α)', () => {
  it('identity: θ_op = θ_ref ⇒ R_corrected = R_ref exactly', () => {
    const r = correctR({
      rAtRefOhmPerKm: 1.23,
      thetaRefC: 70,
      thetaOpC: 70,
      alphaPerK: ALPHA_CU,
      alphaReferenceTempC: 20,
    });
    expect(r).toBeCloseTo(1.23, 12);
  });

  it('θ_op < θ_ref ⇒ R_corrected < R_ref', () => {
    const r = correctR({
      rAtRefOhmPerKm: 1.23,
      thetaRefC: 70,
      thetaOpC: 40,
      alphaPerK: ALPHA_CU,
      alphaReferenceTempC: 20,
    });
    expect(r).toBeLessThan(1.23);
  });

  it('θ_op > θ_ref ⇒ R_corrected > R_ref', () => {
    const r = correctR({
      rAtRefOhmPerKm: 1.23,
      thetaRefC: 70,
      thetaOpC: 90,
      alphaPerK: ALPHA_CU,
      alphaReferenceTempC: 20,
    });
    expect(r).toBeGreaterThan(1.23);
  });

  it('numerical check against hand-computed IEC example (Cu, 70 → 40)', () => {
    // R(40) = R(70) · (1 + 0.00393·20) / (1 + 0.00393·50)
    //        = 1.0 · 1.0786 / 1.1965 = 0.9014557…
    const r = correctR({
      rAtRefOhmPerKm: 1.0,
      thetaRefC: 70,
      thetaOpC: 40,
      alphaPerK: ALPHA_CU,
      alphaReferenceTempC: 20,
    });
    const expected = (1 + ALPHA_CU * 20) / (1 + ALPHA_CU * 50);
    expect(r).toBeCloseTo(expected, 10);
  });

  it('Al correction is more temperature-sensitive than Cu', () => {
    // At identical θ_ref and θ_op < θ_ref, Al's higher α means a larger
    // downward scaling fraction.
    const dT = { thetaRefC: 90, thetaOpC: 30, alphaReferenceTempC: 20 };
    const rCu = correctR({ rAtRefOhmPerKm: 1, ...dT, alphaPerK: ALPHA_CU });
    const rAl = correctR({ rAtRefOhmPerKm: 1, ...dT, alphaPerK: ALPHA_AL });
    expect(rAl).toBeLessThan(rCu);
  });
});

describe('estimateOperatingTempC (loading-ratio T-1)', () => {
  it('zero load ⇒ θ_op = θ_ambient', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 30,
      maxC: 70,
      designCurrentA: 0,
      cableAmpacityA: 100,
    });
    expect(thetaOpC).toBe(30);
    expect(capped).toBe(false);
  });

  it('IB = IZ ⇒ θ_op = θ_max (and capped=false since IB == IZ is not over)', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 30,
      maxC: 70,
      designCurrentA: 100,
      cableAmpacityA: 100,
    });
    expect(thetaOpC).toBe(70);
    expect(capped).toBe(false);
  });

  it('IB > IZ ⇒ clamped to θ_max and capped=true', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 30,
      maxC: 70,
      designCurrentA: 200,
      cableAmpacityA: 100,
    });
    expect(thetaOpC).toBe(70);
    expect(capped).toBe(true);
  });

  it('half-load ⇒ θ_op = ambient + 0.25·(max − ambient)', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 30,
      maxC: 90,
      designCurrentA: 50,
      cableAmpacityA: 100,
    });
    expect(thetaOpC).toBeCloseTo(30 + 0.25 * 60, 10);
    expect(capped).toBe(false);
  });

  it('defensive: ambient ≥ max ⇒ returns max, capped=true', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 70,
      maxC: 70,
      designCurrentA: 10,
      cableAmpacityA: 100,
    });
    expect(thetaOpC).toBe(70);
    expect(capped).toBe(true);
  });

  it('defensive: cableAmpacityA = 0 ⇒ treated as over-load, capped', () => {
    const { thetaOpC, capped } = estimateOperatingTempC({
      ambientC: 30,
      maxC: 70,
      designCurrentA: 10,
      cableAmpacityA: 0,
    });
    expect(thetaOpC).toBe(70);
    expect(capped).toBe(true);
  });
});

describe('lookupAlpha', () => {
  it('returns the Cu entry', () => {
    const { alphaPerK, referenceTempC } = lookupAlpha(alphaDataset, 'Cu');
    expect(alphaPerK).toBe(ALPHA_CU);
    expect(referenceTempC).toBe(20);
  });

  it('returns the Al entry', () => {
    const { alphaPerK } = lookupAlpha(alphaDataset, 'Al');
    expect(alphaPerK).toBe(ALPHA_AL);
  });

  it('throws if material missing', () => {
    const broken: AlphaCoefficientsDataset = {
      ...alphaDataset,
      values: [{ conductorMaterial: 'Cu', alphaPerK: ALPHA_CU }],
    };
    expect(() => lookupAlpha(broken, 'Al')).toThrow(/missing entry/);
  });
});
