/**
 * v1.3 Stage B — armour CSA derivation (CR-OQ-7).
 *
 * Resolution order:
 *   1. `overrides.armourCsaMm2`           → source = override, W-CR-004
 *   2. dataset lookup by (cableConstruction, conductorCsaMm2)
 *                                         → source = auto_dataset
 *   3. `cable.armourType` unset/'none'    → unavailable / not_applicable
 *   4. lookup miss                        → unavailable / no_dataset_match
 *
 * `cableConstruction` key is composed from coreConfiguration + armourType
 * + insulationType, e.g. `3C+E_SWA_XLPE`. The Stage B SWA dataset only
 * carries the `3C+E_SWA_XLPE` family; other constructions resolve as
 * `unavailable`.
 *
 * Spec: Design_Change_LV_Cable_Sizing_Input_Automation_v1.3_FINAL §6.7;
 *       Implementation_Spec_LV_v2.0 §3.1, §5.1.
 */
import type {
  ArmourDataset,
  CircuitInput,
  Dataset,
  FieldState,
  Warning,
} from '../types/index.js';
import { FieldStateBuilder } from '../types/field-state.js';

export interface ArmourBundle {
  armourCsaMm2: number;
  kArmour: number;
  armourType: 'SWA' | 'STA';
  sourceRef: string;
  cableConstruction: string;
}

export interface DeriveArmourResult {
  state: FieldState<ArmourBundle>;
  /** Resolved armour bundle if status='valid'; else null. */
  armour: ArmourBundle | null;
  warnings: Warning[];
}

function buildConstructionKey(input: CircuitInput): string | null {
  const armourType = input.cable.armourType;
  if (!armourType || armourType === 'none') return null;
  // The Stage B SWA dataset uses '3C+E_SWA_XLPE' as the only listed key.
  // Build a key that matches that pattern: {coreConfig}_{armourType}_{insulation}.
  // coreConfiguration is one of '2C' | '3C' | '4C' | '3C+N'; spec uses '3C+E'.
  // For Stage B we map '3C+N' → '3C+E' (same physical 4-conductor cable).
  const coreMap: Record<string, string> = {
    '2C': '2C',
    '3C': '3C',
    '4C': '4C',
    '3C+N': '3C+E',
  };
  const core = coreMap[input.cable.coreConfiguration] ?? input.cable.coreConfiguration;
  return `${core}_${armourType}_${input.cable.insulationType}`;
}

function lookupArmour(
  ad: ArmourDataset,
  cableConstruction: string,
  conductorCsaMm2: number,
): { armourCsaMm2: number } | null {
  const hit = ad.entries.find(
    (e) => e.cableConstruction === cableConstruction && e.conductorCsaMm2 === conductorCsaMm2,
  );
  return hit ? { armourCsaMm2: hit.armourCsaMm2 } : null;
}

function armourUnavailableWarning(message: string): Warning {
  return {
    code: 'W-CR-009',
    message,
    field: 'cable.armourType',
  };
}

export function deriveArmour(
  input: CircuitInput,
  dataset: Dataset,
  selectedConductorCsaMm2: number | null,
): DeriveArmourResult {
  const warnings: Warning[] = [];

  // ── 1. Override path ────────────────────────────────────────────────
  if (input.overrides && 'armourCsaMm2' in input.overrides) {
    const ov = input.overrides.armourCsaMm2;
    if (typeof ov === 'number' && Number.isFinite(ov) && ov > 0) {
      const armourType: 'SWA' | 'STA' =
        input.cable.armourType === 'STA' ? 'STA' : 'SWA';
      const ds = armourType === 'STA' ? dataset.armour?.sta : dataset.armour?.swa;
      const kArmour = ds?.kArmour ?? 51; // Default per IEC 60364-5-54 if dataset absent.
      const bundle: ArmourBundle = {
        armourCsaMm2: ov,
        kArmour,
        armourType,
        sourceRef: 'user override',
        cableConstruction: buildConstructionKey(input) ?? '<override>',
      };
      warnings.push({
        code: 'W-CR-004',
        message: `armour CSA overridden to ${ov} mm² (dataset lookup bypassed)`,
        field: 'overrides.armourCsaMm2',
      });
      return {
        state: FieldStateBuilder.override<ArmourBundle>(bundle),
        armour: bundle,
        warnings,
      };
    }

    return {
      state: FieldStateBuilder.invalid<ArmourBundle>(
        'override',
        'armour_csa_override_must_be_positive',
        { inputs: { armourCsaMm2: ov } },
      ),
      armour: null,
      warnings,
    };
  }

  // ── 2. armourType unset / 'none' → unavailable ──────────────────────
  const armourType = input.cable.armourType;
  if (!armourType || armourType === 'none') {
    return {
      state: FieldStateBuilder.unavailable('not_applicable'),
      armour: null,
      warnings,
    };
  }

  // ── 3. Dataset lookup ───────────────────────────────────────────────
  const armourDataset =
    armourType === 'SWA' ? dataset.armour?.swa : dataset.armour?.sta;
  if (!armourDataset) {
    return {
      state: FieldStateBuilder.unavailable('no_dataset_match'),
      armour: null,
      warnings: [
        armourUnavailableWarning(
          `${armourType} armour selected but no armour dataset is bundled; armour short-circuit verification was not evaluated`,
        ),
      ],
    };
  }
  if (selectedConductorCsaMm2 == null) {
    return {
      state: FieldStateBuilder.incomplete('missing_input'),
      armour: null,
      warnings: [
        armourUnavailableWarning(
          `${armourType} armour selected but conductor CSA is not available; armour short-circuit verification was not evaluated`,
        ),
      ],
    };
  }
  const cableConstruction = buildConstructionKey(input);
  if (!cableConstruction) {
    return {
      state: FieldStateBuilder.unavailable('not_applicable'),
      armour: null,
      warnings: [
        armourUnavailableWarning(
          `${armourType} armour selected but cable construction could not be resolved; armour short-circuit verification was not evaluated`,
        ),
      ],
    };
  }
  const hit = lookupArmour(armourDataset, cableConstruction, selectedConductorCsaMm2);
  if (!hit) {
    return {
      state: FieldStateBuilder.unavailable('no_dataset_match'),
      armour: null,
      warnings: [
        armourUnavailableWarning(
          `${armourType} armour selected but no armour CSA entry matches ${cableConstruction} at ${selectedConductorCsaMm2} mm²; armour short-circuit verification was not evaluated`,
        ),
      ],
    };
  }
  const bundle: ArmourBundle = {
    armourCsaMm2: hit.armourCsaMm2,
    kArmour: armourDataset.kArmour,
    armourType: armourDataset.armourType,
    sourceRef: armourDataset.sourceRef,
    cableConstruction,
  };
  return {
    state: FieldStateBuilder.autoDataset<ArmourBundle>(bundle, armourDataset.datasetId),
    armour: bundle,
    warnings,
  };
}
