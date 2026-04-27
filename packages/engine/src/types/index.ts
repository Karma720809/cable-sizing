/**
 * Core types for @cable-sizing/engine
 *
 * Aligns with PRD v2.3 FINAL:
 *   §7  CircuitInput
 *   §12 SizingResult / AuditStep / Warning / EngineError
 *   §16 Error/Warning codes
 */

// ─────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────

export type LoadType = 'general' | 'motor' | 'heater' | 'lighting';
export type Phase = 1 | 3;
export type FrequencyHz = 50 | 60;

export type ConductorMaterial = 'Cu' | 'Al';
export type InsulationType = 'PVC' | 'XLPE';
export type CoreConfiguration = '2C' | '3C' | '4C' | '3C+N';
export type CableType = 'multicore' | 'single-core';

/** IEC 60364-5-52 reference installation methods (MVP subset available in dataset). */
export type ReferenceMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D1' | 'D2' | 'E' | 'F' | 'G';

export type ProtectiveDevice = 'MCB' | 'MCCB' | 'Fuse' | 'UserDefined';

export type ResistanceModel = 'fixed_reference' | 'temperature_corrected';
export type RoundingPolicy = 'next_standard_csa';

export interface CircuitInput {
  load: {
    type: LoadType;
    powerKW: number | null;
    powerFactor: number | null;
    efficiency: number | null;
    demandFactor: number | null;
    /** OQ-5: if provided, overrides load-based design current calc (WARNING emitted). */
    designCurrentOverrideA?: number | null;
  };
  system: {
    voltageV: number;
    phase: Phase;
    frequencyHz: FrequencyHz;
  };
  cable: {
    conductorMaterial: ConductorMaterial;
    insulationType: InsulationType;
    coreConfiguration: CoreConfiguration;
    cableType: CableType;
  };
  installation: {
    methodCode: ReferenceMethod;
    ambientTempC: number | null;
    soilResistivityK_m_W?: number | null;
    groupCount: number | null;
  };
  route: {
    /** one-way length (m). Will be converted to km internally. */
    lengthM: number;
  };
  protection: {
    deviceType: ProtectiveDevice;
    ratedCurrentA: number | null;
    /** OQ-3: if omitted, protection condition 2 reports INCOMPLETE. */
    operatingCurrentI2A?: number | null;
    tripTimeS: number | null;
    shortCircuitKA: number | null;
  };
  projectPolicy: {
    maxVoltageDropPercent: number;
    useReactance: boolean;
    ignoreReactanceBelowMm2?: number;
    /** OQ-4: MVP is fixed to 'fixed_reference'. */
    resistanceModel: ResistanceModel;
    roundingPolicy: RoundingPolicy;
  };
}

// ─────────────────────────────────────────────────────────────────────
// Output
// ─────────────────────────────────────────────────────────────────────

export type Status = 'PASS' | 'FAIL';
export type OverallStatus = 'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE';
export type ProtectionStatus = 'PASS' | 'FAIL' | 'INCOMPLETE';
export type Decision = 'PASS' | 'FAIL' | 'WARNING' | 'INCOMPLETE' | 'INFO';

export interface CorrectionFactors {
  k1: number;
  k2: number;
  k3: number;
  total: number;
}

export interface AmpacityResult {
  correctionFactors: CorrectionFactors;
  requiredIzA: number;
  minimumCSAmm2: number | null;
  selectedCSAmm2: number | null;
  cableRatingA: number | null;
  selectedTableRef: string | null;
  /** Phase 4A.3: which dataset (by id) produced the ampacity rows. */
  selectedDatasetId: string | null;
  /** Phase 4A.3: reference-method code actually used (A1/A2/B1/B2/C/D1/D2…). */
  selectedMethodRef: string | null;
  /**
   * Phase 4A.3: 2 for single-phase circuits (L+N), 3 for 3-phase. Lets the UI
   * explain why identical inputs with different phase produce different sizes.
   */
  loadedConductorsUsed: number | null;
  /**
   * Phase 4A.3: 'exact' if all three correction factors were exact-match
   * lookups, 'safe-side' if at least one used the conservative neighbor rule.
   */
  lookupPolicyUsed: 'exact' | 'safe-side' | null;
  status: Status;
}

export interface VoltageDropResult {
  /**
   * Reference-temperature resistance — the R value as tabulated in the
   * impedance bundle at the insulation's rated conductor temperature
   * (PVC = 70 °C, XLPE = 90 °C). Semantics unchanged since 0.1.0.
   */
  cableR_ohm_per_km: number;
  cableX_ohm_per_km: number;
  calculatedDropV: number | null;
  calculatedDropPercent: number | null;
  minimumCSAmm2: number | null;
  maxAllowedPercent: number;
  status: Status;
  /**
   * Added in Stage 5C (engine 0.10.0).
   *
   * When `projectPolicy.resistanceModel === 'temperature_corrected'`, this
   * is the R value actually used in the voltage-drop calculation — R
   * scaled from the reference temperature to the estimated conductor
   * operating temperature via the IEC 60287-1-1 linear-α formula.
   *
   * `null` when `resistanceModel === 'fixed_reference'` (the default), in
   * which case `cableR_ohm_per_km` is the value used in the calculation.
   */
  cableR_atOperatingTemp_ohm_per_km?: number | null;
  /**
   * Added in Stage 5C (engine 0.10.0).
   *
   * Estimated conductor operating temperature θ_op used to derive
   * `cableR_atOperatingTemp_ohm_per_km`. Computed from loading ratio
   * per IEC 60287-1-1 practice:
   *   θ_op = θ_ambient + (IB / IZ)² · (θ_max − θ_ambient), clamped to θ_max.
   *
   * `null` when `resistanceModel === 'fixed_reference'`.
   */
  operatingTempC?: number | null;
}

export interface ShortCircuitResult {
  kValue: number;
  requiredCSARaw: number;
  minimumCSAmm2: number | null;
  status: Status;
}

export interface ProtectionCoordinationResult {
  ratedCurrentA: number;
  operatingCurrentI2A: number | null;
  cableAmpacityIzA: number;
  condition1: {
    formula: string;
    values: { IB: number; In: number; IZ: number };
    pass: boolean;
  };
  condition2: {
    formula: string;
    values: { I2: number | null; threshold: number };
    pass: boolean | null;
  };
  status: ProtectionStatus;
}

/**
 * Phase 4A.3: which criterion ultimately dictated the recommended csa.
 *   'ampacity'           — thermal rating was the binding constraint
 *   'voltage_drop'       — long-run vdrop bumped the size
 *   'short_circuit'      — SC S_min governed
 *   'protection_recheck' — IZ recheck loop bumped the size (W-PROTECTION-RECHECK)
 *   'mixed'              — two or more criteria tied at the same size
 *   'none'               — no recommendation was produced (INCOMPLETE/FAIL)
 */
export type SelectionDriver =
  | 'ampacity'
  | 'voltage_drop'
  | 'short_circuit'
  | 'protection_recheck'
  | 'mixed'
  | 'none';

export interface SizingResult {
  designCurrentA: number;
  ampacity: AmpacityResult;
  voltageDrop: VoltageDropResult;
  shortCircuit: ShortCircuitResult;
  protectionCoordination: ProtectionCoordinationResult;
  recommendedCSAmm2: number | null;
  /** Phase 4A.3: which criterion produced the recommended csa. */
  selectionDriver: SelectionDriver;
  overallStatus: OverallStatus;
  warnings: Warning[];
  errors: EngineError[];
  datasetId: string;
  engineVersion: string;
  /** Phase 4A.3: kept separate from engineVersion so UI contracts evolve independently. */
  apiVersion: number;
  auditTrail: AuditStep[];
}

// ─────────────────────────────────────────────────────────────────────
// Audit / Warnings / Errors (PRD §16)
// ─────────────────────────────────────────────────────────────────────

export type AuditCriterion =
  | 'validation'
  | 'defaults'
  | 'designCurrent'
  | 'corrections'
  | 'ampacity'
  | 'voltageDrop'
  | 'shortCircuit'
  | 'recommended'
  | 'protection'
  | 'overall';

export interface AuditStep {
  step: number;
  criterion: AuditCriterion;
  inputs: Record<string, unknown>;
  formula: string;
  intermediateValues: Record<string, unknown>;
  decision: Decision;
  reason: string;
  code?: string;
}

export interface Warning {
  code: WarningCode;
  message: string;
  field?: string;
}

export interface EngineError {
  code: ErrorCode;
  message: string;
  field?: string;
  fatal: boolean;
}

// ─────────────────────────────────────────────────────────────────────
// Code taxonomies (PRD §16)
// ─────────────────────────────────────────────────────────────────────

export type ErrorCode =
  | 'E-VAL-001' // voltage <= 0
  | 'E-VAL-002' // powerFactor out of range
  | 'E-VAL-003' // ground install but soil missing
  | 'E-VAL-004' // no override and no powerKW
  | 'E-VAL-005' // length <= 0
  | 'E-VAL-006' // groupCount < 1
  | 'E-VAL-007' // ambientTempC required but missing
  | 'E-VAL-008' // efficiency / demandFactor out of range
  | 'E-VAL-009' // maxVoltageDropPercent <= 0
  | 'E-VAL-010' // invalid phase/frequency
  | 'E-LOOKUP-001' // ampacity combination missing
  | 'E-LOOKUP-002' // correction factor conservative lower not available
  | 'E-LOOKUP-003' // impedance for csa missing
  | 'E-LOOKUP-004' // k value combination missing
  | 'E-DOMAIN-001' // efficiency = 0
  | 'E-CSA-001' // required csa > max supported
  | 'E-DATA-001' // dataset quality check failed
  // ── MV (22.9kV Korean distribution) extension ──────────────────
  | 'E-MV-VAL-001' // MV system inputs invalid (voltage/phase/freq)
  | 'E-MV-VAL-002' // MV load inputs missing or out of range
  | 'E-MV-VAL-003' // MV route length missing or ≤ 0
  | 'E-MV-VAL-004' // MV soil resistivity required (no silent default)
  | 'E-MV-VAL-005' // MV flat_spaced formation requires spacing
  | 'E-MV-VAL-006' // MV earth-fault one-of-two missing
  | 'E-MV-LOOKUP-001' // MV ampacity table missing for cableType + method
  | 'E-MV-LOOKUP-002' // MV impedance row missing for csa
  | 'E-MV-LOOKUP-003' // MV capacitance row missing for csa
  | 'E-MV-LOOKUP-004' // MV screen row missing for csa
  | 'E-MV-LOOKUP-005' // MV grouping out of range
  | 'E-MV-LOOKUP-006' // MV ground temperature out of range
  | 'E-MV-LOOKUP-007' // MV soil resistivity out of range
  | 'E-MV-LOOKUP-008' // MV burial depth out of range
  | 'E-MV-CSA-001' // MV required csa exceeds maximum standard size
  | 'E-MV-DATA-001' // MV dataset quality check failed
  /**
   * Added in Stage 5C (engine 0.10.0).
   *
   * Fatal error emitted when `projectPolicy.resistanceModel ===
   * 'temperature_corrected'` is requested and the resolved ambient
   * temperature is ≥ the insulation's rated maximum conductor temperature
   * (PVC = 70 °C, XLPE = 90 °C). Under this condition the loading-ratio
   * operating-temperature estimate θ_op = θ_amb + (IB/IZ)²·(θ_max − θ_amb)
   * is ill-defined (negative thermal headroom) and the cable installation
   * is outside the IEC 60287 rating envelope; we refuse to guess.
   *
   * Never fires when `resistanceModel === 'fixed_reference'`.
   */
  | 'E-TEMP-AMBIENT-OVER-MAX';

export type WarningCode =
  | 'W-DEFAULT-APPLIED'
  | 'W-REACTANCE-IGNORED'
  | 'W-IB-OVERRIDE'
  | 'W-I2-MISSING'
  /**
   * Non-exact correction-factor lookup was resolved via safe-side rule
   * (neighbor with smaller factor → larger derating → larger required CSA).
   * Renamed from W-FACTOR-CONSERVATIVE in v0.1.1 for semantic accuracy.
   */
  | 'W-LOOKUP-SAFE-SIDE'
  | 'W-PROTECTION-RECHECK'
  /**
   * Added in Stage 5B-IMP-INFRA (engine 0.8.0). Still live post-5B-IMP
   * (engine 0.9.0) for combinations without a native 60 Hz bundle.
   *
   * Emitted when the circuit is evaluated at `frequencyHz: 60` with
   * `projectPolicy.useReactance: true` but no 60 Hz impedance dataset
   * is bundled for the requested (conductorMaterial, cableType). The
   * engine internally degrades to `useReactance: false` for the
   * voltage-drop calculation (sets X = 0) so that a sizing result is
   * still produced, and records this choice via this warning.
   *
   * After 5B-IMP (0.9.0), multicore Cu/Al carry native 60 Hz reactance
   * (X60 = 1.2 · X50) and never emit this warning. Single-core remains
   * uncovered and continues to trigger the fallback. Fully retired once
   * single-core 60 Hz reactance ships.
   */
  | 'W-REACTANCE-60HZ-DEFERRED'
  /**
   * Added in Stage 5B-IMP-INFRA (engine 0.8.0). Still live post-5B-IMP
   * (engine 0.9.0) for combinations without a native 60 Hz bundle.
   *
   * Emitted when the circuit is evaluated at `frequencyHz: 60` and no
   * 60 Hz impedance dataset is bundled for the requested
   * (conductorMaterial, cableType). The engine falls back to the 50 Hz
   * resistance rows for the same material/cableType/insulation, on the
   * physical basis that R is effectively frequency-independent for LV
   * conductor CSA ≤ 300 mm² (skin and proximity effects < 1%). This is
   * the direct dual of the IEC 60364-5-52:2009 Annex B 50/60 Hz
   * ampacity equivalence clause already invoked at Stage 5B-AMP.
   *
   * After 5B-IMP (0.9.0), multicore Cu/Al carry native 60 Hz bundles
   * (R replicated, X = 1.2 · X50) and never emit this warning. Retired
   * fully once single-core 60 Hz resistance ships.
   */
  | 'W-RESISTANCE-50HZ-USED-AT-60HZ'
  /**
   * Added in Stage 5C (engine 0.10.0).
   *
   * Informational marker emitted once per request when
   * `projectPolicy.resistanceModel === 'temperature_corrected'` and the
   * voltage-drop scan applied the IEC 60287-1-1 linear-α temperature
   * correction to R. Signals that the R value used for Vdrop differs
   * from the bundled reference-temperature value — consumers reading
   * `cableR_atOperatingTemp_ohm_per_km` and `operatingTempC` need this
   * context.
   *
   * Never fires when `resistanceModel === 'fixed_reference'`.
   */
  | 'W-TEMP-CORRECTION-APPLIED'
  /**
   * Added in Stage 5C (engine 0.10.0).
   *
   * Emitted when the voltage-drop scan encountered a csa at which
   * IB > IZ, i.e. the conductor would be thermally overloaded. The
   * loading ratio (IB / IZ)² is clamped to 1.0 for the temperature
   * estimate (θ_op = θ_max) so R correction stays bounded; the csa
   * itself is rejected by the existing IZ recheck anyway. Surfaced so
   * hosts can explain why a small csa that looked size-feasible on
   * ΔU% alone is not the final recommendation.
   *
   * Never fires when `resistanceModel === 'fixed_reference'`.
   */
  | 'W-TEMP-CORRECTION-CAPPED'
  // ── MV (22.9kV Korean distribution) extension ──────────────────
  | 'W-MV-DEFAULT-APPLIED'
  | 'W-MV-IB-OVERRIDE'
  | 'W-MV-LOOKUP-SAFE-SIDE'
  | 'W-MV-CHARGING-IGNORED'
  | 'W-MV-CHARGING-APPLIED'
  | 'W-MV-CHARGING-CONSERVATIVE'
  | 'W-MV-CAPACITANCE-OVERRIDE'
  | 'W-MV-AMBIENT-DEFAULT'
  | 'W-MV-SCREEN-AUTO-FILLED'
  | 'W-MV-SCREEN-OVERRIDE'
  | 'W-MV-SCREEN-INCOMPLETE'
  | 'W-MV-PROTECTION-DISCLAIMER';

// ─────────────────────────────────────────────────────────────────────
// Dataset shape (matches iec60364_lv_v1 on disk)
// ─────────────────────────────────────────────────────────────────────

export interface DatasetMeta {
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
  approvedBy: string | null;
  status: string;
}

export interface StandardSizes {
  id: string;
  sizesMm2: number[];
}

export interface AmpacityRow {
  csaMm2: number;
  ampacityA: number;
}

export interface AmpacityTable {
  description: string;
  rows: AmpacityRow[];
}

export interface AmpacityDataset {
  id: string;
  conductorMaterial: ConductorMaterial;
  insulationType: InsulationType;
  loadedConductors: number;
  cableType: CableType;
  frequencyHz: FrequencyHz;
  unit: 'A';
  sourceRef: string;
  tables: Record<string, AmpacityTable>;
}

export interface AmbientCorrectionRow {
  ambientTempC: number;
  factor: number;
}

export interface AmbientAirDataset {
  id: string;
  environment: 'air';
  baseTemperatureC: number;
  sourceRef: string;
  tables: Record<
    InsulationType,
    {
      maxOperatingTempC?: number;
      rows: AmbientCorrectionRow[];
    }
  >;
}

export interface AmbientGroundDataset {
  id: string;
  environment: 'ground';
  baseTemperatureC: number;
  sourceRef: string;
  tables: Record<
    InsulationType,
    {
      rows: AmbientCorrectionRow[];
    }
  >;
}

export interface SoilRow {
  soilResistivityK_m_W: number;
  factor: number;
}

export interface SoilResistivityDataset {
  id: string;
  baseSoilResistivityK_m_W: number;
  sourceRef: string;
  tables: Record<string, { description: string; rows: SoilRow[] }>;
}

export interface GroupingRow {
  groupCount: number;
  factor: number;
}

export interface GroupingDataset {
  id: string;
  sourceRef: string;
  tables: Record<string, { description: string; rows: GroupingRow[] }>;
}

export interface ImpedanceRow {
  csaMm2: number;
  value: number;
}

export interface ImpedanceDataset {
  id: string;
  conductorMaterial: ConductorMaterial;
  cableType: CableType;
  frequencyHz: FrequencyHz;
  sourceRef: string;
  resistance: Record<
    InsulationType,
    {
      temperatureBasisC: number;
      unit: 'ohm_per_km';
      rows: ImpedanceRow[];
    }
  >;
  reactance: Record<
    InsulationType,
    {
      unit: 'ohm_per_km';
      note?: string;
      rows: ImpedanceRow[];
    }
  >;
}

export interface KValueEntry {
  conductorMaterial: ConductorMaterial;
  insulationType: InsulationType;
  kValue: number;
  initialTempC: number;
  finalTempC: number;
}

export interface KValuesDataset {
  id: string;
  sourceRef: string;
  values: KValueEntry[];
}

/**
 * Stage 5C — temperature coefficient of resistance (α) at the reference
 * temperature, per conductor material.
 *
 * Applied in the voltage-drop scan only when
 * `projectPolicy.resistanceModel === 'temperature_corrected'`. Formula:
 *
 *   R(θ_op) = R(θ_ref) · [1 + α·(θ_op − referenceTempC)]
 *                       / [1 + α·(θ_ref − referenceTempC)]
 *
 * where `referenceTempC` is the temperature at which α is tabulated
 * (20 °C per IEC 60228), θ_ref is the insulation's rated conductor
 * temperature (PVC = 70 °C, XLPE = 90 °C), and θ_op is the estimated
 * operating temperature.
 */
export interface AlphaCoefficientEntry {
  conductorMaterial: ConductorMaterial;
  alphaPerK: number;
}

export interface AlphaCoefficientsDataset {
  id: string;
  sourceRef: string;
  /** Temperature (°C) at which α is tabulated. IEC 60228 value: 20 °C. */
  referenceTempC: number;
  /** Units of α. Always `'per_K'` for IEC values. */
  unit: 'per_K';
  values: AlphaCoefficientEntry[];
}

export interface Dataset {
  meta: DatasetMeta;
  standardSizes: StandardSizes;
  /** All bundled ampacity datasets. Stage 3: Cu/PVC, Cu/XLPE, Al/PVC, Al/XLPE (all 3-loaded, multicore, 50 Hz). */
  ampacity: {
    datasets: AmpacityDataset[];
    /** Back-compat: direct reference to the original Cu/PVC dataset. */
    cuPvc3Loaded50: AmpacityDataset;
  };
  corrections: {
    ambientAir: AmbientAirDataset;
    ambientGround: AmbientGroundDataset;
    soilResistivity: SoilResistivityDataset;
    grouping: GroupingDataset;
  };
  /** All bundled impedance datasets. Stage 3: Cu and Al, both multicore 50 Hz. */
  impedance: {
    datasets: ImpedanceDataset[];
    /** Back-compat: Cu/multicore/50Hz direct reference. */
    cuMulticore50: ImpedanceDataset;
  };
  shortCircuit: { kValues: KValuesDataset };
  /**
   * Stage 5C (engine 0.10.0). Temperature coefficient of resistance
   * bundle, used only when `projectPolicy.resistanceModel ===
   * 'temperature_corrected'`. Present in every loaded dataset; fixed_reference
   * mode ignores it.
   */
  physics: {
    alphaCoefficients: AlphaCoefficientsDataset;
  };
}
