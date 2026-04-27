/**
 * CircuitForm (App-MVP-1) — sectioned form with progressive disclosure.
 *
 * Covers the full `CircuitInput` surface of the engine's frozen worker
 * contract, organised into seven fieldsets that mirror the `CircuitInput`
 * shape. Advanced fields (efficiency, demand factor, reactance policy,
 * resistance model, I2 override, trip time, soil ρ, frequency…) live
 * inside a collapsed `<details>` section per group so the default view
 * stays short.
 *
 * The form remains deliberately "dumb": it produces a plain object and
 * hands it to the worker, which is the single source of truth for
 * validation. Nothing here is typed against `CircuitInput` at compile
 * time — that's the engine's job.
 */
import React from 'react';
import { DEFAULT_INPUT, DEFAULT_MV_INPUT } from '../state/defaultInput.js';

// ─── FormState ─────────────────────────────────────────────────────────

export type VoltageClass = 'LV' | 'MV';

export interface FormState {
  // Voltage class — switches the form between LV (IEC 60364-5-52) and
  // 22.9kV MV (KEPCO ES 6145). MV-specific fields are stored alongside LV
  // fields so the user can toggle without losing input.
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

  // Load (LV)
  loadType: 'general' | 'motor' | 'heater' | 'lighting';
  powerKW: number;
  powerFactor: number;
  efficiency: number;
  demandFactor: number;
  useDesignCurrentOverride: boolean;
  designCurrentOverrideA: number;

  // System
  voltageV: number;
  phase: 1 | 3;
  frequencyHz: 50 | 60;

  // Cable
  conductorMaterial: 'Cu' | 'Al';
  insulationType: 'PVC' | 'XLPE';
  cableType: 'multicore' | 'single-core';
  coreConfiguration: '2C' | '3C' | '4C' | '3C+N';

  // Installation
  methodCode: 'A1' | 'A2' | 'B1' | 'B2' | 'C' | 'D1' | 'D2' | 'E' | 'F' | 'G';
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

  loadType: DEFAULT_INPUT.load.type,
  powerKW: DEFAULT_INPUT.load.powerKW,
  powerFactor: DEFAULT_INPUT.load.powerFactor,
  efficiency: DEFAULT_INPUT.load.efficiency,
  demandFactor: DEFAULT_INPUT.load.demandFactor,
  useDesignCurrentOverride: false,
  designCurrentOverrideA: 0,

  voltageV: DEFAULT_INPUT.system.voltageV,
  phase: DEFAULT_INPUT.system.phase,
  frequencyHz: DEFAULT_INPUT.system.frequencyHz,

  conductorMaterial: DEFAULT_INPUT.cable.conductorMaterial,
  insulationType: DEFAULT_INPUT.cable.insulationType,
  cableType: DEFAULT_INPUT.cable.cableType,
  coreConfiguration: DEFAULT_INPUT.cable.coreConfiguration,

  methodCode: DEFAULT_INPUT.installation.methodCode,
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
  // Keep coreConfiguration coherent with phase unless the user edited it.
  // (The user can always override via the advanced panel.)
  const coreConfiguration = f.coreConfiguration;

  const loadOverride = f.useDesignCurrentOverride
    ? { designCurrentOverrideA: f.designCurrentOverrideA }
    : {};

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

  return {
    load: {
      type: f.loadType,
      powerKW: f.powerKW,
      powerFactor: f.powerFactor,
      efficiency: f.efficiency,
      demandFactor: f.demandFactor,
      ...loadOverride,
    },
    system: {
      voltageV: f.voltageV,
      phase: f.phase,
      frequencyHz: f.frequencyHz,
    },
    cable: {
      conductorMaterial: f.conductorMaterial,
      insulationType: f.insulationType,
      coreConfiguration,
      cableType: f.cableType,
    },
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
  };
}

// ─── Component ────────────────────────────────────────────────────────

interface Props {
  value: FormState;
  onChange: (next: FormState) => void;
  onSubmit: () => void;
  busy: boolean;
}

export function CircuitForm({ value, onChange, onSubmit, busy }: Props): React.ReactElement {
  // Small helper to cut boilerplate.
  const set = <K extends keyof FormState>(k: K, v: FormState[K]): void =>
    onChange({ ...value, [k]: v });

  const methodRequiresSoil = value.methodCode === 'D1' || value.methodCode === 'D2';

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
        <LvFields value={value} set={set} methodRequiresSoil={methodRequiresSoil} />
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

function LvFields({ value, set, methodRequiresSoil }: SubFormProps & { methodRequiresSoil: boolean }): React.ReactElement {
  return (
    <>
      {/* ─ Load ─ */}
      <fieldset>
        <legend>Load</legend>
        <SelectField
          label="Load type"
          v={value.loadType}
          options={[
            ['general', 'General'],
            ['motor', 'Motor'],
            ['heater', 'Heater'],
            ['lighting', 'Lighting'],
          ]}
          set={(s) => set('loadType', s as FormState['loadType'])}
        />
        <NumField label="Power (kW)" v={value.powerKW} set={(n) => set('powerKW', n)} />
        <NumField
          label="Power factor"
          v={value.powerFactor}
          step={0.01}
          set={(n) => set('powerFactor', n)}
        />
        <AdvancedGroup>
          <NumField
            label="Efficiency (η)"
            v={value.efficiency}
            step={0.01}
            set={(n) => set('efficiency', n)}
          />
          <NumField
            label="Demand factor"
            v={value.demandFactor}
            step={0.05}
            set={(n) => set('demandFactor', n)}
          />
          <CheckField
            label="Override design current (IB)"
            v={value.useDesignCurrentOverride}
            set={(b) => set('useDesignCurrentOverride', b)}
          />
          {value.useDesignCurrentOverride && (
            <NumField
              label="IB override (A)"
              v={value.designCurrentOverrideA}
              set={(n) => set('designCurrentOverrideA', n)}
            />
          )}
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
          set={(s) => set('phase', Number(s) as 1 | 3)}
        />
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
        </AdvancedGroup>
      </fieldset>

      {/* ─ Installation ─ */}
      <fieldset>
        <legend>Installation</legend>
        <SelectField
          label="Reference method"
          v={value.methodCode}
          options={[
            ['A1', 'A1 — insulated conductors in conduit in thermally insulated wall'],
            ['A2', 'A2 — multicore cable in conduit in thermally insulated wall'],
            ['B1', 'B1 — insulated conductors in conduit on a wall'],
            ['B2', 'B2 — multicore cable in conduit on a wall'],
            ['C', 'C — multicore cable on a wall or surface'],
            ['D1', 'D1 — multicore cable in buried conduit'],
            ['D2', 'D2 — multicore cable direct buried'],
            ['E', 'E — multicore in free air'],
            ['F', 'F — single-core in free air (touching)'],
            ['G', 'G — single-core in free air (spaced)'],
          ]}
          set={(s) => set('methodCode', s as FormState['methodCode'])}
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
        {methodRequiresSoil && (
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
        <NumField
          label="Rated In (A)"
          v={value.ratedCurrentA}
          set={(n) => set('ratedCurrentA', n)}
        />
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
          <NumField label="Apparent power (MVA)" v={value.mvApparentPowerMVA} step={0.1} set={(n) => set('mvApparentPowerMVA', n)} />
        ) : (
          <>
            <NumField label="Power (kW)" v={value.mvPowerKW} set={(n) => set('mvPowerKW', n)} />
            <NumField label="Power factor" v={value.mvPowerFactor} step={0.01} set={(n) => set('mvPowerFactor', n)} />
            <AdvancedGroup>
              <NumField label="Efficiency (η)" v={value.mvEfficiency} step={0.01} set={(n) => set('mvEfficiency', n)} />
              <NumField label="Demand factor" v={value.mvDemandFactor} step={0.05} set={(n) => set('mvDemandFactor', n)} />
            </AdvancedGroup>
          </>
        )}
        <AdvancedGroup>
          <CheckField label="Override design current (IB)" v={value.mvUseDesignCurrentOverride} set={(b) => set('mvUseDesignCurrentOverride', b)} />
          {value.mvUseDesignCurrentOverride && (
            <NumField label="IB override (A)" v={value.mvDesignCurrentOverrideA} set={(n) => set('mvDesignCurrentOverrideA', n)} />
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
          <CheckField label="Override screen CSA" v={value.mvUseScreenOverride} set={(b) => set('mvUseScreenOverride', b)} />
          {value.mvUseScreenOverride && (
            <NumField label="Screen CSA (mm²)" v={value.mvScreenCsaMm2} set={(n) => set('mvScreenCsaMm2', n)} />
          )}
          <CheckField label="Override capacitance" v={value.mvUseCapacitanceOverride} set={(b) => set('mvUseCapacitanceOverride', b)} />
          {value.mvUseCapacitanceOverride && (
            <NumField label="C (μF/km)" v={value.mvCapacitanceUFPerKm} step={0.01} set={(n) => set('mvCapacitanceUFPerKm', n)} />
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
          <NumField label="Spacing (mm)" v={value.mvFlatSpacingMm} step={10} set={(n) => set('mvFlatSpacingMm', n)} />
        )}
        <NumField label="Ground temp (°C)" v={value.mvAmbientTempC} set={(n) => set('mvAmbientTempC', n)} />
        <NumField label="Soil ρ (K·m/W)" v={value.mvSoilResistivityK_m_W} step={0.1} set={(n) => set('mvSoilResistivityK_m_W', n)} />
        {isBuried && (
          <NumField label="Burial depth (m)" v={value.mvBurialDepthM} step={0.1} set={(n) => set('mvBurialDepthM', n)} />
        )}
        <NumField label="Group count" v={value.mvGroupCount} step={1} set={(n) => set('mvGroupCount', Math.max(1, Math.round(n)))} />
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
        <NumField label="Breaking (kA)" v={value.mvBreakingKA} step={0.5} set={(n) => set('mvBreakingKA', n)} />
        <NumField label="Isc (kA)" v={value.mvShortCircuitKA} step={0.1} set={(n) => set('mvShortCircuitKA', n)} />
        <NumField label="Trip time (s)" v={value.mvTripTimeS} step={0.01} set={(n) => set('mvTripTimeS', n)} />
        <AdvancedGroup>
          <CheckField label="Verify screen against earth fault" v={value.mvUseEarthFault} set={(b) => set('mvUseEarthFault', b)} />
          {value.mvUseEarthFault && (
            <>
              <NumField label="Earth fault Ie (kA)" v={value.mvEarthFaultKA} step={0.1} set={(n) => set('mvEarthFaultKA', n)} />
              <NumField label="Earth fault t (s)" v={value.mvEarthFaultTimeS} step={0.01} set={(n) => set('mvEarthFaultTimeS', n)} />
            </>
          )}
        </AdvancedGroup>
      </fieldset>

      {/* ─ MV Policy ─ */}
      <fieldset>
        <legend>Project policy</legend>
        <NumField label="Max ΔU (%)" v={value.mvMaxVoltageDropPercent} step={0.1} set={(n) => set('mvMaxVoltageDropPercent', n)} />
        <CheckField label="Verify screen" v={value.mvVerifyScreen} set={(b) => set('mvVerifyScreen', b)} />
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
