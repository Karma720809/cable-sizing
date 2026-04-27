/**
 * Dataset loader for `mv_22kv_kr_v1` (Korean 22.9kV CNCV-W Cu/XLPE).
 *
 * Mirrors the LV `data/loader.ts` transport pattern: every JSON file is
 * statically imported (so the same module runs in Vite/Vitest/Web Worker
 * builds) and runs through a structural quality check before being frozen
 * and cached.
 */

import metaJson from '../data/datasets/mv_22kv_kr_v1/meta.json' with { type: 'json' };
import standardSizesJson from '../data/datasets/mv_22kv_kr_v1/standard_sizes.json' with { type: 'json' };

import ampDirectBuriedJson from '../data/datasets/mv_22kv_kr_v1/ampacity/amp_cncvw_cu_direct_buried.json' with { type: 'json' };
import ampDuctBankJson from '../data/datasets/mv_22kv_kr_v1/ampacity/amp_cncvw_cu_duct_bank.json' with { type: 'json' };
import ampTroughJson from '../data/datasets/mv_22kv_kr_v1/ampacity/amp_fr_cnco_cu_trough.json' with { type: 'json' };

import tempGroundJson from '../data/datasets/mv_22kv_kr_v1/corrections/temp_ground_kepco.json' with { type: 'json' };
import soilResistivityJson from '../data/datasets/mv_22kv_kr_v1/corrections/soil_resistivity_kepco.json' with { type: 'json' };
import groupingJson from '../data/datasets/mv_22kv_kr_v1/corrections/grouping_kepco.json' with { type: 'json' };
import burialDepthJson from '../data/datasets/mv_22kv_kr_v1/corrections/burial_depth_kepco.json' with { type: 'json' };

import rxCncvwJson from '../data/datasets/mv_22kv_kr_v1/impedance/rx_cncvw_cu_60hz.json' with { type: 'json' };
import capCncvwJson from '../data/datasets/mv_22kv_kr_v1/capacitance/cap_cncvw_cu.json' with { type: 'json' };
import screenCncvwJson from '../data/datasets/mv_22kv_kr_v1/screen/screen_cncvw.json' with { type: 'json' };

import kValuesJson from '../data/datasets/mv_22kv_kr_v1/short_circuit/k_values_mv.json' with { type: 'json' };

import type {
  MvAmpacityDataset,
  MvAmbientFactorDataset,
  MvBurialDepthFactorDataset,
  MvCapacitanceDataset,
  MvDataset,
  MvDatasetMeta,
  MvGroupingFactorDataset,
  MvImpedanceDataset,
  MvKValuesDataset,
  MvScreenDataset,
  MvSoilFactorDataset,
  MvStandardSizes,
} from './types-mv.js';

export class MvDatasetQualityError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = 'MvDatasetQualityError';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────

function assertAscendingByCsa(rows: { csaMm2: number }[], ctx: string, errs: string[]): void {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.csaMm2 <= rows[i - 1]!.csaMm2) {
      errs.push(`${ctx}: csa not strictly ascending at index ${i} (${rows[i - 1]!.csaMm2} → ${rows[i]!.csaMm2})`);
    }
  }
}

function assertAscendingAmpacity(rows: { csaMm2: number; ampacityA: number }[], ctx: string, errs: string[]): void {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.ampacityA <= rows[i - 1]!.ampacityA) {
      errs.push(`${ctx}: ampacity must increase with csa at index ${i}`);
    }
  }
}

function assertDescendingResistance(rows: { csaMm2: number; r_ohm_per_km: number }[], ctx: string, errs: string[]): void {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.r_ohm_per_km >= rows[i - 1]!.r_ohm_per_km) {
      errs.push(`${ctx}: r_ohm_per_km must decrease with csa at index ${i}`);
    }
  }
}

function assertFactorSane(factor: number, ctx: string, errs: string[]): void {
  if (!(factor > 0 && factor <= 2)) {
    errs.push(`${ctx}: factor ${factor} out of (0, 2]`);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Quality check
// ─────────────────────────────────────────────────────────────────────

function qualityCheck(ds: MvDataset): void {
  const errs: string[] = [];

  if (ds.meta.datasetId !== 'mv_22kv_kr_v1') {
    errs.push(`meta.datasetId expected 'mv_22kv_kr_v1', got '${ds.meta.datasetId}'`);
  }
  if (ds.meta.status !== 'approved') {
    errs.push(`meta.status must be 'approved' (got '${ds.meta.status}')`);
  }
  if (ds.meta.frequencyHz !== 60) {
    errs.push(`meta.frequencyHz must be 60 (got ${ds.meta.frequencyHz})`);
  }

  // Standard sizes — strict ascending, non-empty
  {
    const s = ds.standardSizes.sizesMm2;
    if (s.length === 0) errs.push('standard_sizes.sizesMm2 is empty');
    for (let i = 1; i < s.length; i++) {
      if (s[i]! <= s[i - 1]!) errs.push(`standard_sizes: not strictly ascending (${s[i - 1]} → ${s[i]})`);
    }
  }

  // Ampacity tables — every dataset id unique, rows ascending
  {
    if (ds.ampacity.datasets.length === 0) errs.push('ampacity datasets list is empty');
    const seenIds = new Set<string>();
    for (const a of ds.ampacity.datasets) {
      if (seenIds.has(a.id)) errs.push(`ampacity duplicate id ${a.id}`);
      seenIds.add(a.id);
      if (a.frequencyHz !== 60) errs.push(`ampacity[${a.id}]: frequencyHz must be 60`);
      assertAscendingByCsa(a.rows, `ampacity[${a.id}]`, errs);
      assertAscendingAmpacity(a.rows, `ampacity[${a.id}]`, errs);
    }
  }

  // Ambient ground temperature
  {
    const t = ds.corrections.ambientGround;
    if (t.rows.length === 0) errs.push('ambientGround.rows empty');
    for (let i = 1; i < t.rows.length; i++) {
      if (t.rows[i]!.ambientTempC <= t.rows[i - 1]!.ambientTempC) {
        errs.push(`ambientGround: not ascending at index ${i}`);
      }
    }
    for (const r of t.rows) assertFactorSane(r.factor, `ambientGround @${r.ambientTempC}°C`, errs);
    const baseRow = t.rows.find((r) => r.ambientTempC === t.baseTemperatureC);
    if (baseRow && Math.abs(baseRow.factor - 1.0) > 1e-9) {
      errs.push(`ambientGround: base @${t.baseTemperatureC}°C must be factor 1.0`);
    }
  }

  // Soil resistivity
  {
    const t = ds.corrections.soilResistivity;
    if (t.rows.length === 0) errs.push('soilResistivity.rows empty');
    for (let i = 1; i < t.rows.length; i++) {
      if (t.rows[i]!.soilResistivityK_m_W <= t.rows[i - 1]!.soilResistivityK_m_W) {
        errs.push(`soilResistivity: not ascending at index ${i}`);
      }
    }
    for (const r of t.rows) assertFactorSane(r.factor, `soilResistivity @${r.soilResistivityK_m_W}`, errs);
    const baseRow = t.rows.find((r) => r.soilResistivityK_m_W === t.baseSoilResistivityK_m_W);
    if (baseRow && Math.abs(baseRow.factor - 1.0) > 1e-9) {
      errs.push(`soilResistivity: base @${t.baseSoilResistivityK_m_W} must be factor 1.0`);
    }
  }

  // Grouping
  {
    const t = ds.corrections.grouping;
    if (t.rows.length === 0) errs.push('grouping.rows empty');
    for (let i = 1; i < t.rows.length; i++) {
      if (t.rows[i]!.groupCount <= t.rows[i - 1]!.groupCount) {
        errs.push(`grouping: groupCount not ascending at index ${i}`);
      }
    }
    const first = t.rows[0];
    if (first && first.groupCount === 1) {
      for (const m of ['direct_buried', 'duct_bank', 'trough', 'tunnel'] as const) {
        if (Math.abs(first[m] - 1.0) > 1e-9) {
          errs.push(`grouping[n=1].${m} must be 1.0`);
        }
      }
    }
    for (const r of t.rows) {
      for (const m of ['direct_buried', 'duct_bank', 'trough', 'tunnel'] as const) {
        assertFactorSane(r[m], `grouping[n=${r.groupCount}].${m}`, errs);
      }
    }
  }

  // Burial depth
  {
    const t = ds.corrections.burialDepth;
    if (t.rows.length === 0) errs.push('burialDepth.rows empty');
    for (let i = 1; i < t.rows.length; i++) {
      if (t.rows[i]!.burialDepth_m <= t.rows[i - 1]!.burialDepth_m) {
        errs.push(`burialDepth: not ascending at index ${i}`);
      }
    }
    for (const r of t.rows) assertFactorSane(r.factor, `burialDepth @${r.burialDepth_m}m`, errs);
    const baseRow = t.rows.find((r) => r.burialDepth_m === t.baseBurialDepth_m);
    if (baseRow && Math.abs(baseRow.factor - 1.0) > 1e-9) {
      errs.push(`burialDepth: base @${t.baseBurialDepth_m}m must be factor 1.0`);
    }
  }

  // Impedance
  {
    if (ds.impedance.datasets.length === 0) errs.push('impedance datasets empty');
    for (const imp of ds.impedance.datasets) {
      assertAscendingByCsa(imp.rows, `impedance[${imp.id}]`, errs);
      assertDescendingResistance(imp.rows, `impedance[${imp.id}]`, errs);
      if (imp.frequencyHz !== 60) errs.push(`impedance[${imp.id}]: frequencyHz must be 60`);
    }
  }

  // Capacitance
  {
    if (ds.capacitance.datasets.length === 0) errs.push('capacitance datasets empty');
    for (const cap of ds.capacitance.datasets) {
      assertAscendingByCsa(cap.rows, `capacitance[${cap.id}]`, errs);
      // Capacitance should also be monotonically increasing with csa
      for (let i = 1; i < cap.rows.length; i++) {
        if (cap.rows[i]!.capacitance_uF_per_km <= cap.rows[i - 1]!.capacitance_uF_per_km) {
          errs.push(`capacitance[${cap.id}]: must increase with csa at index ${i}`);
        }
      }
    }
  }

  // Screen
  {
    if (ds.screen.datasets.length === 0) errs.push('screen datasets empty');
    for (const sc of ds.screen.datasets) {
      assertAscendingByCsa(sc.rows, `screen[${sc.id}]`, errs);
      // Screen csa is non-decreasing (some platforms in catalog are flat across two sizes)
      for (let i = 1; i < sc.rows.length; i++) {
        if (sc.rows[i]!.screen_csa_mm2 < sc.rows[i - 1]!.screen_csa_mm2) {
          errs.push(`screen[${sc.id}]: screen_csa_mm2 decreased at index ${i}`);
        }
      }
    }
  }

  // K values — Cu/XLPE conductor + screen present
  {
    const k = ds.shortCircuit.kValues;
    const conductor = k.values.find(
      (v) => v.material === 'Cu' && v.insulationType === 'XLPE' && v.application === 'conductor',
    );
    const screen = k.values.find(
      (v) => v.material === 'Cu' && v.insulationType === 'XLPE' && v.application === 'screen',
    );
    if (!conductor) errs.push('kValues: missing Cu/XLPE/conductor entry');
    if (!screen) errs.push('kValues: missing Cu/XLPE/screen entry');
    if (conductor && conductor.kValue !== 143) errs.push(`kValues.conductor: expected 143, got ${conductor.kValue}`);
    if (screen && screen.kValue !== 143) errs.push(`kValues.screen: expected 143, got ${screen.kValue}`);
  }

  if (errs.length > 0) {
    throw new MvDatasetQualityError(`MV dataset quality check failed with ${errs.length} issue(s)`, errs);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public loader
// ─────────────────────────────────────────────────────────────────────

let CACHE: MvDataset | null = null;

export function loadMvDataset(): MvDataset {
  if (CACHE) return CACHE;

  const meta = metaJson as MvDatasetMeta;
  const standardSizes = standardSizesJson as MvStandardSizes;

  const ampDirectBuried = ampDirectBuriedJson as MvAmpacityDataset;
  const ampDuctBank = ampDuctBankJson as MvAmpacityDataset;
  const ampTrough = ampTroughJson as MvAmpacityDataset;

  const ambientGround = tempGroundJson as MvAmbientFactorDataset;
  const soilResistivity = soilResistivityJson as MvSoilFactorDataset;
  const grouping = groupingJson as MvGroupingFactorDataset;
  const burialDepth = burialDepthJson as MvBurialDepthFactorDataset;

  const rxCncvw = rxCncvwJson as MvImpedanceDataset;
  const capCncvw = capCncvwJson as MvCapacitanceDataset;
  const screenCncvw = screenCncvwJson as MvScreenDataset;

  const kValues = kValuesJson as MvKValuesDataset;

  const ds: MvDataset = {
    meta,
    standardSizes,
    ampacity: { datasets: [ampDirectBuried, ampDuctBank, ampTrough] },
    corrections: { ambientGround, soilResistivity, grouping, burialDepth },
    impedance: { datasets: [rxCncvw] },
    capacitance: { datasets: [capCncvw] },
    screen: { datasets: [screenCncvw] },
    shortCircuit: { kValues },
  };

  qualityCheck(ds);

  CACHE = Object.freeze(ds) as MvDataset;
  return CACHE;
}

/** Test-only: clear the internal cache between tests. */
export function __resetMvDatasetCache(): void {
  CACHE = null;
}
