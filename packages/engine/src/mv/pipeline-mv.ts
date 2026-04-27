/**
 * sizeCableMv() — top-level orchestrator for the Korean 22.9kV MV system.
 *
 * Pipeline (Calc Spec v0.2 §19):
 *   1.  validate input          → E-MV-VAL-* fatal abort
 *   2.  apply defaults          → W-MV-DEFAULT-APPLIED
 *   3.  design current IB       → W-MV-IB-OVERRIDE if override
 *   4.  correction factors      → W-MV-LOOKUP-SAFE-SIDE possible
 *   5.  required IZ' = IB / k_total, ampacity table → csa_A
 *   6.  voltage-drop scan (csa ≥ csa_A) with charging current re-evaluation
 *       at each candidate → csa_V
 *   7.  short-circuit S_min = Isc·√t / 143 → csa_SC
 *   8.  recommended = max(csa_A, csa_V, csa_SC) rounded to standard ladder
 *   9.  screen verification using earth fault inputs (autofill or override)
 *  10.  protection coordination (In ≥ IB, breaking ≥ Isc) + disclaimer
 *
 * Errors at any step set overallStatus = INCOMPLETE and the partial
 * SizingResult is still returned so the UI can render the audit trail.
 */

import { ENGINE_VERSION } from '../version.js';
import { API_VERSION } from '../api/manifest.js';
import { AuditBuilder } from '../orchestrator/audit.js';
import { nextStandardAtLeast } from '../utils/lookup.js';
import { shortCircuitCSA } from '../physics/short-circuit.js';
import { loadMvDataset } from './data-mv.js';
import { computeMvCorrections } from './corrections-mv.js';
import {
  ampacityAtMvCsa,
  resolveMvAmpacity,
  selectMvCsaForRequiredIz,
} from './ampacity-mv.js';
import { computeChargingCurrent } from './charging-current.js';
import { voltageDropScan } from './voltage-drop-mv.js';
import { verifyScreen } from './screen-sizing.js';
import { evaluateMvProtection, PROTECTION_DISCLAIMER } from './protection-mv.js';
import { designCurrentMv, MvDesignCurrentError } from './design-current-mv.js';
import type {
  MvAmpacityResult,
  MvChargingCurrentResult,
  MvCircuitInput,
  MvDataset,
  MvOverallStatus,
  MvProtectionResult,
  MvScreenResult,
  MvSelectionDriver,
  MvShortCircuitResult,
  MvSizingResult,
  MvVoltageDropResult,
} from './types-mv.js';
import type { EngineError, Warning } from '../types/index.js';

// ─── public options ─────────────────────────────────────────────────

export interface SizeCableMvOptions {
  dataset?: MvDataset;
}

// ─── helpers ────────────────────────────────────────────────────────

function emptyAmpacity(): MvAmpacityResult {
  return {
    correctionFactors: { k1: 1, k2: 1, k3: 1, k4: 1, total: 1, lookupPolicy: 'exact' },
    baseAmpacityRowA: null,
    requiredIzA: 0,
    minimumCSAmm2: null,
    selectedCSAmm2: null,
    cableRatingA: null,
    selectedDatasetId: null,
    status: 'FAIL',
  };
}

function emptyCharging(): MvChargingCurrentResult {
  return {
    capacitanceUFPerKm: 0,
    ic_A_per_km: 0,
    ic_A: 0,
    effectiveCurrentA: 0,
    applied: false,
    overrideUsed: false,
  };
}

function emptyVoltageDrop(max: number): MvVoltageDropResult {
  return {
    cableR_ohm_per_km: null,
    cableX_ohm_per_km: null,
    calculatedDropV: null,
    calculatedDropPercent: null,
    minimumCSAmm2: null,
    maxAllowedPercent: max,
    status: 'FAIL',
  };
}

function emptyShortCircuit(): MvShortCircuitResult {
  return { kValueConductor: 143, requiredCSARaw: 0, minimumCSAmm2: null, status: 'FAIL' };
}

function emptyScreen(): MvScreenResult {
  return { screenCsaMm2: null, requiredScreenCsaMm2: null, autoFilled: false, status: 'INCOMPLETE' };
}

function emptyProtection(): MvProtectionResult {
  return {
    condition1: { formula: 'In ≥ IB', values: { IB: 0, In: Number.NaN }, pass: false },
    condition2: {
      formula: 'breakingKA ≥ shortCircuitKA',
      values: { breakingKA: Number.NaN, shortCircuitKA: Number.NaN },
      pass: false,
    },
    status: 'INCOMPLETE',
    disclaimer: PROTECTION_DISCLAIMER,
  };
}

// ─── input validation + defaults ────────────────────────────────────

function validateMv(input: MvCircuitInput, errors: EngineError[]): void {
  // System fixed values
  if (input.system.voltageV !== 22900) {
    errors.push({
      code: 'E-MV-VAL-001',
      message: 'system.voltageV must be 22900 for the 22.9kV MV preset',
      field: 'system.voltageV',
      fatal: true,
    });
  }
  if (input.system.lineToGroundV !== 13200) {
    errors.push({
      code: 'E-MV-VAL-001',
      message: 'system.lineToGroundV must be 13200 for the 22.9kV-Y system',
      field: 'system.lineToGroundV',
      fatal: true,
    });
  }
  if (input.system.phase !== 3 || input.system.frequencyHz !== 60) {
    errors.push({
      code: 'E-MV-VAL-001',
      message: 'MV system is fixed at 3-phase 60 Hz',
      field: 'system',
      fatal: true,
    });
  }

  if (!(input.route.lengthM > 0)) {
    errors.push({
      code: 'E-MV-VAL-003',
      message: 'route.lengthM must be > 0',
      field: 'route.lengthM',
      fatal: true,
    });
  }

  if (input.installation.soilResistivityK_m_W == null) {
    errors.push({
      code: 'E-MV-VAL-004',
      message: 'installation.soilResistivityK_m_W is required (no silent default)',
      field: 'installation.soilResistivityK_m_W',
      fatal: true,
    });
  }

  if (
    input.installation.formation === 'flat_spaced' &&
    (input.installation.flatSpacingMm == null || input.installation.flatSpacingMm <= 0)
  ) {
    errors.push({
      code: 'E-MV-VAL-005',
      message: 'flat_spaced formation requires flatSpacingMm',
      field: 'installation.flatSpacingMm',
      fatal: true,
    });
  }

  // Cross-input check: earth-fault pair must be both present or both absent.
  const hasI =
    typeof input.protection.earthFaultKA === 'number' && Number.isFinite(input.protection.earthFaultKA);
  const hasT =
    typeof input.protection.earthFaultTimeS === 'number' && Number.isFinite(input.protection.earthFaultTimeS);
  if (hasI !== hasT) {
    errors.push({
      code: 'E-MV-VAL-006',
      message: 'Earth-fault current and time must both be provided (or both omitted)',
      field: 'protection.earthFault*',
      fatal: true,
    });
  }
}

function applyMvDefaults(input: MvCircuitInput, warnings: Warning[]): MvCircuitInput {
  const out: MvCircuitInput = JSON.parse(JSON.stringify(input));
  let changed = false;

  if (out.installation.ambientTempC == null) {
    out.installation.ambientTempC = 25;
    warnings.push({
      code: 'W-MV-AMBIENT-DEFAULT',
      message: 'Ground temperature not provided — defaulting to 25°C',
      field: 'installation.ambientTempC',
    });
    changed = true;
  }
  if (out.installation.burialDepthM == null) {
    out.installation.burialDepthM = 0.8;
    changed = true;
  }
  if (out.installation.groupCount == null) {
    out.installation.groupCount = 1;
    changed = true;
  }
  if (out.projectPolicy.chargingCurrentThreshold == null) {
    out.projectPolicy.chargingCurrentThreshold = 0.01;
  }
  if (changed) {
    warnings.push({ code: 'W-MV-DEFAULT-APPLIED', message: 'Defaults substituted for missing optional inputs' });
  }
  return out;
}

// ─── main pipeline ──────────────────────────────────────────────────

export function sizeCableMv(input: MvCircuitInput, options: SizeCableMvOptions = {}): MvSizingResult {
  const dataset = options.dataset ?? loadMvDataset();
  const datasetId = dataset.meta.datasetId;
  const audit = new AuditBuilder();
  const warnings: Warning[] = [];
  const errors: EngineError[] = [];

  // Step 1 — validation
  validateMv(input, errors);
  if (errors.some((e) => e.fatal)) {
    return finalize({
      designCurrentA: 0,
      ampacity: emptyAmpacity(),
      chargingCurrent: emptyCharging(),
      voltageDrop: emptyVoltageDrop(input.projectPolicy?.maxVoltageDropPercent ?? 3),
      shortCircuit: emptyShortCircuit(),
      screen: emptyScreen(),
      protection: emptyProtection(),
      recommendedCSAmm2: null,
      selectionDriver: 'none',
      overallStatus: 'INCOMPLETE',
      warnings,
      errors,
      datasetId,
      auditTrail: audit.build(),
    });
  }

  // Step 2 — defaults
  const filled = applyMvDefaults(input, warnings);

  // Step 3 — design current
  let designCurrentA = 0;
  try {
    const dc = designCurrentMv({
      loadType: filled.load.type,
      voltageV: filled.system.voltageV,
      powerKW: filled.load.powerKW,
      apparentPowerMVA: filled.load.apparentPowerMVA,
      powerFactor: filled.load.powerFactor,
      efficiency: filled.load.efficiency,
      demandFactor: filled.load.demandFactor,
      designCurrentOverrideA: filled.load.designCurrentOverrideA,
    });
    designCurrentA = dc.designCurrentA;
    audit.add({
      criterion: 'designCurrent',
      inputs: {
        loadType: filled.load.type,
        powerKW: filled.load.powerKW,
        apparentPowerMVA: filled.load.apparentPowerMVA,
      },
      formula: dc.source === 'transformer' ? 'IB = S / (√3 · V)' : 'IB = (P×1000) / (√3·V·cosφ·η) × df',
      intermediateValues: dc.intermediate,
      decision: 'INFO',
      reason: `IB = ${designCurrentA.toFixed(2)} A (${dc.source}).`,
    });
    if (dc.source === 'override') {
      warnings.push({ code: 'W-MV-IB-OVERRIDE', message: 'designCurrentOverrideA in use', field: 'load.designCurrentOverrideA' });
    }
  } catch (err) {
    if (err instanceof MvDesignCurrentError) {
      errors.push({ code: err.code, message: err.message, field: 'load', fatal: true });
    } else throw err;
    return finalize({
      designCurrentA: 0,
      ampacity: emptyAmpacity(),
      chargingCurrent: emptyCharging(),
      voltageDrop: emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent),
      shortCircuit: emptyShortCircuit(),
      screen: emptyScreen(),
      protection: emptyProtection(),
      recommendedCSAmm2: null,
      selectionDriver: 'none',
      overallStatus: 'INCOMPLETE',
      warnings,
      errors,
      datasetId,
      auditTrail: audit.build(),
    });
  }

  // Step 4 — correction factors
  const corr = computeMvCorrections(dataset.corrections, {
    ambientTempC: filled.installation.ambientTempC!,
    soilResistivityK_m_W: filled.installation.soilResistivityK_m_W!,
    groupCount: filled.installation.groupCount!,
    burialDepthM: filled.installation.burialDepthM!,
    installation: filled.installation.method,
  });
  if (!corr.ok) {
    for (const e of corr.errors) errors.push({ code: e.code, message: e.message, field: e.field, fatal: true });
    return finalize({
      designCurrentA,
      ampacity: { ...emptyAmpacity(), correctionFactors: corr.factors },
      chargingCurrent: emptyCharging(),
      voltageDrop: emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent),
      shortCircuit: emptyShortCircuit(),
      screen: emptyScreen(),
      protection: emptyProtection(),
      recommendedCSAmm2: null,
      selectionDriver: 'none',
      overallStatus: 'INCOMPLETE',
      warnings,
      errors,
      datasetId,
      auditTrail: audit.build(),
    });
  }
  if (corr.factors.lookupPolicy === 'safe-side') {
    warnings.push({
      code: 'W-MV-LOOKUP-SAFE-SIDE',
      message: 'One or more correction factors used safe-side neighbor lookup',
    });
  }
  audit.add({
    criterion: 'corrections',
    inputs: {
      ambientTempC: filled.installation.ambientTempC,
      soil: filled.installation.soilResistivityK_m_W,
      groupCount: filled.installation.groupCount,
      burialDepthM: filled.installation.burialDepthM,
      method: filled.installation.method,
    },
    formula: 'k_total = k1·k2·k3·k4',
    intermediateValues: corr.factors as unknown as Record<string, unknown>,
    decision: 'INFO',
    reason: `k_total = ${corr.factors.total.toFixed(4)} (k1=${corr.factors.k1}, k2=${corr.factors.k2}, k3=${corr.factors.k3}, k4=${corr.factors.k4}).`,
  });

  // Step 5 — ampacity
  const ampLookup = resolveMvAmpacity(dataset.ampacity.datasets, {
    cableType: filled.cable.cableType,
    installationMethod: filled.installation.method,
  });
  if (!ampLookup.ok) {
    errors.push({ code: ampLookup.code, message: ampLookup.message, field: 'cable.cableType', fatal: true });
    return finalize({
      designCurrentA,
      ampacity: { ...emptyAmpacity(), correctionFactors: corr.factors },
      chargingCurrent: emptyCharging(),
      voltageDrop: emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent),
      shortCircuit: emptyShortCircuit(),
      screen: emptyScreen(),
      protection: emptyProtection(),
      recommendedCSAmm2: null,
      selectionDriver: 'none',
      overallStatus: 'INCOMPLETE',
      warnings,
      errors,
      datasetId,
      auditTrail: audit.build(),
    });
  }
  const requiredIz = designCurrentA / corr.factors.total;
  const ampacityRow = selectMvCsaForRequiredIz(ampLookup.rows, requiredIz);
  if (!ampacityRow) {
    errors.push({
      code: 'E-MV-CSA-001',
      message: `Required IZ ${requiredIz.toFixed(1)}A exceeds maximum tabulated ampacity`,
      field: 'cable',
      fatal: true,
    });
    return finalize({
      designCurrentA,
      ampacity: {
        ...emptyAmpacity(),
        correctionFactors: corr.factors,
        requiredIzA: requiredIz,
        selectedDatasetId: ampLookup.dataset.id,
      },
      chargingCurrent: emptyCharging(),
      voltageDrop: emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent),
      shortCircuit: emptyShortCircuit(),
      screen: emptyScreen(),
      protection: emptyProtection(),
      recommendedCSAmm2: null,
      selectionDriver: 'none',
      overallStatus: 'INCOMPLETE',
      warnings,
      errors,
      datasetId,
      auditTrail: audit.build(),
    });
  }
  const ampacityResult: MvAmpacityResult = {
    correctionFactors: corr.factors,
    baseAmpacityRowA: ampacityRow.ampacityA,
    requiredIzA: requiredIz,
    minimumCSAmm2: ampacityRow.csaMm2,
    selectedCSAmm2: ampacityRow.csaMm2,
    cableRatingA: ampacityRow.ampacityA * corr.factors.total,
    selectedDatasetId: ampLookup.dataset.id,
    status: 'PASS',
  };
  audit.add({
    criterion: 'ampacity',
    inputs: { IB: designCurrentA, kTotal: corr.factors.total },
    formula: "IZ' = IB / k_total ; pick smallest CSA s.t. ampacityA ≥ IZ'",
    intermediateValues: { requiredIzA: requiredIz, csa: ampacityRow.csaMm2, baseAmpacity: ampacityRow.ampacityA },
    decision: 'PASS',
    reason: `csa_A = ${ampacityRow.csaMm2}mm² (rated ${ampacityRow.ampacityA}A · ${corr.factors.total.toFixed(3)} = ${ampacityResult.cableRatingA?.toFixed(1)}A ≥ IB ${designCurrentA.toFixed(1)}A).`,
  });

  // Step 6 — voltage drop scan
  const lastSize = dataset.standardSizes.sizesMm2[dataset.standardSizes.sizesMm2.length - 1]!;
  const vdScan = voltageDropScan({
    standardSizes: dataset.standardSizes.sizesMm2,
    startCsaMm2: ampacityResult.minimumCSAmm2!,
    endCsaMm2: lastSize,
    impedance: dataset.impedance,
    capacitance: dataset.capacitance,
    cableType: filled.cable.cableType,
    capacitanceOverrideUFPerKm: filled.cable.capacitanceUFPerKm ?? null,
    voltageV: filled.system.voltageV,
    lineToGroundV: filled.system.lineToGroundV,
    powerFactor: filled.load.powerFactor ?? 0.9,
    designCurrentA,
    lengthM: filled.route.lengthM,
    frequencyHz: filled.system.frequencyHz,
    chargingCurrentThreshold: filled.projectPolicy.chargingCurrentThreshold,
    maxAllowedPercent: filled.projectPolicy.maxVoltageDropPercent,
  });

  let vdResult: MvVoltageDropResult;
  let chargingResult: MvChargingCurrentResult;
  let csa_V: number | null = null;
  if (!vdScan.ok) {
    errors.push({ code: vdScan.code, message: vdScan.message, field: 'cable', fatal: true });
    vdResult = emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent);
    chargingResult = emptyCharging();
  } else {
    const sel = vdScan.selected;
    csa_V = vdScan.selectedCSAmm2;
    if (sel) {
      vdResult = {
        cableR_ohm_per_km: sel.rOhmPerKm,
        cableX_ohm_per_km: sel.xOhmPerKm,
        calculatedDropV: sel.dropV,
        calculatedDropPercent: sel.dropPercent,
        minimumCSAmm2: csa_V,
        maxAllowedPercent: filled.projectPolicy.maxVoltageDropPercent,
        status: csa_V !== null ? 'PASS' : 'FAIL',
      };
      chargingResult = {
        capacitanceUFPerKm: sel.capacitanceUFPerKm,
        ic_A_per_km: sel.ic_A / Math.max(1e-9, filled.route.lengthM / 1000),
        ic_A: sel.ic_A,
        effectiveCurrentA: sel.effectiveCurrentA,
        applied: sel.effectiveCurrentA !== designCurrentA,
        overrideUsed: filled.cable.capacitanceUFPerKm != null,
      };
      if (chargingResult.applied) {
        warnings.push({
          code: 'W-MV-CHARGING-APPLIED',
          message: `Charging current Ic=${sel.ic_A.toFixed(2)}A folded into IB → I_eff=${sel.effectiveCurrentA.toFixed(2)}A`,
        });
        warnings.push({
          code: 'W-MV-CHARGING-CONSERVATIVE',
          message: 'Ic blended via √(IB² + Ic²); phase cancellation not modelled (Amendment 1)',
        });
      } else {
        warnings.push({ code: 'W-MV-CHARGING-IGNORED', message: 'Ic / IB below threshold — Ic not applied' });
      }
      if (chargingResult.overrideUsed) {
        warnings.push({ code: 'W-MV-CAPACITANCE-OVERRIDE', message: 'User-supplied cable capacitance in use', field: 'cable.capacitanceUFPerKm' });
      }
    } else {
      vdResult = emptyVoltageDrop(filled.projectPolicy.maxVoltageDropPercent);
      chargingResult = emptyCharging();
    }
    audit.add({
      criterion: 'voltageDrop',
      inputs: {
        IB: designCurrentA,
        length_m: filled.route.lengthM,
        cableType: filled.cable.cableType,
      },
      formula: 'ΔU = √3 · I_eff · (R cosφ + X sinφ) · L  (scan ascending csa)',
      intermediateValues: {
        candidates: vdScan.candidates.map((c) => ({
          csa: c.csaMm2,
          dropPercent: Number(c.dropPercent.toFixed(4)),
          pass: c.pass,
        })),
        selected: csa_V,
      },
      decision: csa_V == null ? 'FAIL' : 'PASS',
      reason: csa_V == null
        ? 'No CSA satisfies the voltage drop budget within the standard ladder.'
        : `csa_V = ${csa_V}mm² (ΔU% = ${vdResult.calculatedDropPercent?.toFixed(2)} ≤ ${filled.projectPolicy.maxVoltageDropPercent}).`,
    });
  }

  // Step 7 — short-circuit (conductor)
  let scResult: MvShortCircuitResult = emptyShortCircuit();
  let csa_SC: number | null = null;
  if (
    typeof filled.protection.shortCircuitKA === 'number' &&
    filled.protection.shortCircuitKA > 0 &&
    typeof filled.protection.tripTimeS === 'number' &&
    filled.protection.tripTimeS > 0
  ) {
    const kCond = dataset.shortCircuit.kValues.values.find(
      (v) => v.application === 'conductor' && v.material === 'Cu' && v.insulationType === 'XLPE',
    )!.kValue;
    const sc = shortCircuitCSA({
      shortCircuitA: filled.protection.shortCircuitKA * 1000,
      tripTimeS: filled.protection.tripTimeS,
      kValue: kCond,
    });
    const next = nextStandardAtLeast(dataset.standardSizes.sizesMm2, sc.requiredCSARaw);
    csa_SC = next ?? null;
    scResult = {
      kValueConductor: kCond,
      requiredCSARaw: sc.requiredCSARaw,
      minimumCSAmm2: csa_SC,
      status: csa_SC != null ? 'PASS' : 'FAIL',
    };
    audit.add({
      criterion: 'shortCircuit',
      inputs: { isc_kA: filled.protection.shortCircuitKA, t_s: filled.protection.tripTimeS, k: kCond },
      formula: 'S_min = (Isc · √t) / k',
      intermediateValues: { S_raw_mm2: sc.requiredCSARaw, csa_SC: csa_SC ?? null },
      decision: scResult.status === 'PASS' ? 'PASS' : 'FAIL',
      reason: csa_SC != null
        ? `csa_SC = ${csa_SC}mm² (raw ${sc.requiredCSARaw.toFixed(2)}mm²).`
        : 'Required SC csa exceeds the standard ladder maximum.',
    });
  } else {
    scResult = { kValueConductor: 143, requiredCSARaw: 0, minimumCSAmm2: null, status: 'PASS' };
    audit.add({
      criterion: 'shortCircuit',
      inputs: {},
      formula: 'S_min = (Isc · √t) / k',
      intermediateValues: {},
      decision: 'INFO',
      reason: 'Short-circuit inputs absent — SC check skipped.',
    });
  }

  // Step 8 — recommendation
  const candidatesForRec = [
    ampacityResult.minimumCSAmm2,
    csa_V,
    csa_SC,
  ].filter((c): c is number => c != null);
  const recommendedRaw = candidatesForRec.length > 0 ? Math.max(...candidatesForRec) : null;
  const recommendedCSAmm2 = recommendedRaw != null
    ? nextStandardAtLeast(dataset.standardSizes.sizesMm2, recommendedRaw) ?? null
    : null;

  const driverWinners = [
    ampacityResult.minimumCSAmm2 === recommendedRaw ? 'ampacity' : null,
    csa_V === recommendedRaw ? 'voltage_drop' : null,
    csa_SC === recommendedRaw ? 'short_circuit' : null,
  ].filter((d): d is Exclude<MvSelectionDriver, 'mixed' | 'none'> => d != null);
  const selectionDriver: MvSelectionDriver =
    recommendedCSAmm2 == null
      ? 'none'
      : driverWinners.length > 1
        ? 'mixed'
        : driverWinners[0] ?? 'none';

  audit.add({
    criterion: 'recommended',
    inputs: { csa_A: ampacityResult.minimumCSAmm2, csa_V, csa_SC },
    formula: 'csa_rec = max(csa_A, csa_V, csa_SC) → next standard',
    intermediateValues: { recommendedCSAmm2, selectionDriver },
    decision: recommendedCSAmm2 == null ? 'FAIL' : 'PASS',
    reason: recommendedCSAmm2 == null
      ? 'No conductor CSA satisfies all criteria.'
      : `Recommended ${recommendedCSAmm2}mm² (driver: ${selectionDriver}).`,
  });

  // Step 9 — screen
  let screenResult: MvScreenResult = emptyScreen();
  if (recommendedCSAmm2 != null && filled.projectPolicy.verifyScreen) {
    const sc = verifyScreen({
      screen: dataset.screen,
      cableType: filled.cable.cableType,
      conductorCsaMm2: recommendedCSAmm2,
      screenCsaOverrideMm2: filled.cable.screenCsaMm2 ?? null,
      earthFaultKA: filled.protection.earthFaultKA,
      earthFaultTimeS: filled.protection.earthFaultTimeS,
      kValueScreen: dataset.shortCircuit.kValues.values.find((v) => v.application === 'screen')!.kValue,
    });
    if (!sc.ok) {
      errors.push({ code: sc.code, message: sc.message, field: 'cable.screenCsaMm2', fatal: true });
    } else {
      screenResult = {
        screenCsaMm2: sc.screenCsaMm2,
        requiredScreenCsaMm2: sc.requiredScreenCsaMm2,
        autoFilled: sc.autoFilled,
        status: sc.status,
      };
      if (sc.autoFilled) warnings.push({ code: 'W-MV-SCREEN-AUTO-FILLED', message: 'Screen CSA auto-filled from dataset' });
      if (sc.override) warnings.push({ code: 'W-MV-SCREEN-OVERRIDE', message: 'User screen CSA differs from dataset value' });
      if (sc.status === 'INCOMPLETE') warnings.push({ code: 'W-MV-SCREEN-INCOMPLETE', message: 'Screen verification skipped (earth-fault inputs missing)' });
      audit.add({
        criterion: 'protection',
        inputs: {
          screen_csa: sc.screenCsaMm2,
          ie_kA: filled.protection.earthFaultKA,
          t_s: filled.protection.earthFaultTimeS,
        },
        formula: 'S_screen = (Ie · √t) / k_screen',
        intermediateValues: { required: sc.requiredScreenCsaMm2 },
        decision: sc.status === 'PASS' ? 'PASS' : sc.status === 'FAIL' ? 'FAIL' : 'INCOMPLETE',
        reason: sc.reason,
      });
    }
  }

  // Step 10 — protection coordination
  const protectionResult = evaluateMvProtection({
    designCurrentA,
    ratedCurrentA: filled.protection.ratedCurrentA,
    breakingKA: filled.protection.breakingKA,
    shortCircuitKA: filled.protection.shortCircuitKA,
  });
  warnings.push({ code: 'W-MV-PROTECTION-DISCLAIMER', message: PROTECTION_DISCLAIMER });
  audit.add({
    criterion: 'protection',
    inputs: {
      IB: designCurrentA,
      In: filled.protection.ratedCurrentA,
      breaking_kA: filled.protection.breakingKA,
      isc_kA: filled.protection.shortCircuitKA,
    },
    formula: 'In ≥ IB AND breakingKA ≥ shortCircuitKA',
    intermediateValues: {
      cond1: protectionResult.condition1.pass,
      cond2: protectionResult.condition2.pass,
    },
    decision: protectionResult.status === 'PASS' ? 'PASS' : protectionResult.status === 'FAIL' ? 'FAIL' : 'INCOMPLETE',
    reason: `Protection ${protectionResult.status}.`,
  });

  // Overall status
  const failures: boolean[] = [
    ampacityResult.status === 'FAIL',
    vdResult.status === 'FAIL',
    scResult.status === 'FAIL',
    screenResult.status === 'FAIL',
    protectionResult.status === 'FAIL',
  ];
  const incompletes: boolean[] = [
    screenResult.status === 'INCOMPLETE',
    protectionResult.status === 'INCOMPLETE',
  ];

  const overallStatus: MvOverallStatus =
    errors.some((e) => e.fatal) || recommendedCSAmm2 == null
      ? 'INCOMPLETE'
      : failures.some((f) => f)
        ? 'FAIL'
        : incompletes.some((i) => i)
          ? 'INCOMPLETE'
          : warnings.some((w) => w.code !== 'W-MV-PROTECTION-DISCLAIMER')
            ? 'WARNING'
            : 'PASS';

  return finalize({
    designCurrentA,
    ampacity: ampacityResult,
    chargingCurrent: chargingResult,
    voltageDrop: vdResult,
    shortCircuit: scResult,
    screen: screenResult,
    protection: protectionResult,
    recommendedCSAmm2,
    selectionDriver,
    overallStatus,
    warnings,
    errors,
    datasetId,
    auditTrail: audit.build(),
  });
}

function finalize(partial: Omit<MvSizingResult, 'kind' | 'engineVersion' | 'apiVersion'>): MvSizingResult {
  // Recompute IZ recheck info: cableRatingA needs to reflect final csa.
  return {
    kind: 'MV',
    engineVersion: ENGINE_VERSION,
    apiVersion: API_VERSION,
    ...partial,
  };
}

// Re-export types for consumers that want only the MV public API surface.
export type { MvSizingResult } from './types-mv.js';

// Allow callers to also reach the IZ recheck helper if needed.
export { ampacityAtMvCsa };
