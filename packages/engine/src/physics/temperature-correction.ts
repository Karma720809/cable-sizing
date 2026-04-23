/**
 * Temperature-corrected resistance — Stage 5C (engine 0.10.0).
 *
 * Two small pure functions invoked from the orchestrator's voltage-drop
 * scan when `projectPolicy.resistanceModel === 'temperature_corrected'`.
 *
 * ─── Correction formula (F-1, IEC 60287-1-1 §2) ────────────────────────
 *
 *   R(θ_op) = R(θ_ref) · [1 + α · (θ_op − α_refC)]
 *                        / [1 + α · (θ_ref − α_refC)]
 *
 * where α is the material's linear temperature coefficient at α_refC
 * (20 °C per IEC 60228), θ_ref is the temperature at which R is
 * tabulated in the impedance bundle (PVC = 70 °C, XLPE = 90 °C), and
 * θ_op is the estimated conductor operating temperature.
 *
 * ─── Operating-temperature estimate (T-1, IEC 60287-1-1 loading ratio) ─
 *
 *   θ_op = θ_amb + (IB / IZ)² · (θ_max − θ_amb)
 *
 * with (IB / IZ) clamped to 1.0 (IB > IZ is already a thermal overload;
 * the ampacity/IZ-recheck machinery rejects that csa independently).
 */

import type {
  AlphaCoefficientsDataset,
  ConductorMaterial,
} from '../types/index.js';

/**
 * Scale a reference-temperature resistance to an operating temperature
 * via the IEC 60287-1-1 linear-α formula.
 */
export function correctR(params: {
  rAtRefOhmPerKm: number;
  thetaRefC: number;
  thetaOpC: number;
  alphaPerK: number;
  alphaReferenceTempC: number;
}): number {
  const { rAtRefOhmPerKm, thetaRefC, thetaOpC, alphaPerK, alphaReferenceTempC } =
    params;
  const numerator = 1 + alphaPerK * (thetaOpC - alphaReferenceTempC);
  const denominator = 1 + alphaPerK * (thetaRefC - alphaReferenceTempC);
  return (rAtRefOhmPerKm * numerator) / denominator;
}

/**
 * Loading-ratio operating-temperature estimate.
 *
 * `capped` is true when IB > IZ (loading ratio clamped to 1.0, θ_op = θ_max).
 */
export function estimateOperatingTempC(params: {
  ambientC: number;
  maxC: number;
  designCurrentA: number;
  cableAmpacityA: number;
}): { thetaOpC: number; capped: boolean } {
  const { ambientC, maxC, designCurrentA, cableAmpacityA } = params;
  // Guard: caller must have rejected ambient ≥ max upstream
  // (E-TEMP-AMBIENT-OVER-MAX). Defensive clamp here keeps us bounded.
  if (!(maxC > ambientC)) {
    return { thetaOpC: maxC, capped: true };
  }
  const rawRatio =
    cableAmpacityA > 0 ? designCurrentA / cableAmpacityA : Infinity;
  const capped = rawRatio > 1;
  const ratio = capped ? 1 : rawRatio;
  const thetaOpC = ambientC + ratio * ratio * (maxC - ambientC);
  return { thetaOpC, capped };
}

/** Look up the α entry for a conductor material. Throws if absent. */
export function lookupAlpha(
  alpha: AlphaCoefficientsDataset,
  material: ConductorMaterial,
): { alphaPerK: number; referenceTempC: number } {
  const hit = alpha.values.find((v) => v.conductorMaterial === material);
  if (!hit) {
    throw new Error(
      `alpha_coefficients dataset missing entry for conductorMaterial="${material}"`,
    );
  }
  return { alphaPerK: hit.alphaPerK, referenceTempC: alpha.referenceTempC };
}
