/**
 * Types for the 22.9kV MV (Korean distribution) cable-sizing extension.
 *
 * Mirrors the LV `types/index.ts` style — the MV pipeline is a parallel
 * orchestrator that consumes its own dataset (`mv_22kv_kr_v1`) and shares
 * the LV physics primitives (`voltageDrop`, `shortCircuitCSA`).
 *
 * Reference: PRD_22.9kV_MV_Cable_Sizing_v1.2_FINAL §7-§13 + Calc Spec v0.2.
 */

import type { Decision, AuditStep, Warning, EngineError } from '../types/index.js';

// ─────────────────────────────────────────────────────────────────────
// Enumerations
// ─────────────────────────────────────────────────────────────────────

export type MvLoadType = 'general' | 'motor' | 'transformer';
export type MvCableType = 'CNCV-W' | 'TR-CNCV-W' | 'FR-CNCO-W';
export type MvInstallationMethod = 'direct_buried' | 'duct_bank' | 'trough' | 'tunnel';
export type MvFormation = 'trefoil' | 'flat_touching' | 'flat_spaced';
export type MvProtectiveDevice = 'VCB' | 'Fuse' | 'Recloser';
export type MvStatus = 'PASS' | 'FAIL';
export type MvOverallStatus = 'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE';
export type MvScreenStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';

// ─────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────

export interface MvCircuitInput {
  load: {
    type: MvLoadType;
    /** Required for general/motor loads (kW). For transformer use `apparentPowerMVA`. */
    powerKW: number | null;
    /** Required for transformer loads (MVA). */
    apparentPowerMVA: number | null;
    /** General/motor only. Transformer ignores. */
    powerFactor: number | null;
    /** General/motor only. Transformer ignores. */
    efficiency: number | null;
    /** General/motor only. Transformer ignores. */
    demandFactor: number | null;
    /** Override path. When provided, replaces the load-based IB calc. */
    designCurrentOverrideA?: number | null;
  };
  /** System voltage is fixed for the Korean 22.9kV distribution network. */
  system: {
    /** Phase-to-phase nominal voltage. Always 22900 V. */
    voltageV: 22900;
    /** Phase-to-ground voltage U₀ used for charging current. Always 13200 V. */
    lineToGroundV: 13200;
    phase: 3;
    frequencyHz: 60;
  };
  cable: {
    cableType: MvCableType;
    /**
     * Optional override of the screen CSA (mm²). When omitted, the engine
     * auto-fills from the screen dataset using the recommended conductor CSA.
     */
    screenCsaMm2?: number | null;
    /**
     * Optional override of cable capacitance (μF/km). When omitted, the
     * engine looks up `[cableType, voltageGrade=12.7/22, csaMm2]` from
     * `cap_cncvw_cu.json`. Override emits W-MV-030.
     */
    capacitanceUFPerKm?: number | null;
  };
  installation: {
    method: MvInstallationMethod;
    formation: MvFormation;
    /** Required when formation = 'flat_spaced'. */
    flatSpacingMm?: number | null;
    /** Soil thermal resistivity (K·m/W). REQUIRED — no silent default. */
    soilResistivityK_m_W: number | null;
    /** Burial depth from ground surface to cable top (m). Default 0.8 m allowed. */
    burialDepthM: number | null;
    /** Number of circuits in the same trench / duct bank. Default 1. */
    groupCount: number | null;
    /** Ground/ambient temperature (°C). REQUIRED — default emits warning. */
    ambientTempC: number | null;
  };
  protection: {
    deviceType: MvProtectiveDevice;
    /** Rated continuous current of the protective device (A). */
    ratedCurrentA: number | null;
    /** Breaking capacity (kA). */
    breakingKA: number | null;
    /** Trip / clearing time used in conductor short-circuit check (s). */
    tripTimeS: number | null;
    /** Available three-phase short-circuit current at the cable origin (kA). */
    shortCircuitKA: number | null;
    /** Earth fault current (kA). Optional — drives screen sizing. */
    earthFaultKA?: number | null;
    /** Earth fault clearing time (s). Optional — drives screen sizing. */
    earthFaultTimeS?: number | null;
  };
  route: {
    lengthM: number;
  };
  projectPolicy: {
    /** Maximum permitted voltage drop (% of nominal Un). */
    maxVoltageDropPercent: number;
    /** Whether to verify screen short-circuit capacity. Default true. */
    verifyScreen: boolean;
    /**
     * Threshold (Ic / IB) above which charging current is folded into
     * voltage drop as I_eff = √(IB² + Ic²). Default 0.01 (1 %).
     */
    chargingCurrentThreshold: number;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────

export interface MvCorrectionFactors {
  /** Ground/ambient temperature factor (k1). */
  k1: number;
  /** Soil thermal resistivity factor (k2). */
  k2: number;
  /** Grouping factor (k3). */
  k3: number;
  /** Burial depth factor (k4). 1.0 for non-buried installs. */
  k4: number;
  total: number;
  lookupPolicy: 'exact' | 'safe-side';
}

export interface MvAmpacityResult {
  correctionFactors: MvCorrectionFactors;
  baseAmpacityRowA: number | null;
  requiredIzA: number;
  minimumCSAmm2: number | null;
  selectedCSAmm2: number | null;
  cableRatingA: number | null;
  selectedDatasetId: string | null;
  status: MvStatus;
}

export interface MvChargingCurrentResult {
  /** Capacitance used (μF/km). */
  capacitanceUFPerKm: number;
  /** Charging current per cable per km (A/km). */
  ic_A_per_km: number;
  /** Total Ic over the line length (A). */
  ic_A: number;
  /** Effective design current after Ic blending. Equals IB if below threshold. */
  effectiveCurrentA: number;
  /** Whether Ic was folded in. */
  applied: boolean;
  /** override emitted (W-MV-030). */
  overrideUsed: boolean;
}

export interface MvVoltageDropResult {
  cableR_ohm_per_km: number | null;
  cableX_ohm_per_km: number | null;
  calculatedDropV: number | null;
  calculatedDropPercent: number | null;
  minimumCSAmm2: number | null;
  maxAllowedPercent: number;
  status: MvStatus;
}

export interface MvShortCircuitResult {
  kValueConductor: number;
  requiredCSARaw: number;
  minimumCSAmm2: number | null;
  status: MvStatus;
}

export interface MvScreenResult {
  /** Resolved screen CSA used for the check (mm²). */
  screenCsaMm2: number | null;
  /** Required screen CSA from earth fault adiabatic check (mm²). */
  requiredScreenCsaMm2: number | null;
  /** Whether the value came from auto-fill (true) or user override (false). */
  autoFilled: boolean;
  status: MvScreenStatus;
}

export interface MvProtectionResult {
  /** In ≥ IB. */
  condition1: { formula: string; values: { IB: number; In: number }; pass: boolean };
  /** breakingKA ≥ shortCircuitKA. */
  condition2: { formula: string; values: { breakingKA: number; shortCircuitKA: number }; pass: boolean };
  status: MvStatus | 'INCOMPLETE';
  disclaimer: string;
}

export type MvSelectionDriver = 'ampacity' | 'voltage_drop' | 'short_circuit' | 'mixed' | 'none';

export interface MvSizingResult {
  kind: 'MV';
  designCurrentA: number;
  ampacity: MvAmpacityResult;
  chargingCurrent: MvChargingCurrentResult;
  voltageDrop: MvVoltageDropResult;
  shortCircuit: MvShortCircuitResult;
  screen: MvScreenResult;
  protection: MvProtectionResult;
  recommendedCSAmm2: number | null;
  selectionDriver: MvSelectionDriver;
  overallStatus: MvOverallStatus;
  warnings: Warning[];
  errors: EngineError[];
  datasetId: string;
  engineVersion: string;
  apiVersion: number;
  auditTrail: AuditStep[];
}

// ─────────────────────────────────────────────────────────────────────
// Dataset shape (mv_22kv_kr_v1)
// ─────────────────────────────────────────────────────────────────────

export interface MvDatasetMeta {
  datasetId: string;
  standard: string;
  scope: string;
  title: string;
  sourceName: string;
  sourceEdition: string;
  sourceNotes: string;
  licensingNote: string;
  createdAt: string;
  updatedAt: string;
  status: string;
  voltageSystem: string;
  frequencyHz: number;
  conductorMaterial: string;
  insulationType: string;
  cableFamily: string;
}

export interface MvStandardSizes {
  id: string;
  sizesMm2: number[];
}

export interface MvAmpacityRow {
  csaMm2: number;
  ampacityA: number;
}

export interface MvAmpacityDataset {
  id: string;
  datasetId: string;
  cableType: MvCableType;
  conductorMaterial: 'Cu';
  insulationType: 'XLPE';
  voltageGrade: string;
  installationMethod: MvInstallationMethod;
  frequencyHz: number;
  baseConditions: {
    formation: MvFormation;
    groupCount: number;
    ambientTempC: number;
    soilResistivityK_m_W?: number;
    burialDepth_m?: number;
    [k: string]: unknown;
  };
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  rows: MvAmpacityRow[];
}

export interface MvAmbientFactorRow {
  ambientTempC: number;
  factor: number;
}

export interface MvAmbientFactorDataset {
  id: string;
  datasetId: string;
  factorType: 'ambient_ground_temperature';
  baseTemperatureC: number;
  baseFactor: number;
  conservativeDirection: 'higher' | 'lower';
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvAmbientFactorRow[];
}

export interface MvSoilFactorRow {
  soilResistivityK_m_W: number;
  factor: number;
}

export interface MvSoilFactorDataset {
  id: string;
  datasetId: string;
  factorType: 'soil_resistivity';
  baseSoilResistivityK_m_W: number;
  baseFactor: number;
  conservativeDirection: 'higher' | 'lower';
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvSoilFactorRow[];
}

export interface MvGroupingFactorRow {
  groupCount: number;
  direct_buried: number;
  duct_bank: number;
  trough: number;
  tunnel: number;
}

export interface MvGroupingFactorDataset {
  id: string;
  datasetId: string;
  factorType: 'grouping';
  baseFactor: number;
  conservativeDirection: 'higher' | 'lower';
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvGroupingFactorRow[];
}

export interface MvBurialDepthFactorRow {
  burialDepth_m: number;
  factor: number;
}

export interface MvBurialDepthFactorDataset {
  id: string;
  datasetId: string;
  factorType: 'burial_depth';
  baseBurialDepth_m: number;
  baseFactor: number;
  conservativeDirection: 'higher' | 'lower';
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvBurialDepthFactorRow[];
}

export interface MvImpedanceRow {
  csaMm2: number;
  r_ohm_per_km: number;
  x_ohm_per_km: number;
}

export interface MvImpedanceDataset {
  id: string;
  datasetId: string;
  cableType: MvCableType;
  conductorMaterial: 'Cu';
  insulationType: 'XLPE';
  voltageGrade: string;
  frequencyHz: number;
  meta: {
    r_reference_temp_c: number;
    x_frequency_hz: number;
    arrangement: MvFormation;
    source_type: string;
  };
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvImpedanceRow[];
}

export interface MvCapacitanceRow {
  csaMm2: number;
  capacitance_uF_per_km: number;
}

export interface MvCapacitanceDataset {
  id: string;
  datasetId: string;
  cableType: MvCableType;
  conductorMaterial: 'Cu';
  insulationType: 'XLPE';
  voltageGrade: string;
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvCapacitanceRow[];
}

export interface MvScreenRow {
  csaMm2: number;
  screen_csa_mm2: number;
  screen_construction: string;
  source_note: string;
}

export interface MvScreenDataset {
  id: string;
  datasetId: string;
  cableType: MvCableType;
  conductorMaterial: 'Cu';
  screenMaterial: 'Cu';
  authority: string;
  document: string;
  editionOrRevision: string;
  sourceRef: string;
  notes?: string;
  rows: MvScreenRow[];
}

export interface MvKValueEntry {
  material: 'Cu' | 'Al';
  insulationType: 'XLPE' | 'PVC';
  application: 'conductor' | 'screen';
  kValue: number;
  initialTempC: number;
  finalTempC: number;
}

export interface MvKValuesDataset {
  id: string;
  datasetId: string;
  authority: string;
  notes?: string;
  values: MvKValueEntry[];
}

export interface MvDataset {
  meta: MvDatasetMeta;
  standardSizes: MvStandardSizes;
  ampacity: { datasets: MvAmpacityDataset[] };
  corrections: {
    ambientGround: MvAmbientFactorDataset;
    soilResistivity: MvSoilFactorDataset;
    grouping: MvGroupingFactorDataset;
    burialDepth: MvBurialDepthFactorDataset;
  };
  impedance: { datasets: MvImpedanceDataset[] };
  capacitance: { datasets: MvCapacitanceDataset[] };
  screen: { datasets: MvScreenDataset[] };
  shortCircuit: { kValues: MvKValuesDataset };
}

// ─────────────────────────────────────────────────────────────────────
// Audit / Code taxonomies (MV-specific)
// ─────────────────────────────────────────────────────────────────────

export type MvErrorCode =
  | 'E-MV-VAL-001' // voltage / phase / frequency / fixed-system mismatch
  | 'E-MV-VAL-002' // power inputs missing / out of range
  | 'E-MV-VAL-003' // length missing or ≤ 0
  | 'E-MV-VAL-004' // soil resistivity required
  | 'E-MV-VAL-005' // formation=flat_spaced but spacing missing
  | 'E-MV-VAL-006' // earth fault one-of-two missing
  | 'E-MV-LOOKUP-001' // ampacity table not found (cableType + method exact match)
  | 'E-MV-LOOKUP-002' // impedance row missing for csa
  | 'E-MV-LOOKUP-003' // capacitance row missing for csa
  | 'E-MV-LOOKUP-004' // screen row missing for csa
  | 'E-MV-LOOKUP-005' // grouping out-of-range
  | 'E-MV-LOOKUP-006' // ground temperature out-of-range
  | 'E-MV-LOOKUP-007' // soil resistivity out-of-range
  | 'E-MV-LOOKUP-008' // burial depth out-of-range
  | 'E-MV-CSA-001' // required csa exceeds maximum standard size
  | 'E-MV-DATA-001'; // dataset quality check failed

export type MvWarningCode =
  | 'W-MV-DEFAULT-APPLIED' // default substituted for an optional field
  | 'W-MV-IB-OVERRIDE' // designCurrentOverrideA in use
  | 'W-MV-LOOKUP-SAFE-SIDE' // conservative neighbor used in correction lookup
  | 'W-MV-CHARGING-IGNORED' // Ic / IB < threshold → not folded
  | 'W-MV-CHARGING-APPLIED' // Ic / IB ≥ threshold → I_eff used
  | 'W-MV-CAPACITANCE-OVERRIDE' // user-supplied C value
  | 'W-MV-AMBIENT-DEFAULT' // ground temp not provided → default used
  | 'W-MV-SCREEN-AUTO-FILLED' // screen csa pulled from dataset
  | 'W-MV-SCREEN-OVERRIDE' // user-supplied screen csa differs from auto-fill
  | 'W-MV-SCREEN-INCOMPLETE' // earth fault inputs both missing → skipped
  | 'W-MV-PROTECTION-DISCLAIMER' // relay coordination scope notice
  | 'W-MV-CHARGING-CONSERVATIVE'; // Amendment 1 — non-vector sum reminder

// Re-export Decision/AuditStep/Warning/EngineError so callers see one home.
export type { Decision, AuditStep, Warning, EngineError };
