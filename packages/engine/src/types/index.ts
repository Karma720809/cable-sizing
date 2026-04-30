/**
 * Core types for @cable-sizing/engine
 *
 * Aligns with PRD v2.3 FINAL:
 *   §7  CircuitInput
 *   §12 SizingResult / AuditStep / Warning / EngineError
 *   §16 Error/Warning codes
 *
 * Also re-exports FieldState model from ./field-state.ts (LV v1.3 / Stage A).
 */

export type {
  FieldSource,
  FieldStatus,
  FieldReason,
  FieldState,
  DerivedFieldRecord,
  InfoCode,
  InfoMessage,
} from './field-state.js';
export { FieldStateBuilder } from './field-state.js';

import type {
  FieldState,
  DerivedFieldRecord,
  InfoMessage,
} from './field-state.js';

// ─────────────────────────────────────────────────────────────────────
// Input
// ─────────────────────────────────────────────────────────────────────

/**
 * 4-bus topology classification used by the v1.3 loadedConductors
 * derivation table. Optional in CircuitInput — when omitted, the
 * engine continues to use {@link CircuitInput.system.phase} as before.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §6.2.
 */
export type Topology = '1ph2w' | '1ph3w' | '3ph3w' | '3ph4w';

export type LoadType = 'general' | 'motor' | 'heater' | 'lighting' | 'transformer';
export type Phase = 1 | 3;
export type FrequencyHz = 50 | 60;

export type ConductorMaterial = 'Cu' | 'Al';
export type InsulationType = 'PVC' | 'XLPE';
export type CoreConfiguration = '2C' | '3C' | '4C' | '3C+N';
export type CableType = 'multicore' | 'single-core';

/** IEC 60364-5-52 reference installation methods (MVP subset available in dataset). */
export type ReferenceMethod = 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D1' | 'D2' | 'E' | 'F' | 'G';

export type ProtectiveDevice = 'MCB' | 'MCCB' | 'Fuse' | 'UserDefined';

/**
 * v1.3 (Stage B): armour cladding for armoured LV cables. When unset or
 * 'none', armour processing is skipped. SWA = Steel Wire Armour, STA =
 * Steel Tape Armour. Stage B ships the SWA dataset (BS 5467 placeholder);
 * STA is reserved for a later dataset addition.
 */
export type ArmourType = 'SWA' | 'STA' | 'none';

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
    /**
     * v1.3 Stage B: motor full-load amperes (FLA). When `type === 'motor'`
     * and `fla` is present, the design-current derivation uses FLA · df
     * directly instead of the powerKW formula (CR-OQ-1).
     */
    fla?: number | null;
    /**
     * v1.3 Stage B: transformer kVA rating. When `type === 'transformer'`
     * the derivation uses IB = (kVA·1000) / (√3·V) · df (3-phase) or
     * IB = (kVA·1000) / V · df (1-phase). powerKW/cosφ/η are ignored.
     */
    kva?: number | null;
  };
  system: {
    voltageV: number;
    phase: Phase;
    frequencyHz: FrequencyHz;
    /**
     * v1.3 (Stage A, optional): 4-bus topology used by the loadedConductors
     * derivation table. When provided, takes precedence over `phase` in the
     * Stage B `loadedConductors` derivation (Stage A: ignored, additive).
     * When absent, the existing `phase` field remains authoritative — keeps
     * all 12 LV golden cases byte-equivalent.
     */
    topology?: Topology;
  };
  cable: {
    conductorMaterial: ConductorMaterial;
    insulationType: InsulationType;
    coreConfiguration: CoreConfiguration;
    cableType: CableType;
    /**
     * v1.3 Stage B (optional): SWA / STA armour type. Unset or 'none'
     * skips armour processing. When 'SWA' or 'STA', the pipeline runs
     * an armour CSA lookup + short-circuit verification.
     */
    armourType?: ArmourType;
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

  /**
   * v1.3 (Stage A, optional): explicit user overrides for fields the engine
   * normally derives. Stage B will read this and emit W-CR-001 / W-CR-005 /
   * W-CR-004 when overrides are applied. Stage A: schema-only, no behavior.
   *
   * Coexists with the legacy `load.designCurrentOverrideA` field — Stage B
   * will define precedence (overrides > legacy → emit deprecation W-CR-006).
   *
   * Spec: §6.1, §6.2, §6.7; Implementation_Spec_LV_v2.0 §2.2.
   */
  overrides?: {
    designCurrent?: number;
    loadedConductors?: number;
    armourCsaMm2?: number;
  };

  /**
   * v1.3 (Stage A, optional): "neutral carries current" toggle for
   * unbalanced / single-phase-on-3φ4w loads. Stage B's loadedConductors
   * derivation flips 3 → 4 when this is true on a 3ph4w topology, and
   * 2 → 3 on 1ph3w. Stage A: ignored.
   *
   * Spec: §6.2 (CR-OQ-3).
   */
  neutralCarriesCurrent?: boolean;

  /**
   * v1.3 migration namespace — quarantined from regular CircuitInput
   * fields. New user-authored inputs MUST NOT populate this; it is
   * reserved for v1.x → v1.5 project migration (see migration/*).
   *
   * Spec: §12.3 Patch-1.
   */
  _migration?: {
    recalculateLegacyCorrectionFactors?: boolean;
    legacyCorrectionFactors?: {
      k1?: number;
      k2?: number;
      k3?: number;
      kTotal?: number;
    };
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
  /**
   * v1.3 sidecar (Stage A, optional). Map of `fieldId → FieldState` for
   * every derived value the pipeline chose to record. UI consumers
   * render this via DerivedFieldDisplay; pre-v1.3 consumers ignore it.
   *
   * Stage A: never populated (additive contract only).
   * Stage B: populated by derivation/* modules.
   *
   * Worker envelope outer shape unchanged — Adjustment-3 satisfied by
   * extending SizingResult, which is already nested inside `data.result`.
   */
  fieldStates?: Record<string, FieldState>;
  /**
   * v1.3 informational message channel (Stage A, optional). Severity
   * lower than Warning; used for non-blocking observations such as
   * I-CR-001 (neutral-carries-current promoted loadedConductors).
   * Stage A: never populated.
   */
  info?: InfoMessage[];
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
  | 'armour'
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
  /**
   * v1.3 (Stage A, optional). Per-step provenance records for derived
   * values produced by this step. Lets UI panels render "📊 R = 0.193
   * Ω/km (auto_dataset · iec60364_lv_v1.impedance.cuMulticore50)"
   * without scraping the `intermediateValues` map.
   *
   * Stage A: never populated. Stage B: derivation modules emit this.
   */
  derivedFields?: DerivedFieldRecord[];
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
  | 'E-VAL-011' // shortCircuitKA provided but <= 0
  | 'E-VAL-012' // tripTimeS provided but <= 0
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
  // ── LV v1.3 input-automation (Stage A: declared, Stage B: emitted) ──
  /**
   * Soil resistivity is a required input for underground installation
   * methods (CR-OQ-5, "구분 정책"). Distinct from the legacy E-VAL-003
   * which fires during structural validation; E-CR-101 is emitted by
   * the v1.3 derivation step and carries the FieldState reason
   * `missing_input`.
   */
  | 'E-CR-101'
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
  | 'W-MV-PROTECTION-DISCLAIMER'
  // ── LV v1.3 input-automation (Stage A: declared, Stage B: emitted) ──
  /** Manual override applied to design current I_B (CR-OQ-1). */
  | 'W-CR-001'
  /** Ambient temperature not provided; default 30°C applied (CR-OQ-5). */
  | 'W-CR-002'
  /** Burial depth not provided; default 0.7 m applied (CR-OQ-5). */
  | 'W-CR-003'
  /** Manual override applied to armour CSA (CR-OQ-7). */
  | 'W-CR-004'
  /** Manual override applied to loadedConductors (CR-OQ-3). */
  | 'W-CR-005'
  /**
   * Legacy `load.designCurrentOverrideA` is set; new code should use
   * `overrides.designCurrent` instead. Both are honoured for one
   * release window during the v1.3 migration.
   */
  | 'W-CR-006'
  /**
   * Armour CSA short-circuit verification failed (selected armour
   * cannot withstand the fault current for the cleared time).
   */
  | 'W-CR-007'
  /**
   * loadedConductors derivation produced 4 (3-phase 4-wire with
   * neutral carrying current); ampacity dataset only has 2-/3-loaded
   * tables, so 3-loaded was used. Harmonic / 4-loaded derating
   * (k4) is explicitly out of scope per §6.2 (CR-OQ-3).
   */
  | 'W-CR-008'
  /**
   * Armour was selected but armour CSA / k_armour could not be resolved,
   * so armour short-circuit verification was not evaluated.
   */
  | 'W-CR-009';

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
 * v1.3 Stage B — armour CSA dataset for armoured LV cables.
 *
 * Each entry maps a `(cableConstruction, conductorCsaMm2)` key to the
 * armour cross-sectional area (mm²). `kArmour` is per-dataset (constant
 * for SWA, constant for STA) per IEC 60364-5-54 Annex A.
 *
 * Stage B ships the SWA bundle with BS 5467 placeholder values; the
 * dataset's `meta.status` is `'draft'` until validated against an
 * authoritative source.
 */
export interface ArmourEntry {
  cableConstruction: string;
  conductorCsaMm2: number;
  armourCsaMm2: number;
}

export interface ArmourDataset {
  schemaVersion: string;
  datasetId: string;
  sourceRef: string;
  status: 'draft' | 'approved';
  armourType: 'SWA' | 'STA';
  /** k value applied to armour SC verification (steel ≈ 51, IEC 60364-5-54 A.54.6). */
  kArmour: number;
  entries: ArmourEntry[];
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
   * v1.3 Stage B (optional). Bundled armour CSA tables. Currently SWA
   * only (BS 5467 placeholder, status='draft'); STA reserved.
   */
  armour?: {
    swa?: ArmourDataset;
    sta?: ArmourDataset;
  };
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
