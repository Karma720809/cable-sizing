/**
 * Dataset manifest — Phase 4A.1.
 *
 * Exposes a machine-readable snapshot of what the engine currently supports,
 * so UI hosts and external tooling can:
 *   - discover which (material, insulation, loadedConductors, frequency, method)
 *     combinations are bundled,
 *   - populate dropdowns without hard-coding enum values,
 *   - gate feature flags behind the actual shipped dataset coverage.
 *
 * The manifest is derived at call-time from `loadDataset()` — it reflects
 * whatever JSON files are bundled in this engine build. It is *not* a
 * user-editable contract; it mirrors reality.
 */
import { loadDataset } from '../data/loader.js';
import { ENGINE_VERSION } from '../version.js';
import type {
  ConductorMaterial,
  InsulationType,
  CableType,
  FrequencyHz,
  ReferenceMethod,
} from '../types/index.js';

export interface DatasetBundleEntry {
  /** Internal dataset id (e.g. `amp_cu_pvc_3loaded_multicore_50`). */
  id: string;
  conductorMaterial: ConductorMaterial;
  insulationType: InsulationType;
  loadedConductors: number;
  cableType: CableType;
  frequencyHz: FrequencyHz;
  /** Sorted list of reference-method codes available in this dataset. */
  methods: string[];
  /** csa range present across the dataset's tables (min/max in mm²). */
  csaRange: { minMm2: number; maxMm2: number };
  sourceRef: string;
}

export interface SupportedCombination {
  conductorMaterial: ConductorMaterial;
  insulationType: InsulationType;
  loadedConductors: number;
  /**
   * Cable construction — required to disambiguate multicore vs single-core
   * bundles as of 5A-SC-FG infrastructure. Additive change under API v1:
   * existing consumers that do not filter on `cableType` are unaffected, but
   * new consumers can distinguish e.g. "Cu/PVC/3L/50Hz/C" in a multicore
   * bundle from the same key in a future single-core bundle.
   */
  cableType: CableType;
  frequencyHz: FrequencyHz;
  method: ReferenceMethod | string;
  availableCsaMm2: number[];
}

export interface DatasetManifest {
  /** Top-level dataset bundle id (e.g. `iec60364_lv_v1`). */
  datasetId: string;
  /** Engine version that produced this manifest. */
  engineVersion: string;
  /** Worker API contract version (kept separate from engineVersion). */
  apiVersion: number;
  /** Standard csa grid (full cross-section list). */
  standardSizesMm2: number[];
  /** Every bundled ampacity dataset as a discoverable entry. */
  bundledDatasets: DatasetBundleEntry[];
  /**
   * Flat cross-product of every supported lookup key. Intended for programmatic
   * filtering (e.g. "give me every method available for Cu/XLPE/3-loaded/50Hz").
   */
  supportedCombinations: SupportedCombination[];
  /** Insulation/material pairs for which impedance (R/X) data is available. */
  impedanceCoverage: Array<{
    conductorMaterial: ConductorMaterial;
    cableType: CableType;
    frequencyHz: FrequencyHz;
    insulationTypes: InsulationType[];
  }>;
  /**
   * Insulation × material pairs with a defined k-value (for short-circuit CSA
   * calculation).
   */
  kValueCoverage: Array<{
    conductorMaterial: ConductorMaterial;
    insulationType: InsulationType;
    kValue: number;
    initialTempC: number;
    finalTempC: number;
  }>;
}

/**
 * Build the manifest. Pure function over the loaded dataset — safe to call
 * repeatedly (the underlying dataset is itself cached).
 */
export function getDatasetManifest(): DatasetManifest {
  const ds = loadDataset();

  // Supported-method semantics (Stage 5A policy):
  //   A reference-method entry counts as "supported" iff its rows array has
  //   at least one concrete (csa, ampacity) pair. Method codes declared but
  //   left with rows: [] — e.g. because source values are not yet sourced —
  //   are filtered out of BOTH `bundledDatasets[i].methods` AND
  //   `supportedCombinations`. Hosts relying on these surfaces should never
  //   see a combination they cannot actually look up.
  //
  //   Today the loader's quality check rejects empty rows at dataset load
  //   time, so this filter is belt-and-suspenders; it becomes load-bearing
  //   the moment we introduce a `pending` method placeholder convention.
  const bundledDatasets: DatasetBundleEntry[] = ds.ampacity.datasets.map((a) => {
    const methods = Object.keys(a.tables)
      .filter((m) => a.tables[m]!.rows.length > 0)
      .sort();
    let minMm2 = Infinity;
    let maxMm2 = -Infinity;
    for (const m of methods) {
      const t = a.tables[m]!;
      for (const r of t.rows) {
        if (r.csaMm2 < minMm2) minMm2 = r.csaMm2;
        if (r.csaMm2 > maxMm2) maxMm2 = r.csaMm2;
      }
    }
    return {
      id: a.id,
      conductorMaterial: a.conductorMaterial,
      insulationType: a.insulationType,
      loadedConductors: a.loadedConductors,
      cableType: a.cableType,
      frequencyHz: a.frequencyHz,
      methods,
      csaRange: { minMm2, maxMm2 },
      sourceRef: a.sourceRef,
    };
  });

  const supportedCombinations: SupportedCombination[] = [];
  for (const a of ds.ampacity.datasets) {
    for (const method of Object.keys(a.tables).sort()) {
      const rows = a.tables[method]!.rows;
      if (rows.length === 0) continue; // 5A policy: no-rows = not supported
      supportedCombinations.push({
        conductorMaterial: a.conductorMaterial,
        insulationType: a.insulationType,
        loadedConductors: a.loadedConductors,
        cableType: a.cableType,
        frequencyHz: a.frequencyHz,
        method,
        availableCsaMm2: rows.map((r) => r.csaMm2),
      });
    }
  }

  const impedanceCoverage = ds.impedance.datasets.map((imp) => {
    const insulationTypes: InsulationType[] = [];
    if (imp.resistance.PVC && imp.resistance.PVC.rows.length > 0) insulationTypes.push('PVC');
    if (imp.resistance.XLPE && imp.resistance.XLPE.rows.length > 0) insulationTypes.push('XLPE');
    return {
      conductorMaterial: imp.conductorMaterial,
      cableType: imp.cableType,
      frequencyHz: imp.frequencyHz,
      insulationTypes,
    };
  });

  const kValueCoverage = ds.shortCircuit.kValues.values.map((v) => ({
    conductorMaterial: v.conductorMaterial,
    insulationType: v.insulationType,
    kValue: v.kValue,
    initialTempC: v.initialTempC,
    finalTempC: v.finalTempC,
  }));

  return {
    datasetId: ds.meta.datasetId,
    engineVersion: ENGINE_VERSION,
    apiVersion: API_VERSION,
    standardSizesMm2: [...ds.standardSizes.sizesMm2],
    bundledDatasets,
    supportedCombinations,
    impedanceCoverage,
    kValueCoverage,
  };
}

/**
 * Worker API contract version, kept separate from ENGINE_VERSION so that
 * internal calculation changes don't force consumers to redeploy message
 * handlers. Bump only when the worker envelope shape changes.
 */
export const API_VERSION = 1 as const;
