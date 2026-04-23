/**
 * sizeCable() — top-level orchestrator. PRD v2.3 §6.3 pipeline.
 *
 *   1.  validate input           → E-VAL-* (fatal) abort
 *   2.  apply defaults           → W-DEFAULT-APPLIED
 *   3.  design current IB        → W-IB-OVERRIDE if override path
 *   4.  correction factors k1/k2/k3  → W-LOOKUP-SAFE-SIDE possible
 *   5.  required IZ' = IB / k_total, ampacity lookup → csa_A
 *   6.  voltage drop scan across standard sizes ≥ csa_A → csa_V
 *   7.  short-circuit S_min = Isc·√t / k → csa_SC
 *   8.  recommended = max(csa_A, csa_V, csa_SC) rounded up to standard
 *   9.  IZ recheck (§11.6) on recommended csa — bump size if IZ < IB or
 *       protection cond.1 fails → W-PROTECTION-RECHECK
 *  10.  protection coordination: IB ≤ In ≤ IZ, I2 ≤ 1.45·IZ
 *       (I2 missing → INCOMPLETE, W-I2-MISSING)
 *
 * A fatal error at any numbered step collapses overallStatus to
 * INCOMPLETE and the orchestrator returns the partial SizingResult so
 * the UI can still render the audit trail up to the point of failure.
 */

import type {
  CircuitInput,
  SizingResult,
  EngineError,
  Warning,
  WarningCode,
  AmpacityResult,
  VoltageDropResult,
  ShortCircuitResult,
  ProtectionCoordinationResult,
  OverallStatus,
  ProtectionStatus,
  Dataset,
  SelectionDriver,
  FrequencyHz,
} from '../types/index.js';
import { loadDataset } from '../data/loader.js';
import { ENGINE_VERSION } from '../version.js';
import { API_VERSION } from '../api/manifest.js';
import { designCurrent } from '../physics/current.js';
import { voltageDrop } from '../physics/voltage-drop.js';
import { shortCircuitCSA } from '../physics/short-circuit.js';
import { computeCorrections } from '../standards/iec60364/corrections.js';
import {
  resolveAmpacityRows,
  selectCsaForRequiredIz,
  ampacityAtCsa,
} from '../standards/iec60364/ampacity-lookup.js';
import { lookupImpedance } from '../standards/iec60364/impedance-lookup.js';
import { lookupKValue } from '../standards/iec60364/k-value-lookup.js';
import {
  correctR,
  estimateOperatingTempC,
  lookupAlpha,
} from '../physics/temperature-correction.js';
import { nextStandardAtLeast } from '../utils/lookup.js';
import { validateCircuitInput } from './validation.js';
import { applyDefaults } from './defaults.js';
import { AuditBuilder } from './audit.js';

// ─── public options ─────────────────────────────────────────────────

export interface SizeCableOptions {
  /** Injectable for tests; production path loads the bundled dataset. */
  dataset?: Dataset;
}

// ─── helpers ────────────────────────────────────────────────────────

function emptyAmpacity(): AmpacityResult {
  return {
    correctionFactors: { k1: 1, k2: 1, k3: 1, total: 1 },
    requiredIzA: 0,
    minimumCSAmm2: null,
    selectedCSAmm2: null,
    cableRatingA: null,
    selectedTableRef: null,
    selectedDatasetId: null,
    selectedMethodRef: null,
    loadedConductorsUsed: null,
    lookupPolicyUsed: null,
    status: 'FAIL',
  };
}

function emptyVoltageDrop(max: number): VoltageDropResult {
  return {
    cableR_ohm_per_km: 0,
    cableX_ohm_per_km: 0,
    calculatedDropV: null,
    calculatedDropPercent: null,
    minimumCSAmm2: null,
    maxAllowedPercent: max,
    status: 'FAIL',
    cableR_atOperatingTemp_ohm_per_km: null,
    operatingTempC: null,
  };
}

function emptyShortCircuit(): ShortCircuitResult {
  return { kValue: 0, requiredCSARaw: 0, minimumCSAmm2: null, status: 'FAIL' };
}

function emptyProtection(): ProtectionCoordinationResult {
  return {
    ratedCurrentA: 0,
    operatingCurrentI2A: null,
    cableAmpacityIzA: 0,
    condition1: { formula: 'IB ≤ In ≤ IZ', values: { IB: 0, In: 0, IZ: 0 }, pass: false },
    condition2: { formula: 'I2 ≤ 1.45 × IZ', values: { I2: null, threshold: 0 }, pass: null },
    status: 'INCOMPLETE',
  };
}

function buildSkeleton(
  errors: EngineError[],
  warnings: Warning[],
  auditTrail: ReturnType<AuditBuilder['build']>,
  designCurrentA: number,
  datasetId: string,
  opts?: { maxDropPercent?: number; overall?: OverallStatus },
): SizingResult {
  return {
    designCurrentA,
    ampacity: emptyAmpacity(),
    voltageDrop: emptyVoltageDrop(opts?.maxDropPercent ?? 0),
    shortCircuit: emptyShortCircuit(),
    protectionCoordination: emptyProtection(),
    recommendedCSAmm2: null,
    selectionDriver: 'none',
    overallStatus: opts?.overall ?? 'INCOMPLETE',
    warnings,
    errors,
    datasetId,
    engineVersion: ENGINE_VERSION,
    apiVersion: API_VERSION,
    auditTrail,
  };
}

// ─── orchestrator ───────────────────────────────────────────────────

export function sizeCable(input: CircuitInput, options: SizeCableOptions = {}): SizingResult {
  const dataset = options.dataset ?? loadDataset();
  const audit = new AuditBuilder();
  const warnings: Warning[] = [];
  const errors: EngineError[] = [];

  // ── Step 1: validation ────────────────────────────────────────────
  const vErrors = validateCircuitInput(input);
  audit.add({
    criterion: 'validation',
    inputs: {},
    formula: 'validateCircuitInput(input)',
    intermediateValues: { errorCount: vErrors.length },
    decision: vErrors.length ? 'FAIL' : 'PASS',
    reason: vErrors.length
      ? `${vErrors.length} validation error(s): ${vErrors.map((e) => e.code).join(', ')}`
      : 'all inputs within bounds',
  });
  if (vErrors.length) {
    return buildSkeleton(vErrors, warnings, audit.build(), 0, dataset.meta.datasetId);
  }

  // ── Step 2: defaults ──────────────────────────────────────────────
  const { resolved, warnings: defaultWarnings } = applyDefaults(input);
  warnings.push(...defaultWarnings);
  audit.add({
    criterion: 'defaults',
    inputs: {},
    formula: 'applyDefaults(input)',
    intermediateValues: { defaultsApplied: defaultWarnings.map((w) => w.field) },
    decision: defaultWarnings.length ? 'WARNING' : 'INFO',
    reason: defaultWarnings.length
      ? `${defaultWarnings.length} default(s) applied`
      : 'all fields user-supplied',
    ...(defaultWarnings.length ? { code: 'W-DEFAULT-APPLIED' } : {}),
  });

  // ── Stage 5C: early ambient-over-max guard ───────────────────────
  //
  // When `projectPolicy.resistanceModel === 'temperature_corrected'`, the
  // loading-ratio θ_op estimate is only well-defined when the ambient
  // temperature is strictly below the insulation's rated conductor
  // maximum (PVC = 70 °C, XLPE = 90 °C). We check this here — before the
  // correction-factor step — so the 5C-specific error fires rather than
  // being masked by an ambient k1 lookup failure, which happens at lower
  // temperatures for PVC.
  if (resolved.projectPolicy.resistanceModel === 'temperature_corrected') {
    const thetaMaxGuardC =
      resolved.cable.insulationType === 'PVC' ? 70 : 90;
    const ambGuardC = resolved.installation.ambientTempC;
    if (ambGuardC != null && ambGuardC >= thetaMaxGuardC) {
      const err: EngineError = {
        code: 'E-TEMP-AMBIENT-OVER-MAX',
        message: `ambient temperature ${ambGuardC}°C ≥ rated conductor maximum ${thetaMaxGuardC}°C (${resolved.cable.insulationType}); temperature-corrected resistance is ill-defined (no thermal headroom)`,
        fatal: true,
      };
      errors.push(err);
      audit.add({
        criterion: 'voltageDrop',
        inputs: {
          ambientC: ambGuardC,
          thetaMaxC: thetaMaxGuardC,
          insulation: resolved.cable.insulationType,
        },
        formula: 'θ_op = θ_amb + (IB/IZ)²·(θ_max − θ_amb)',
        intermediateValues: { ambientC: ambGuardC, thetaMaxC: thetaMaxGuardC },
        decision: 'FAIL',
        reason: 'ambient ≥ rated max; refuse to extrapolate R(θ_op)',
        code: 'E-TEMP-AMBIENT-OVER-MAX',
      });
      return buildSkeleton(
        errors,
        warnings,
        audit.build(),
        0,
        dataset.meta.datasetId,
        { maxDropPercent: resolved.projectPolicy.maxVoltageDropPercent },
      );
    }
  }

  // ── Step 3: design current ────────────────────────────────────────
  let ibA: number;
  const override = resolved.load.designCurrentOverrideA;
  if (override != null && override > 0) {
    ibA = override;
    warnings.push({
      code: 'W-IB-OVERRIDE',
      message: `designCurrent overridden to ${override} A (load params ignored)`,
      field: 'load.designCurrentOverrideA',
    });
    audit.add({
      criterion: 'designCurrent',
      inputs: { overrideA: override },
      formula: 'IB = designCurrentOverrideA',
      intermediateValues: { IB: ibA },
      decision: 'WARNING',
      reason: 'override path active (OQ-5); load parameters bypassed',
      code: 'W-IB-OVERRIDE',
    });
  } else {
    // Guaranteed present by validation + defaults
    const { designCurrentA: ib, intermediate } = designCurrent({
      powerKW: resolved.load.powerKW as number,
      voltageV: resolved.system.voltageV,
      phase: resolved.system.phase,
      powerFactor: resolved.load.powerFactor as number,
      efficiency: resolved.load.efficiency as number,
      demandFactor: resolved.load.demandFactor as number,
    });
    ibA = ib;
    audit.add({
      criterion: 'designCurrent',
      inputs: {
        powerKW: resolved.load.powerKW,
        voltageV: resolved.system.voltageV,
        phase: resolved.system.phase,
        powerFactor: resolved.load.powerFactor,
        efficiency: resolved.load.efficiency,
        demandFactor: resolved.load.demandFactor,
      },
      formula:
        resolved.system.phase === 3
          ? 'IB = (P·1000) / (√3·V·cosφ·η) · df'
          : 'IB = (P·1000) / (V·cosφ·η) · df',
      intermediateValues: { ...intermediate, IB: ib },
      decision: 'INFO',
      reason: 'computed from load parameters',
    });
  }

  // ── Step 4: correction factors ────────────────────────────────────
  const corr = computeCorrections(dataset, {
    method: resolved.installation.methodCode,
    insulation: resolved.cable.insulationType,
    ambientTempC: resolved.installation.ambientTempC as number,
    soilResistivityK_m_W: resolved.installation.soilResistivityK_m_W ?? null,
    groupCount: resolved.installation.groupCount as number,
  });
  if (!corr.ok) {
    const err: EngineError = {
      code: corr.error.code,
      message: corr.error.message,
      field: corr.error.field,
      fatal: true,
    };
    errors.push(err);
    audit.add({
      criterion: 'corrections',
      inputs: {},
      formula: 'k_total = k1·k2·k3',
      intermediateValues: {},
      decision: 'FAIL',
      reason: corr.error.message,
      code: corr.error.code,
    });
    return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId);
  }
  const { combined } = corr;
  if (combined.warningCode) {
    warnings.push({
      code: combined.warningCode,
      message: 'at least one correction factor resolved via safe-side (non-exact) neighbor',
    });
  }
  audit.add({
    criterion: 'corrections',
    inputs: {
      method: resolved.installation.methodCode,
      insulation: resolved.cable.insulationType,
      ambientTempC: resolved.installation.ambientTempC,
      soilResistivityK_m_W: resolved.installation.soilResistivityK_m_W,
      groupCount: resolved.installation.groupCount,
    },
    formula: 'k_total = k1·k2·k3',
    intermediateValues: {
      k1: combined.k1,
      k2: combined.k2,
      k3: combined.k3,
      total: combined.total,
      k1MatchType: combined.details.k1.matchType,
      k2MatchType: combined.details.k2.matchType,
      k3MatchType: combined.details.k3.matchType,
    },
    decision: combined.warningCode ? 'WARNING' : 'INFO',
    reason: combined.warningCode
      ? 'at least one factor resolved via safe-side neighbor'
      : 'all factors exact-match',
    ...(combined.warningCode ? { code: combined.warningCode } : {}),
  });

  // ── Step 5: required IZ' + ampacity lookup ────────────────────────
  const requiredIz = ibA / combined.total;
  const loadedConductorsUsed: 2 | 3 = resolved.system.phase === 1 ? 2 : 3;
  const rowsRes = resolveAmpacityRows(dataset, {
    conductorMaterial: resolved.cable.conductorMaterial,
    insulationType: resolved.cable.insulationType,
    // Single-phase circuits load 2 conductors (L+N); 3-phase load 3.
    loadedConductors: loadedConductorsUsed,
    cableType: resolved.cable.cableType,
    frequencyHz: resolved.system.frequencyHz,
    method: resolved.installation.methodCode,
  });
  if (!rowsRes.ok) {
    errors.push({ code: rowsRes.error.code, message: rowsRes.error.message, fatal: true });
    audit.add({
      criterion: 'ampacity',
      inputs: {},
      formula: 'IZ′ = IB / k_total',
      intermediateValues: { IB: ibA, kTotal: combined.total, requiredIz },
      decision: 'FAIL',
      reason: rowsRes.error.message,
      code: rowsRes.error.code,
    });
    return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId);
  }
  const hit = selectCsaForRequiredIz(rowsRes.rows, requiredIz);
  if (!hit) {
    errors.push({
      code: 'E-CSA-001',
      message: `no standard csa provides ampacity ≥ ${requiredIz.toFixed(2)} A (max tabulated is ${rowsRes.rows[rowsRes.rows.length - 1]?.ampacityA} A)`,
      fatal: true,
    });
    audit.add({
      criterion: 'ampacity',
      inputs: { requiredIz },
      formula: 'first csa with ampacity ≥ IZ′',
      intermediateValues: { requiredIz },
      decision: 'FAIL',
      reason: 'required IZ exceeds largest tabulated ampacity',
      code: 'E-CSA-001',
    });
    return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId);
  }
  const ampacityResult: AmpacityResult = {
    correctionFactors: { k1: combined.k1, k2: combined.k2, k3: combined.k3, total: combined.total },
    requiredIzA: requiredIz,
    minimumCSAmm2: hit.csaMm2,
    selectedCSAmm2: hit.csaMm2,
    cableRatingA: hit.ampacityA,
    selectedTableRef: rowsRes.tableRef,
    selectedDatasetId: rowsRes.datasetId,
    selectedMethodRef: rowsRes.methodRef,
    loadedConductorsUsed,
    lookupPolicyUsed: combined.warningCode === 'W-LOOKUP-SAFE-SIDE' ? 'safe-side' : 'exact',
    status: 'PASS',
  };
  audit.add({
    criterion: 'ampacity',
    inputs: { requiredIz },
    formula: 'first csa with ampacity ≥ IZ′ = IB / k_total',
    intermediateValues: { csaMm2: hit.csaMm2, cableRatingA: hit.ampacityA },
    decision: 'PASS',
    reason: `csa ${hit.csaMm2} mm² ampacity ${hit.ampacityA} A (≥ required ${requiredIz.toFixed(2)} A)`,
  });

  // ── Step 6: voltage drop scan ─────────────────────────────────────
  // Iterate standard sizes from csa_A upward. Pick the smallest that
  // satisfies ΔU% ≤ max. Reactance is ignored per projectPolicy.
  const sizes = dataset.standardSizes.sizesMm2;
  const maxDrop = resolved.projectPolicy.maxVoltageDropPercent;
  let csaV: number | null = null;
  let vResult: VoltageDropResult = emptyVoltageDrop(maxDrop);
  let reactanceIgnoredWarnEmitted = false;

  // PF for voltage drop: if override path, use whatever pf is — fall back to 1.0 if null
  const pfForVd = resolved.load.powerFactor ?? 1.0;

  // ── Stage 5B-IMP-INFRA: 60 Hz impedance frequency resolution ──────
  //
  // Originally (engine 0.8.0) all impedance bundles were 50 Hz-only and any
  // 60 Hz request fell back along two axes (R reused, X forced to zero).
  // Stage 5B-IMP (engine 0.9.0) shipped native 60 Hz multicore Cu/Al bundles,
  // so the fallback now fires only for combinations the data still doesn't
  // cover — currently that means 60 Hz single-core (no single-core impedance
  // bundle exists at either frequency).
  //
  // The check is scoped by (conductorMaterial, cableType), matching the
  // lookup key of `lookupImpedance`. Falling back is still the right default:
  //   R (resistance):  reuse 50 Hz values directly — R is effectively
  //                    frequency-independent for LV CSA ≤ 300 mm² (skin and
  //                    proximity effects are < 1 %). Flagged with
  //                    W-RESISTANCE-50HZ-USED-AT-60HZ.
  //   X (reactance):   do NOT reuse 50 Hz values (X = 2πfL scales with
  //                    frequency). Internally force useReactance = false
  //                    (X = 0) and flag with W-REACTANCE-60HZ-DEFERRED.
  //
  // When a native 60 Hz bundle exists for the requested combo (e.g. Cu or
  // Al multicore after 5B-IMP), `lookupFreq` is the requested frequency,
  // neither warning is pushed, and `useReactance` behaves as the caller
  // requested.
  const requestedFreq = resolved.system.frequencyHz;
  const hasNative60ForCombo =
    requestedFreq !== 60
      ? true
      : dataset.impedance.datasets.some(
          (d) =>
            d.frequencyHz === 60 &&
            d.conductorMaterial === resolved.cable.conductorMaterial &&
            d.cableType === resolved.cable.cableType,
        );
  const freqFallbackActive = requestedFreq === 60 && !hasNative60ForCombo;
  const lookupFreq: FrequencyHz = freqFallbackActive ? 50 : requestedFreq;

  // `useReactanceEffective` is the reactance policy that will actually drive
  // the voltage-drop computation, after applying the A-1 (reactance deferred)
  // rule on top of the caller's projectPolicy.useReactance request.
  const useReactanceEffective =
    resolved.projectPolicy.useReactance && !freqFallbackActive;

  if (freqFallbackActive) {
    warnings.push({
      code: 'W-RESISTANCE-50HZ-USED-AT-60HZ',
      message: `no 60 Hz impedance dataset bundled for ${resolved.cable.conductorMaterial}/${resolved.cable.cableType}; resistance values looked up from the 50 Hz bundle (R is frequency-independent for LV CSA ≤ 300 mm²)`,
    });
    if (resolved.projectPolicy.useReactance) {
      warnings.push({
        code: 'W-REACTANCE-60HZ-DEFERRED',
        message: `no 60 Hz reactance dataset bundled for ${resolved.cable.conductorMaterial}/${resolved.cable.cableType}; X = 0 used for voltage drop (useReactance internally deferred)`,
      });
    }
  }

  // ── Stage 5C: temperature-corrected resistance preamble ──────────
  //
  // When `projectPolicy.resistanceModel === 'temperature_corrected'`, the
  // voltage-drop scan scales R from its tabulated reference temperature
  // (PVC = 70 °C, XLPE = 90 °C) to an estimated operating temperature via
  // the IEC 60287-1-1 linear-α formula. The estimate uses a loading-ratio
  // approximation: θ_op = θ_amb + (IB / IZ)² · (θ_max − θ_amb), with
  // IB / IZ clamped to 1.0. α values come from the physics bundle
  // (IEC 60228: Cu = 3.93e-3/K, Al = 4.03e-3/K).
  //
  // If `resistanceModel === 'fixed_reference'` (default), this block is
  // inert and the scan proceeds exactly as before 0.10.0.
  const tempCorrectionRequested =
    resolved.projectPolicy.resistanceModel === 'temperature_corrected';
  // θ_max (conductor rated operating temperature) per insulation.
  // Guaranteed ambient < θ_max here: the early 5C guard right after
  // defaults aborts with E-TEMP-AMBIENT-OVER-MAX otherwise.
  const thetaMaxC = resolved.cable.insulationType === 'PVC' ? 70 : 90;
  const ambientC = resolved.installation.ambientTempC as number;

  const alpha = tempCorrectionRequested
    ? lookupAlpha(dataset.physics.alphaCoefficients, resolved.cable.conductorMaterial)
    : null;
  let tempCorrectionAppliedAny = false;
  let tempCorrectionCappedAny = false;

  for (const csa of sizes) {
    if (csa < hit.csaMm2) continue;
    const imp = lookupImpedance(dataset, {
      conductorMaterial: resolved.cable.conductorMaterial,
      cableType: resolved.cable.cableType,
      frequencyHz: lookupFreq,
      insulationType: resolved.cable.insulationType,
      csaMm2: csa,
    });
    if (!imp.ok) continue;

    // Reactance policy
    let xUsed = imp.hit.xOhmPerKm;
    if (!useReactanceEffective) {
      xUsed = 0;
    } else if (
      resolved.projectPolicy.ignoreReactanceBelowMm2 != null &&
      csa < resolved.projectPolicy.ignoreReactanceBelowMm2
    ) {
      xUsed = 0;
      if (!reactanceIgnoredWarnEmitted) {
        warnings.push({
          code: 'W-REACTANCE-IGNORED',
          message: `reactance ignored for csa < ${resolved.projectPolicy.ignoreReactanceBelowMm2} mm²`,
        });
        reactanceIgnoredWarnEmitted = true;
      }
    }

    // Stage 5C: temperature-corrected R, if requested.
    let rUsed = imp.hit.rOhmPerKm;
    let rCorrectedForResult: number | null = null;
    let thetaOpForResult: number | null = null;
    if (tempCorrectionRequested && alpha) {
      const ampAtCsa = ampacityAtCsa(rowsRes.rows, csa) ?? 0;
      const izAtCsa = ampAtCsa * combined.total;
      const { thetaOpC, capped } = estimateOperatingTempC({
        ambientC,
        maxC: thetaMaxC,
        designCurrentA: ibA,
        cableAmpacityA: izAtCsa,
      });
      rUsed = correctR({
        rAtRefOhmPerKm: imp.hit.rOhmPerKm,
        thetaRefC: imp.hit.rTemperatureBasisC,
        thetaOpC,
        alphaPerK: alpha.alphaPerK,
        alphaReferenceTempC: alpha.referenceTempC,
      });
      rCorrectedForResult = rUsed;
      thetaOpForResult = thetaOpC;
      tempCorrectionAppliedAny = true;
      if (capped) tempCorrectionCappedAny = true;
    }

    const vd = voltageDrop({
      designCurrentA: ibA,
      voltageV: resolved.system.voltageV,
      phase: resolved.system.phase,
      powerFactor: pfForVd,
      rOhmPerKm: rUsed,
      xOhmPerKm: xUsed,
      lengthM: resolved.route.lengthM,
    });

    if (vd.dropPercent <= maxDrop) {
      csaV = csa;
      vResult = {
        cableR_ohm_per_km: imp.hit.rOhmPerKm,
        cableX_ohm_per_km: xUsed,
        calculatedDropV: vd.dropV,
        calculatedDropPercent: vd.dropPercent,
        minimumCSAmm2: csa,
        maxAllowedPercent: maxDrop,
        status: 'PASS',
        cableR_atOperatingTemp_ohm_per_km: rCorrectedForResult,
        operatingTempC: thetaOpForResult,
      };
      break;
    }
  }

  if (tempCorrectionAppliedAny) {
    warnings.push({
      code: 'W-TEMP-CORRECTION-APPLIED',
      message: `resistance temperature-corrected per IEC 60287-1-1 (α = ${alpha?.alphaPerK}/K @ ${alpha?.referenceTempC}°C, θ_max = ${thetaMaxC}°C, θ_amb = ${ambientC}°C)`,
    });
  }
  if (tempCorrectionCappedAny) {
    warnings.push({
      code: 'W-TEMP-CORRECTION-CAPPED',
      message: 'one or more scanned csa had IB > IZ; loading ratio clamped to 1.0 for θ_op estimate (overloaded csa rejected by IZ recheck)',
    });
  }
  if (csaV == null) {
    // Vdrop unsatisfiable even at largest size
    const last = sizes[sizes.length - 1] ?? 0;
    const imp = lookupImpedance(dataset, {
      conductorMaterial: resolved.cable.conductorMaterial,
      cableType: resolved.cable.cableType,
      frequencyHz: lookupFreq,
      insulationType: resolved.cable.insulationType,
      csaMm2: last,
    });
    if (imp.ok) {
      // Stage 5C: apply temperature correction on the failing-report path too.
      let rReport = imp.hit.rOhmPerKm;
      let rReportCorrected: number | null = null;
      let thetaOpReport: number | null = null;
      if (tempCorrectionRequested && alpha) {
        const ampAtLast = ampacityAtCsa(rowsRes.rows, last) ?? 0;
        const izAtLast = ampAtLast * combined.total;
        const { thetaOpC } = estimateOperatingTempC({
          ambientC,
          maxC: thetaMaxC,
          designCurrentA: ibA,
          cableAmpacityA: izAtLast,
        });
        rReport = correctR({
          rAtRefOhmPerKm: imp.hit.rOhmPerKm,
          thetaRefC: imp.hit.rTemperatureBasisC,
          thetaOpC,
          alphaPerK: alpha.alphaPerK,
          alphaReferenceTempC: alpha.referenceTempC,
        });
        rReportCorrected = rReport;
        thetaOpReport = thetaOpC;
      }
      const vd = voltageDrop({
        designCurrentA: ibA,
        voltageV: resolved.system.voltageV,
        phase: resolved.system.phase,
        powerFactor: pfForVd,
        rOhmPerKm: rReport,
        xOhmPerKm: useReactanceEffective ? imp.hit.xOhmPerKm : 0,
        lengthM: resolved.route.lengthM,
      });
      vResult = {
        cableR_ohm_per_km: imp.hit.rOhmPerKm,
        cableX_ohm_per_km: useReactanceEffective ? imp.hit.xOhmPerKm : 0,
        calculatedDropV: vd.dropV,
        calculatedDropPercent: vd.dropPercent,
        minimumCSAmm2: null,
        maxAllowedPercent: maxDrop,
        status: 'FAIL',
        cableR_atOperatingTemp_ohm_per_km: rReportCorrected,
        operatingTempC: thetaOpReport,
      };
    }
    errors.push({
      code: 'E-CSA-001',
      message: `no standard csa satisfies voltage-drop limit ${maxDrop}%`,
      fatal: true,
    });
    audit.add({
      criterion: 'voltageDrop',
      inputs: { maxDropPercent: maxDrop },
      formula: '(√3 or 2)·IB·(R·cosφ + X·sinφ)·L_km / V · 100',
      intermediateValues: { lastTriedCsa: last },
      decision: 'FAIL',
      reason: 'voltage drop cannot be satisfied within standard size range',
      code: 'E-CSA-001',
    });
    return buildSkeleton(
      errors,
      warnings,
      audit.build(),
      ibA,
      dataset.meta.datasetId,
      { maxDropPercent: maxDrop },
    );
  }
  audit.add({
    criterion: 'voltageDrop',
    inputs: { lengthM: resolved.route.lengthM, maxDropPercent: maxDrop, useReactance: resolved.projectPolicy.useReactance },
    formula: resolved.system.phase === 3 ? '√3·IB·(R·cosφ + X·sinφ)·L_km' : '2·IB·(R·cosφ + X·sinφ)·L_km',
    intermediateValues: {
      csaMm2: csaV,
      rOhmPerKm: vResult.cableR_ohm_per_km,
      xOhmPerKm: vResult.cableX_ohm_per_km,
      dropV: vResult.calculatedDropV,
      dropPercent: vResult.calculatedDropPercent,
    },
    decision: 'PASS',
    reason: `csa ${csaV} mm² gives ΔU% = ${(vResult.calculatedDropPercent ?? 0).toFixed(3)}% ≤ ${maxDrop}%`,
  });

  // ── Step 7: short-circuit ─────────────────────────────────────────
  let scResult: ShortCircuitResult = emptyShortCircuit();
  let csaSC: number | null = null;
  const scA = (resolved.protection.shortCircuitKA ?? 0) * 1000;
  const tA = resolved.protection.tripTimeS ?? 0;
  if (scA > 0 && tA > 0) {
    const kv = lookupKValue(dataset, resolved.cable.conductorMaterial, resolved.cable.insulationType);
    if (!kv.ok) {
      errors.push({ code: kv.error.code, message: kv.error.message, fatal: true });
      audit.add({
        criterion: 'shortCircuit',
        inputs: {},
        formula: 'S_min = Isc·√t / k',
        intermediateValues: {},
        decision: 'FAIL',
        reason: kv.error.message,
        code: kv.error.code,
      });
      return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId);
    }
    const sc = shortCircuitCSA({ shortCircuitA: scA, tripTimeS: tA, kValue: kv.hit.kValue });
    const csaRounded = nextStandardAtLeast(sizes, sc.requiredCSARaw);
    if (csaRounded == null) {
      errors.push({
        code: 'E-CSA-001',
        message: `required short-circuit csa ${sc.requiredCSARaw.toFixed(2)} mm² exceeds max standard size`,
        fatal: true,
      });
      audit.add({
        criterion: 'shortCircuit',
        inputs: { Isc: scA, tripTimeS: tA, kValue: kv.hit.kValue },
        formula: 'S_min = Isc·√t / k',
        intermediateValues: { requiredCSARaw: sc.requiredCSARaw },
        decision: 'FAIL',
        reason: 'required csa exceeds largest standard size',
        code: 'E-CSA-001',
      });
      return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId, { maxDropPercent: maxDrop });
    }
    csaSC = csaRounded;
    scResult = {
      kValue: kv.hit.kValue,
      requiredCSARaw: sc.requiredCSARaw,
      minimumCSAmm2: csaRounded,
      status: 'PASS',
    };
    audit.add({
      criterion: 'shortCircuit',
      inputs: { shortCircuitKA: resolved.protection.shortCircuitKA, tripTimeS: tA, kValue: kv.hit.kValue },
      formula: 'S_min = Isc·√t / k',
      intermediateValues: { requiredCSARaw: sc.requiredCSARaw, csaRounded },
      decision: 'PASS',
      reason: `S_min = ${sc.requiredCSARaw.toFixed(2)} mm² → next standard ${csaRounded} mm²`,
    });
  } else {
    // Short-circuit data missing — skip SC governance
    audit.add({
      criterion: 'shortCircuit',
      inputs: { shortCircuitKA: resolved.protection.shortCircuitKA, tripTimeS: tA },
      formula: 'S_min = Isc·√t / k',
      intermediateValues: {},
      decision: 'INFO',
      reason: 'short-circuit data not provided; SC criterion skipped',
    });
  }

  // ── Step 8: recommendation ────────────────────────────────────────
  const candidates: number[] = [hit.csaMm2, csaV, ...(csaSC != null ? [csaSC] : [])];
  const maxCandidate = Math.max(...candidates);
  let recommended = nextStandardAtLeast(sizes, maxCandidate);
  const preRecheckRecommended = recommended;
  if (recommended == null) {
    errors.push({ code: 'E-CSA-001', message: 'recommended csa exceeds standard size range', fatal: true });
    return buildSkeleton(errors, warnings, audit.build(), ibA, dataset.meta.datasetId, { maxDropPercent: maxDrop });
  }
  audit.add({
    criterion: 'recommended',
    inputs: { csaA: hit.csaMm2, csaV, csaSC },
    formula: 'rec = next_standard(max(csa_A, csa_V, csa_SC))',
    intermediateValues: { recommended },
    decision: 'INFO',
    reason: `max of ampacity/vdrop/SC requirements = ${maxCandidate} mm² → ${recommended} mm²`,
  });

  // ── Step 9: IZ recheck (§11.6) ────────────────────────────────────
  // Recompute IZ at the recommended csa × k_total and ensure it still
  // clears IB and the protection condition (IB ≤ In ≤ IZ). If not,
  // bump to the next standard size and retry.
  let izRecheckWarnEmitted = false;
  const In = resolved.protection.ratedCurrentA ?? 0;
  while (recommended != null) {
    const ampAtRec = ampacityAtCsa(rowsRes.rows, recommended);
    if (ampAtRec == null) break;
    const izRec = ampAtRec * combined.total;
    const cond1Pass = ibA <= In && In <= izRec;
    // If protection data absent (In == 0), we only enforce IZ ≥ IB.
    const needBump = izRec < ibA || (In > 0 && !cond1Pass);
    if (!needBump) {
      audit.add({
        criterion: 'recommended',
        inputs: { recommended, In },
        formula: 'IZ_rec = cableRating(rec) · k_total ; require IZ_rec ≥ IB and In ≤ IZ_rec',
        intermediateValues: { IZ_rec: izRec, IB: ibA, In },
        decision: 'PASS',
        reason: `IZ_rec = ${izRec.toFixed(2)} A clears IB=${ibA.toFixed(2)} A and In=${In} A`,
      });
      break;
    }
    // Bump
    const next = nextStandardAtLeast(sizes, recommended + 0.0001);
    if (!izRecheckWarnEmitted) {
      warnings.push({
        code: 'W-PROTECTION-RECHECK',
        message: `IZ at csa ${recommended} mm² does not satisfy protection; bumped to next standard size`,
      });
      izRecheckWarnEmitted = true;
    }
    audit.add({
      criterion: 'recommended',
      inputs: { recommended, In },
      formula: 'IZ recheck',
      intermediateValues: { IZ_rec: izRec, IB: ibA, In, bumpedTo: next },
      decision: 'WARNING',
      reason: `IZ_rec=${izRec.toFixed(2)} A insufficient; bumping from ${recommended} mm²`,
      code: 'W-PROTECTION-RECHECK',
    });
    if (next == null) {
      errors.push({
        code: 'E-CSA-001',
        message: 'IZ recheck could not be satisfied within standard size range',
        fatal: true,
      });
      recommended = undefined;
      break;
    }
    recommended = next;
  }

  // ── Step 10: protection coordination ──────────────────────────────
  let protection: ProtectionCoordinationResult = emptyProtection();
  let protectionStatus: ProtectionStatus = 'INCOMPLETE';
  if (recommended !== undefined) {
    const ampAtRec = ampacityAtCsa(rowsRes.rows, recommended) ?? 0;
    const izA = ampAtRec * combined.total;
    const I2 = resolved.protection.operatingCurrentI2A ?? null;
    const threshold = 1.45 * izA;
    const cond1Pass = In > 0 && ibA <= In && In <= izA;
    const cond2Pass = I2 == null ? null : I2 <= threshold;

    if (I2 == null) {
      warnings.push({
        code: 'W-I2-MISSING',
        message: 'operatingCurrentI2A not provided; protection condition 2 is INCOMPLETE',
      });
    }

    protectionStatus = In <= 0 || I2 == null ? 'INCOMPLETE' : cond1Pass && cond2Pass ? 'PASS' : 'FAIL';

    protection = {
      ratedCurrentA: In,
      operatingCurrentI2A: I2,
      cableAmpacityIzA: izA,
      condition1: { formula: 'IB ≤ In ≤ IZ', values: { IB: ibA, In, IZ: izA }, pass: cond1Pass },
      condition2: { formula: 'I2 ≤ 1.45 × IZ', values: { I2, threshold }, pass: cond2Pass },
      status: protectionStatus,
    };
    audit.add({
      criterion: 'protection',
      inputs: { In, I2 },
      formula: 'IB ≤ In ≤ IZ ; I2 ≤ 1.45·IZ',
      intermediateValues: { IB: ibA, IZ: izA, threshold },
      decision: protectionStatus === 'PASS' ? 'PASS' : protectionStatus === 'FAIL' ? 'FAIL' : 'INCOMPLETE',
      reason:
        protectionStatus === 'PASS'
          ? 'both conditions satisfied'
          : protectionStatus === 'FAIL'
            ? `cond1=${cond1Pass} cond2=${cond2Pass}`
            : 'insufficient protection data',
      ...(I2 == null ? { code: 'W-I2-MISSING' } : {}),
    });
  }

  // ── Overall status ────────────────────────────────────────────────
  let overall: OverallStatus;
  const anyFail =
    errors.some((e) => e.fatal) ||
    ampacityResult.status === 'FAIL' ||
    vResult.status === 'FAIL' ||
    (scResult.status === 'FAIL' && scA > 0) ||
    protectionStatus === 'FAIL';
  if (anyFail) {
    overall = 'FAIL';
  } else if (protectionStatus === 'INCOMPLETE') {
    overall = 'INCOMPLETE';
  } else if (warnings.length > 0) {
    overall = 'WARNING';
  } else {
    overall = 'PASS';
  }
  audit.add({
    criterion: 'overall',
    inputs: {},
    formula: 'overallStatus',
    intermediateValues: { warnings: warnings.length, errors: errors.length },
    decision: overall,
    reason: `aggregate of ampacity/vdrop/SC/protection results (${warnings.length} warnings, ${errors.length} errors)`,
  });

  // ── Selection driver (Phase 4A.3) ─────────────────────────────────
  // Which criterion set the recommended csa?
  //   - if IZ-recheck bumped above the pre-recheck selection → 'protection_recheck'
  //   - otherwise, the criterion(s) matching maxCandidate drive selection.
  //     A tie between two or more criteria yields 'mixed'.
  let selectionDriver: SelectionDriver = 'none';
  if (recommended !== undefined) {
    if (preRecheckRecommended !== undefined && recommended > preRecheckRecommended) {
      selectionDriver = 'protection_recheck';
    } else {
      const EPS = 1e-9;
      const drivers: SelectionDriver[] = [];
      if (Math.abs(hit.csaMm2 - maxCandidate) < EPS) drivers.push('ampacity');
      if (csaV !== null && Math.abs(csaV - maxCandidate) < EPS) drivers.push('voltage_drop');
      if (csaSC !== null && Math.abs(csaSC - maxCandidate) < EPS) drivers.push('short_circuit');
      selectionDriver = drivers.length === 0 ? 'ampacity' : drivers.length === 1 ? drivers[0]! : 'mixed';
    }
  }

  return {
    designCurrentA: ibA,
    ampacity: ampacityResult,
    voltageDrop: vResult,
    shortCircuit: scResult,
    protectionCoordination: protection,
    recommendedCSAmm2: recommended ?? null,
    selectionDriver,
    overallStatus: overall,
    warnings,
    errors,
    datasetId: dataset.meta.datasetId,
    engineVersion: ENGINE_VERSION,
    apiVersion: API_VERSION,
    auditTrail: audit.build(),
  };
}

// Re-exports to keep the orchestrator folder self-contained for callers.
export { validateCircuitInput } from './validation.js';
export { applyDefaults } from './defaults.js';
export { AuditBuilder } from './audit.js';
