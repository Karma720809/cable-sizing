/**
 * CircuitForm — sectioned form with progressive disclosure (App-MVP-1
 * + LV v1.3 Stage C).
 *
 * Stage C surfaces the FieldState sidecar emitted by the engine: when a
 * recent SizingResult is available, the form renders DerivedFieldDisplay
 * rows for designCurrent / loadedConductors / armourCsa next to the
 * inputs that drive them. The form remains "dumb" — it produces a plain
 * object via buildCircuitInput, which is the single source of truth for
 * validation.
 *
 * Backwards-compatible additions to FormState:
 *   - topology, neutralCarriesCurrent
 *   - fla, kva (load), armourType (cable)
 *   - useLoadedConductorsOverride/loadedConductorsOverride
 *   - useArmourOverride/armourCsaOverride
 *   - showAllReferenceMethods
 * Existing fields keep their original meaning so the smoke test and the
 * ResultPanel DOM tests remain unchanged.
 */
import React from 'react';
import { DEFAULT_INPUT, DEFAULT_MV_INPUT } from '../state/defaultInput.js';
import type { SizingResult } from '@cable-sizing/engine';
import { DerivedFieldDisplay } from './circuit/DerivedFieldDisplay.js';
import { LoadInputFields } from './circuit/LoadInputFields.js';
import { NeutralLoadToggle } from './circuit/NeutralLoadToggle.js';
import { OverrideToggle } from './circuit/OverrideToggle.js';
import {
  ReferenceMethodSelector,
  type ReferenceMethodCode,
} from './circuit/ReferenceMethodSelector.js';

// ─── FormState ─────────────────────────────────────────────────────────

export type VoltageClass = 'LV' | 'MV';
export type Topology = '1ph2w' | '1ph3w' | '3ph3w' | '3ph4w';

export interface FormState {
  voltageClass: VoltageClass;

  // ── MV-specific (22.9kV CNCV-W) ────────────────────────────────
  mvLoadType: 'general' | 'motor' | 'transformer';
  mvApparentPowerMVA: number;
  mvPowerKW: number;
  mvPowerFactor: number;
  mvEfficiency: number;
  mvDemandFactor: number;
  mvUseDesignCurrentOverride: boolean;
  mvDesignCurrentOverrideA: number;

  mvCableType: 'CNCV-W' | 'TR-CNCV-W' | 'FR-CNCO-W';
  mvUseScreenOverride: boolean;
  mvScreenCsaMm2: number;
  mvUseCapacitanceOverride: boolean;
  mvCapacitanceUFPerKm: number;

  mvInstallationMethod: 'direct_buried' | 'duct_bank' | 'trough' | 'tunnel';
  mvFormation: 'trefoil' | 'flat_touching' | 'flat_spaced';
  mvFlatSpacingMm: number;
  mvSoilResistivityK_m_W: number;
  mvBurialDepthM: number;
  mvGroupCount: number;
  mvAmbientTempC: number;

  mvProtectionDevice: 'VCB' | 'Fuse' | 'Recloser';
  mvRatedCurrentA: number;
  mvBreakingKA: number;
  mvTripTimeS: number;
  mvShortCircuitKA: number;
  mvUseEarthFault: boolean;
  mvEarthFaultKA: number;
  mvEarthFaultTimeS: number;

  mvLengthM: number;
  mvMaxVoltageDropPercent: number;
  mvVerifyScreen: boolean;
  mvChargingCurrentThreshold: number;

  // Load (LV) — v1.3: load type now also covers 'transformer'
  loadType: 'general' | 'motor' | 'heater' | 'lighting' | 'transformer';
  powerKW: number;
  /** Motor full-load amps (CR-OQ-1, motor only). */
  fla: number;
  /** Transformer apparent power (CR-OQ-1, transformer only). */
  kva: number;
  powerFactor: number;
  efficiency: number;
  demandFactor: number;
  useDesignCurrentOverride: boolean;
  designCurrentOverrideA: number;

  // System
  voltageV: number;
  phase: 1 | 3;
  frequencyHz: 50 | 60;
  /** v1.3: bus topology drives loadedConductors derivation (CR-OQ-3). */
  topology: Topology;
  /** v1.3: neutral-carries-current toggle (CR-OQ-3). */
  neutralCarriesCurrent: boolean;

  // Cable
  conductorMaterial: 'Cu' | 'Al';
  insulationType: 'PVC' | 'XLPE';
  cableType: 'multicore' | 'single-core';
  coreConfiguration: '2C' | '3C' | '4C' | '3C+N';
  /** v1.3 Stage B: optional armoured-cable hint. */
  armourType: 'SWA' | 'STA' | 'none';

  // Installation
  methodCode: ReferenceMethodCode;
  showAllReferenceMethods: boolean;
  ambientTempC: number;
  groupCount: number;
  soilResistivityK_m_W: number;

  // Route
  lengthM: number;

  // Protection
  deviceType: 'MCB' | 'MCCB' | 'Fuse' | 'UserDefined';
  ratedCurrentA: number;
  useI2Override: boolean;
  operatingCurrentI2A: number;
  tripTimeS: number;
  shortCircuitKA: number;

  // Policy
  maxVoltageDropPercent: number;
  useReactance: boolean;
  ignoreReactanceBelowMm2: number;
  resistanceModel: 'fixed_reference' | 'temperature_corrected';

  // v1.3 — additional auto-field overrides (CR-OQ-3, CR-OQ-7)
  useLoadedConductorsOverride: boolean;
  loadedConductorsOverride: number;
  useArmourOverride: boolean;
  armourCsaOverride: number;
}

export const INITIAL_FORM: FormState = {
  voltageClass: 'LV',

  // MV defaults — TC-01 baseline
  mvLoadType: DEFAULT_MV_INPUT.load.type,
  mvApparentPowerMVA: DEFAULT_MV_INPUT.load.apparentPowerMVA ?? 1.0,
  mvPowerKW: 750,
  mvPowerFactor: 0.85,
  mvEfficiency: 0.9,
  mvDemandFactor: 1.0,
  mvUseDesignCurrentOverride: false,
  mvDesignCurrentOverrideA: 0,

  mvCableType: DEFAULT_MV_INPUT.cable.cableType,
  mvUseScreenOverride: false,
  mvScreenCsaMm2: 35,
  mvUseCapacitanceOverride: false,
  mvCapacitanceUFPerKm: 0.3,

  mvInstallationMethod: DEFAULT_MV_INPUT.installation.method,
  mvFormation: DEFAULT_MV_INPUT.installation.formation,
  mvFlatSpacingMm: 100,
  mvSoilResistivityK_m_W: DEFAULT_MV_INPUT.installation.soilResistivityK_m_W,
  mvBurialDepthM: DEFAULT_MV_INPUT.installation.burialDepthM,
  mvGroupCount: DEFAULT_MV_INPUT.installation.groupCount,
  mvAmbientTempC: DEFAULT_MV_INPUT.installation.ambientTempC,

  mvProtectionDevice: DEFAULT_MV_INPUT.protection.deviceType,
  mvRatedCurrentA: DEFAULT_MV_INPUT.protection.ratedCurrentA,
  mvBreakingKA: DEFAULT_MV_INPUT.protection.breakingKA,
  mvTripTimeS: DEFAULT_MV_INPUT.protection.tripTimeS,
  mvShortCircuitKA: DEFAULT_MV_INPUT.protection.shortCircuitKA,
  mvUseEarthFault: false,
  mvEarthFaultKA: 5,
  mvEarthFaultTimeS: 0.5,

  mvLengthM: DEFAULT_MV_INPUT.route.lengthM,
  mvMaxVoltageDropPercent: DEFAULT_MV_INPUT.projectPolicy.maxVoltageDropPercent,
  mvVerifyScreen: DEFAULT_MV_INPUT.projectPolicy.verifyScreen,
  mvChargingCurrentThreshold: DEFAULT_MV_INPUT.projectPolicy.chargingCurrentThreshold,

  loadType: DEFAULT_INPUT.load.type as FormState['loadType'],
  powerKW: DEFAULT_INPUT.load.powerKW,
  fla: 50,
  kva: 250,
  powerFactor: DEFAULT_INPUT.load.powerFactor,
  efficiency: DEFAULT_INPUT.load.efficiency,
  demandFactor: DEFAULT_INPUT.load.demandFactor,
  useDesignCurrentOverride: false,
  designCurrentOverrideA: 0,

  voltageV: DEFAULT_INPUT.system.voltageV,
  phase: DEFAULT_INPUT.system.phase,
  frequencyHz: DEFAULT_INPUT.system.frequencyHz,
  topology: '3ph4w',
  neutralCarriesCurrent: false,

  conductorMaterial: DEFAULT_INPUT.cable.conductorMaterial,
  insulationType: DEFAULT_INPUT.cable.insulationType,
  cableType: DEFAULT_INPUT.cable.cableType,
  coreConfiguration: DEFAULT_INPUT.cable.coreConfiguration,
  armourType: 'none',

  methodCode: DEFAULT_INPUT.installation.methodCode as ReferenceMethodCode,
  showAllReferenceMethods: false,
  ambientTempC: DEFAULT_INPUT.installation.ambientTempC,
  groupCount: DEFAULT_INPUT.installation.groupCount,
  soilResistivityK_m_W: 1.0,

  lengthM: DEFAULT_INPUT.route.lengthM,

  deviceType: DEFAULT_INPUT.protection.deviceType,
  ratedCurrentA: DEFAULT_INPUT.protection.ratedCurrentA,
  useI2Override: false,
  operatingCurrentI2A: DEFAULT_INPUT.protection.operatingCurrentI2A,
  tripTimeS: DEFAULT_INPUT.protection.tripTimeS,
  shortCircuitKA: DEFAULT_INPUT.protection.shortCircuitKA,

  maxVoltageDropPercent: DEFAULT_INPUT.projectPolicy.maxVoltageDropPercent,
  useReactance: DEFAULT_INPUT.projectPolicy.useReactance,
  ignoreReactanceBelowMm2: 16,
  resistanceModel: DEFAULT_INPUT.projectPolicy.resistanceModel,

  useLoadedConductorsOverride: false,
  loadedConductorsOverride: 3,
  useArmourOverride: false,
  armourCsaOverride: 50,
};

// ─── Form → MvCircuitInput ─────────────────────────────────────────────

/** Assemble a raw MvCircuitInput from the form state. */
export function buildMvCircuitInput(f: FormState): unknown {
  const mvLoadOverride = f.mvUseDesignCurrentOverride
    ? { designCurrentOverrideA: f.mvDesignCurrentOverrideA }
    : {};

  const isTransformer = f.mvLoadType === 'transformer';

  return {
    load: {
      type: f.mvLoadType,
      powerKW: isTransformer ? null : f.mvPowerKW,
      apparentPowerMVA: isTransformer ? f.mvApparentPowerMVA : null,
      powerFactor: isTransformer ? null : f.mvPowerFactor,
      efficiency: isTransformer ? null : f.mvEfficiency,
      demandFactor: isTransformer ? null : f.mvDemandFactor,
      ...mvLoadOverride,
    },
    system: { voltageV: 22900, lineToGroundV: 13200, phase: 3, frequencyHz: 60 },
    cable: {
      cableType: f.mvCableType,
      screenCsaMm2: f.mvUseScreenOverride ? f.mvScreenCsaMm2 : null,
      capacitanceUFPerKm: f.mvUseCapacitanceOverride ? f.mvCapacitanceUFPerKm : null,
    },
    installation: {
      method: f.mvInstallationMethod,
      formation: f.mvFormation,
      flatSpacingMm: f.mvFormation === 'flat_spaced' ? f.mvFlatSpacingMm : null,
      soilResistivityK_m_W: f.mvSoilResistivityK_m_W,
      burialDepthM: f.mvBurialDepthM,
      groupCount: f.mvGroupCount,
      ambientTempC: f.mvAmbientTempC,
    },
    protection: {
      deviceType: f.mvProtectionDevice,
      ratedCurrentA: f.mvRatedCurrentA,
      breakingKA: f.mvBreakingKA,
      tripTimeS: f.mvTripTimeS,
      shortCircuitKA: f.mvShortCircuitKA,
      earthFaultKA: f.mvUseEarthFault ? f.mvEarthFaultKA : null,
      earthFaultTimeS: f.mvUseEarthFault ? f.mvEarthFaultTimeS : null,
    },
    route: { lengthM: f.mvLengthM },
    projectPolicy: {
      maxVoltageDropPercent: f.mvMaxVoltageDropPercent,
      verifyScreen: f.mvVerifyScreen,
      chargingCurrentThreshold: f.mvChargingCurrentThreshold,
    },
  };
}

// ─── Form → CircuitInput ───────────────────────────────────────────────

/** Assemble a raw CircuitInput from the form state. */
export function buildCircuitInput(f: FormState): unknown {
  const coreConfiguration = f.coreConfiguration;

  // CR-OQ-1: route load-type-specific fields into the load envelope.
  // Engine reads load.fla for motor, load.kva for transformer, falls
  // back to powerKW path otherwise.
  const isMotor = f.loadType === 'motor';
  const isTransformer = f.loadType === 'transformer';
  const loadExtras: Record<string, unknown> = {};
  if (isMotor) loadExtras.fla = f.fla;
  if (isTransformer) loadExtras.kva = f.kva;

  const i2 = f.useI2Override
    ? f.operatingCurrentI2A
    : f.ratedCurrentA * 1.45; // rule of thumb for MCBs; user can override.

  const installation: Record<string, unknown> = {
    methodCode: f.methodCode,
    ambientTempC: f.ambientTempC,
    groupCount: f.groupCount,
    soilResistivityK_m_W:
      f.methodCode === 'D1' || f.methodCode === 'D2' ? f.soilResistivityK_m_W : null,
  };

  // Coerce topology to match the active phase. The form's onChange path
  // already snaps these together, but external mutations (e.g. test
  // fixtures that flip `phase` directly) need the same guarantee so the
  // engine's loadedConductors derivation reflects the user-visible phase.
  let topology: Topology = f.topology;
  if (f.phase === 1 && (topology === '3ph3w' || topology === '3ph4w')) {
    topology = '1ph2w';
  } else if (f.phase === 3 && (topology === '1ph2w' || topology === '1ph3w')) {
    topology = '3ph4w';
  }

  // v1.3 — overrides envelope (CR-OQ-1, CR-OQ-3, CR-OQ-7).
  const overrides: Record<string, unknown> = {};
  if (f.useDesignCurrentOverride) overrides.designCurrent = f.designCurrentOverrideA;
  if (f.useLoadedConductorsOverride) overrides.loadedConductors = f.loadedConductorsOverride;
  if (f.useArmourOverride) overrides.armourCsaMm2 = f.armourCsaOverride;

  const cable: Record<string, unknown> = {
    conductorMaterial: f.conductorMaterial,
    insulationType: f.insulationType,
    coreConfiguration,
    cableType: f.cableType,
  };
  if (f.armourType !== 'none') cable.armourType = f.armourType;

  return {
    load: {
      type: f.loadType,
      powerKW: isTransformer ? null : f.powerKW,
      powerFactor: f.powerFactor,
      efficiency: f.efficiency,
      demandFactor: f.demandFactor,
      ...loadExtras,
    },
    system: {
      voltageV: f.voltageV,
      phase: f.phase,
      frequencyHz: f.frequencyHz,
      topology,
    },
    cable,
    installation,
    route: { lengthM: f.lengthM },
    protection: {
      deviceType: f.deviceType,
      ratedCurrentA: f.ratedCurrentA,
      operatingCurrentI2A: i2,
      tripTimeS: f.tripTimeS,
      shortCircuitKA: f.shortCircuitKA,
    },
    projectPolicy: {
      maxVoltageDropPercent: f.maxVoltageDropPercent,
      useReactance: f.useReactance,
      ignoreReactanceBelowMm2: f.ignoreReactanceBelowMm2,
      resistanceModel: f.resistanceModel,
      roundingPolicy: 'next_standard_csa',
    },
    ...(Object.keys(overrides).length > 0 ? { overrides } : {}),
    ...(f.neutralCarriesCurrent ? { neutralCarriesCurrent: true } : {}),
  };
}

// ─── Component ────────────────────────────────────────────────────────

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  busy: boolean;
  /** Last successful sizing result — drives DerivedFieldDisplay rows. */
  result?: SizingResult | null;
}

export function CircuitForm({
  value,
  onChange,
  onSubmit,
  busy,
  result,
}: Props): React.ReactElement {
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    onChange({ ...value, [k]: v });

  return (
    <form
      className="form"
      aria-label="Circuit input"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {/* ─ Voltage class selector (top-level) ─ */}
      <fieldset>
        <legend>Voltage class</legend>
        <SelectField
          label="System"
          v={value.voltageClass}
          options={[
            ['LV', 'LV — IEC 60364-5-52 (≤ 1 kV)'],
            ['MV', 'MV — 22.9 kV CNCV-W (KEPCO ES 6145)'],
          ]}
          set={(s) => set('voltageClass', s as VoltageClass)}
        />
      </fieldset>

      {value.voltageClass === 'MV' ? (
        <MvFields value={value} set={set} />
      ) : (
        <LvFields value={value} set={set} result={result ?? null} />
      )}

      <button type="submit" disabled={busy}>
        {busy ? 'Sizing…' : 'Size cable'}
      </button>
    </form>
  );
}

interface SubFormProps {
  value: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
}

function LvFields({
  value,
  set,
  result,
}: SubFormProps & { result: SizingResult | null }): React.ReactElement {
  const designCurrentState = result?.fieldStates?.designCurrent;
  const loadedConductorsState = result?.fieldStates?.loadedConductors;
  const armourCsaState = result?.fieldStates?.armourCsa;

  const autoIBHint =
    designCurrentState && designCurrentState.value != null
      ? `${(designCurrentState.value as number).toFixed(2)} A`
      : undefined;
  const autoLcHint =
    loadedConductorsState && loadedConductorsState.value != null
      ? String(loadedConductorsState.value)
      : undefined;
  const autoArmourHint =
    armourCsaState && armourCsaState.value != null && typeof armourCsaState.value === 'object'
      ? `${(armourCsaState.value as { armourCsaMm2: number }).armourCsaMm2} mm²`
      : undefined;

  return (
    <>
      {/* ─ Load ─ */}
      <fieldset>
        <legend>Load</legend>
        <LoadInputFields
          values={{
            loadType: value.loadType,
            powerKW: value.powerKW,
            fla: value.fla,
            kva: value.kva,
          }}
          onChange={(patch) => {
            if (patch.loadType !== undefined) set('loadType', patch.loadType);
            if (patch.powerKW !== undefined) set('powerKW', patch.powerKW);
            if (patch.fla !== undefined) set('fla', patch.fla);
            if (patch.kva !== undefined) set('kva', patch.kva);
          }}
        />
        {value.loadType !== 'transformer' && (
          <NumField
            label="Power factor"
            v={value.powerFactor}
            step={0.01}
            set={(n) => set('powerFactor', n)}
          />
        )}
        {designCurrentState && (
          <DerivedFieldDisplay
            label="Design current (IB)"
            state={designCurrentState as never}
            unit="A"
          />
        )}
        <AdvancedGroup>
          {value.loadType !== 'transformer' && (
            <NumField
              label="Efficiency (η)"
              v={value.efficiency}
              step={0.01}
              set={(n) => set('efficiency', n)}
            />
          )}
          <NumField
            label="Demand factor"
            v={value.demandFactor}
            step={0.05}
            set={(n) => set('demandFactor', n)}
          />
          <OverrideToggle
            fieldId="designCurrent"
            label="Override design current (IB)"
            enabled={value.useDesignCurrentOverride}
            onToggle={(b) => set('useDesignCurrentOverride', b)}
            value={value.designCurrentOverrideA}
            onValueChange={(n) => set('designCurrentOverrideA', n)}
            unit="A"
            autoHint={autoIBHint}
          />
        </AdvancedGroup>
      </fieldset>

      {/* ─ System ─ */}
      <fieldset>
        <legend>System</legend>
        <NumField label="Voltage (V)" v={value.voltageV} set={(n) => set('voltageV', n)} />
        <SelectField
          label="Phase"
          v={String(value.phase)}
          options={[
            ['1', '1-phase'],
            ['3', '3-phase'],
          ]}
          set={(s) => {
            const p = Number(s) as 1 | 3;
            set('phase', p);
            // Keep topology coherent: snap to a sensible default when the
            // user flips the phase selector. They can pick a different
            // topology explicitly afterward.
            if (p === 1 && (value.topology === '3ph3w' || value.topology === '3ph4w')) {
              set('topology', '1ph2w');
            } else if (p === 3 && (value.topology === '1ph2w' || value.topology === '1ph3w')) {
              set('topology', '3ph4w');
            }
          }}
        />
        <SelectField
          label="Topology"
          v={value.topology}
          options={[
            ['1ph2w', '1ph 2-wire (L+N)'],
            ['1ph3w', '1ph 3-wire (split-phase)'],
            ['3ph3w', '3ph 3-wire (delta / no neutral)'],
            ['3ph4w', '3ph 4-wire (Y + N)'],
          ]}
          set={(s) => set('topology', s as Topology)}
        />
        <NeutralLoadToggle
          topology={value.topology}
          neutralCarriesCurrent={value.neutralCarriesCurrent}
          onChange={(b) => set('neutralCarriesCurrent', b)}
        />
        {loadedConductorsState && (
          <DerivedFieldDisplay
            label="Loaded conductors"
            state={loadedConductorsState as never}
          />
        )}
        <AdvancedGroup>
          <SelectField
            label="Frequency"
            v={String(value.frequencyHz)}
            options={[
              ['50', '50 Hz'],
              ['60', '60 Hz'],
            ]}
            set={(s) => set('frequencyHz', Number(s) as 50 | 60)}
          />
          <OverrideToggle
            fieldId="loadedConductors"
            label="Override loaded conductors"
            enabled={value.useLoadedConductorsOverride}
            onToggle={(b) => set('useLoadedConductorsOverride', b)}
            value={value.loadedConductorsOverride}
            onValueChange={(n) =>
              set('loadedConductorsOverride', Math.max(2, Math.round(n)))
            }
            step={1}
            min={2}
            autoHint={autoLcHint}
          />
        </AdvancedGroup>
      </fieldset>

      {/* ─ Cable ─ */}
      <fieldset>
        <legend>Cable</legend>
        <SelectField
          label="Conductor"
          v={value.conductorMaterial}
          options={[
            ['Cu', 'Copper'],
            ['Al', 'Aluminium'],
          ]}
          set={(s) => set('conductorMaterial', s as 'Cu' | 'Al')}
        />
        <SelectField
          label="Insulation"
          v={value.insulationType}
          options={[
            ['PVC', 'PVC (70 °C)'],
            ['XLPE', 'XLPE (90 °C)'],
          ]}
          set={(s) => set('insulationType', s as 'PVC' | 'XLPE')}
        />
        <SelectField
          label="Cable type"
          v={value.cableType}
          options={[
            ['multicore', 'Multicore'],
            ['single-core', 'Single-core'],
          ]}
          set={(s) => set('cableType', s as 'multicore' | 'single-core')}
        />
        <SelectField
          label="Armour"
          v={value.armourType}
          options={[
            ['none', 'None (un-armoured)'],
            ['SWA', 'SWA — steel wire'],
            ['STA', 'STA — steel tape'],
          ]}
          set={(s) => set('armourType', s as FormState['armourType'])}
        />
        {value.armourType !== 'none' && armourCsaState && (
          <DerivedFieldDisplay
            label="Armour CSA"
            state={armourCsaState as never}
            unit="mm²"
            formatter={(v) =>
              v && typeof v === 'object' && 'armourCsaMm2' in (v as object)
                ? String((v as { armourCsaMm2: number }).armourCsaMm2)
                : '—'
            }
          />
        )}
        <AdvancedGroup>
          <SelectField
            label="Core configuration"
            v={value.coreConfiguration}
            options={[
              ['2C', '2C (L + N)'],
              ['3C', '3C'],
              ['4C', '4C'],
              ['3C+N', '3C + N'],
            ]}
            set={(s) => set('coreConfiguration', s as FormState['coreConfiguration'])}
          />
          {value.armourType !== 'none' && (
            <OverrideToggle
              fieldId="armourCsaMm2"
              label="Override armour CSA"
              enabled={value.useArmourOverride}
              onToggle={(b) => set('useArmourOverride', b)}
              value={value.armourCsaOverride}
              onValueChange={(n) => set('armourCsaOverride', n)}
              unit="mm²"
              autoHint={autoArmourHint}
            />
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ Installation ─ */}
      <fieldset>
        <legend>Installation</legend>
        <ReferenceMethodSelector
          cableType={value.cableType}
          value={value.methodCode}
          onChange={(m) => set('methodCode', m)}
          showAll={value.showAllReferenceMethods}
          onToggleShowAll={(b) => set('showAllReferenceMethods', b)}
        />
        <NumField
          label="Ambient (°C)"
          v={value.ambientTempC}
          set={(n) => set('ambientTempC', n)}
        />
        <NumField
          label="Group count"
          v={value.groupCount}
          step={1}
          set={(n) => set('groupCount', Math.max(1, Math.round(n)))}
        />
        {(value.methodCode === 'D1' || value.methodCode === 'D2') && (
          <NumField
            label="Soil ρ (K·m/W)"
            v={value.soilResistivityK_m_W}
            step={0.1}
            set={(n) => set('soilResistivityK_m_W', n)}
          />
        )}
      </fieldset>

      {/* ─ Route ─ */}
      <fieldset>
        <legend>Route</legend>
        <NumField
          label="Length, one-way (m)"
          v={value.lengthM}
          set={(n) => set('lengthM', n)}
        />
      </fieldset>

      {/* ─ Protection ─ */}
      <fieldset>
        <legend>Protection</legend>
        <SelectField
          label="Device"
          v={value.deviceType}
          options={[
            ['MCB', 'MCB'],
            ['MCCB', 'MCCB'],
            ['Fuse', 'Fuse'],
            ['UserDefined', 'User-defined'],
          ]}
          set={(s) => set('deviceType', s as FormState['deviceType'])}
        />
        <NumField label="Rated In (A)" v={value.ratedCurrentA} set={(n) => set('ratedCurrentA', n)} />
        <NumField
          label="Isc (kA)"
          v={value.shortCircuitKA}
          step={0.1}
          set={(n) => set('shortCircuitKA', n)}
        />
        <NumField
          label="Trip time (s)"
          v={value.tripTimeS}
          step={0.01}
          set={(n) => set('tripTimeS', n)}
        />
        <AdvancedGroup>
          <CheckField
            label="Override I₂ (default: 1.45·In)"
            v={value.useI2Override}
            set={(b) => set('useI2Override', b)}
          />
          {value.useI2Override && (
            <NumField
              label="I₂ (A)"
              v={value.operatingCurrentI2A}
              set={(n) => set('operatingCurrentI2A', n)}
            />
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ Policy ─ */}
      <fieldset>
        <legend>Project policy</legend>
        <NumField
          label="Max ΔU (%)"
          v={value.maxVoltageDropPercent}
          step={0.1}
          set={(n) => set('maxVoltageDropPercent', n)}
        />
        <AdvancedGroup>
          <CheckField
            label="Include reactance (X)"
            v={value.useReactance}
            set={(b) => set('useReactance', b)}
          />
          {value.useReactance && (
            <NumField
              label="Ignore X below (mm²)"
              v={value.ignoreReactanceBelowMm2}
              step={1}
              set={(n) => set('ignoreReactanceBelowMm2', Math.max(0, Math.round(n)))}
            />
          )}
          <SelectField
            label="Resistance model"
            v={value.resistanceModel}
            options={[
              ['fixed_reference', 'Fixed @ rated temp'],
              ['temperature_corrected', 'Temperature-corrected (IEC 60287-1-1)'],
            ]}
            set={(s) => set('resistanceModel', s as FormState['resistanceModel'])}
          />
        </AdvancedGroup>
      </fieldset>
    </>
  );
}

function MvFields({ value, set }: SubFormProps): React.ReactElement {
  const isTransformer = value.mvLoadType === 'transformer';
  const isFlatSpaced = value.mvFormation === 'flat_spaced';
  const isBuried = value.mvInstallationMethod === 'direct_buried';

  return (
    <>
      {/* ─ MV Load ─ */}
      <fieldset>
        <legend>Load</legend>
        <SelectField
          label="Load type"
          v={value.mvLoadType}
          options={[
            ['transformer', 'Transformer (S in MVA)'],
            ['general', 'General'],
            ['motor', 'Motor'],
          ]}
          set={(s) => set('mvLoadType', s as FormState['mvLoadType'])}
        />
        {isTransformer ? (
          <NumField
            label="Apparent power (MVA)"
            v={value.mvApparentPowerMVA}
            step={0.1}
            set={(n) => set('mvApparentPowerMVA', n)}
          />
        ) : (
          <>
            <NumField label="Power (kW)" v={value.mvPowerKW} set={(n) => set('mvPowerKW', n)} />
            <NumField
              label="Power factor"
              v={value.mvPowerFactor}
              step={0.01}
              set={(n) => set('mvPowerFactor', n)}
            />
            <AdvancedGroup>
              <NumField
                label="Efficiency (η)"
                v={value.mvEfficiency}
                step={0.01}
                set={(n) => set('mvEfficiency', n)}
              />
              <NumField
                label="Demand factor"
                v={value.mvDemandFactor}
                step={0.05}
                set={(n) => set('mvDemandFactor', n)}
              />
            </AdvancedGroup>
          </>
        )}
        <AdvancedGroup>
          <CheckField
            label="Override design current (IB)"
            v={value.mvUseDesignCurrentOverride}
            set={(b) => set('mvUseDesignCurrentOverride', b)}
          />
          {value.mvUseDesignCurrentOverride && (
            <NumField
              label="IB override (A)"
              v={value.mvDesignCurrentOverrideA}
              set={(n) => set('mvDesignCurrentOverrideA', n)}
            />
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ MV System (read-only summary) ─ */}
      <fieldset>
        <legend>System (fixed)</legend>
        <div className="muted">22.9 kV-Y, 60 Hz, 3-phase, Cu/XLPE single-core.</div>
      </fieldset>

      {/* ─ MV Cable ─ */}
      <fieldset>
        <legend>Cable</legend>
        <SelectField
          label="Cable type"
          v={value.mvCableType}
          options={[
            ['CNCV-W', 'CNCV-W (water-blocked)'],
            ['TR-CNCV-W', 'TR-CNCV-W (tracking-resistant)'],
            ['FR-CNCO-W', 'FR-CNCO-W (flame-retardant, trough)'],
          ]}
          set={(s) => set('mvCableType', s as FormState['mvCableType'])}
        />
        <AdvancedGroup>
          <CheckField
            label="Override screen CSA"
            v={value.mvUseScreenOverride}
            set={(b) => set('mvUseScreenOverride', b)}
          />
          {value.mvUseScreenOverride && (
            <NumField
              label="Screen CSA (mm²)"
              v={value.mvScreenCsaMm2}
              set={(n) => set('mvScreenCsaMm2', n)}
            />
          )}
          <CheckField
            label="Override capacitance"
            v={value.mvUseCapacitanceOverride}
            set={(b) => set('mvUseCapacitanceOverride', b)}
          />
          {value.mvUseCapacitanceOverride && (
            <NumField
              label="C (μF/km)"
              v={value.mvCapacitanceUFPerKm}
              step={0.01}
              set={(n) => set('mvCapacitanceUFPerKm', n)}
            />
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ MV Installation ─ */}
      <fieldset>
        <legend>Installation</legend>
        <SelectField
          label="Method"
          v={value.mvInstallationMethod}
          options={[
            ['direct_buried', 'Direct buried (직매설)'],
            ['duct_bank', 'Duct bank (관로)'],
            ['trough', 'Trough (전력구)'],
            ['tunnel', 'Tunnel (공동구)'],
          ]}
          set={(s) => set('mvInstallationMethod', s as FormState['mvInstallationMethod'])}
        />
        <SelectField
          label="Formation"
          v={value.mvFormation}
          options={[
            ['trefoil', 'Trefoil'],
            ['flat_touching', 'Flat (touching)'],
            ['flat_spaced', 'Flat (spaced)'],
          ]}
          set={(s) => set('mvFormation', s as FormState['mvFormation'])}
        />
        {isFlatSpaced && (
          <NumField
            label="Spacing (mm)"
            v={value.mvFlatSpacingMm}
            step={10}
            set={(n) => set('mvFlatSpacingMm', n)}
          />
        )}
        <NumField label="Ground temp (°C)" v={value.mvAmbientTempC} set={(n) => set('mvAmbientTempC', n)} />
        <NumField
          label="Soil ρ (K·m/W)"
          v={value.mvSoilResistivityK_m_W}
          step={0.1}
          set={(n) => set('mvSoilResistivityK_m_W', n)}
        />
        {isBuried && (
          <NumField
            label="Burial depth (m)"
            v={value.mvBurialDepthM}
            step={0.1}
            set={(n) => set('mvBurialDepthM', n)}
          />
        )}
        <NumField
          label="Group count"
          v={value.mvGroupCount}
          step={1}
          set={(n) => set('mvGroupCount', Math.max(1, Math.round(n)))}
        />
      </fieldset>

      {/* ─ MV Route ─ */}
      <fieldset>
        <legend>Route</legend>
        <NumField label="Length, one-way (m)" v={value.mvLengthM} set={(n) => set('mvLengthM', n)} />
      </fieldset>

      {/* ─ MV Protection ─ */}
      <fieldset>
        <legend>Protection</legend>
        <SelectField
          label="Device"
          v={value.mvProtectionDevice}
          options={[
            ['VCB', 'VCB'],
            ['Fuse', 'Fuse'],
            ['Recloser', 'Recloser'],
          ]}
          set={(s) => set('mvProtectionDevice', s as FormState['mvProtectionDevice'])}
        />
        <NumField label="Rated In (A)" v={value.mvRatedCurrentA} set={(n) => set('mvRatedCurrentA', n)} />
        <NumField
          label="Breaking (kA)"
          v={value.mvBreakingKA}
          step={0.5}
          set={(n) => set('mvBreakingKA', n)}
        />
        <NumField
          label="Isc (kA)"
          v={value.mvShortCircuitKA}
          step={0.1}
          set={(n) => set('mvShortCircuitKA', n)}
        />
        <NumField
          label="Trip time (s)"
          v={value.mvTripTimeS}
          step={0.01}
          set={(n) => set('mvTripTimeS', n)}
        />
        <AdvancedGroup>
          <CheckField
            label="Verify screen against earth fault"
            v={value.mvUseEarthFault}
            set={(b) => set('mvUseEarthFault', b)}
          />
          {value.mvUseEarthFault && (
            <>
              <NumField
                label="Earth fault Ie (kA)"
                v={value.mvEarthFaultKA}
                step={0.1}
                set={(n) => set('mvEarthFaultKA', n)}
              />
              <NumField
                label="Earth fault t (s)"
                v={value.mvEarthFaultTimeS}
                step={0.01}
                set={(n) => set('mvEarthFaultTimeS', n)}
              />
            </>
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ MV Policy ─ */}
      <fieldset>
        <legend>Project policy</legend>
        <NumField
          label="Max ΔU (%)"
          v={value.mvMaxVoltageDropPercent}
          step={0.1}
          set={(n) => set('mvMaxVoltageDropPercent', n)}
        />
        <CheckField
          label="Verify screen"
          v={value.mvVerifyScreen}
          set={(b) => set('mvVerifyScreen', b)}
        />
        <AdvancedGroup>
          <NumField
            label="Charging current threshold (Ic/IB)"
            v={value.mvChargingCurrentThreshold}
            step={0.005}
            set={(n) => set('mvChargingCurrentThreshold', Math.max(0, n))}
          />
        </AdvancedGroup>
      </fieldset>
    </>
  );
}

// ─── Primitive fields ─────────────────────────────────────────────────

function NumField({
  label,
  v,
  set,
  step = 1,
}: {
  label: string;
  v: number;
  set: (n: number) => void;
  step?: number;
}): React.ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="number"
        step={step}
        value={v}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) set(n);
        }}
      />
    </label>
  );
}

function SelectField({
  label,
  v,
  options,
  set,
}: {
  label: string;
  v: string;
  options: ReadonlyArray<readonly [string, string]>;
  set: (s: string) => void;
}): React.ReactElement {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={v} onChange={(e) => set(e.target.value)}>
        {options.map(([val, text]) => (
          <option key={val} value={val}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}

function CheckField({
  label,
  v,
  set,
}: {
  label: string;
  v: boolean;
  set: (b: boolean) => void;
}): React.ReactElement {
  return (
    <label className="field field-check">
      <span>{label}</span>
      <input type="checkbox" checked={v} onChange={(e) => set(e.target.checked)} />
    </label>
  );
}

function AdvancedGroup({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <details className="advanced">
      <summary>Advanced</summary>
      <div className="advanced-body">{children}</div>
    </details>
  );
}
