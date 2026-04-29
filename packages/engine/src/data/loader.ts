/**
 * Dataset loader for iec60364_lv_v1.
 *
 * Bundles the 13 JSON files via static ESM imports and performs structural +
 * logical quality checks (PRD §14.5) before returning the frozen Dataset
 * object. Static imports let the same module run under Node (Vitest) and in
 * browsers / Web Workers (Vite) without a runtime filesystem dependency.
 *
 * Loader output (the Dataset shape) and all quality checks are unchanged
 * from the original Node-fs-based loader — this is a transport refactor only.
 */

// Static JSON imports — bundlers inline these; Vitest/Node resolveJsonModule handles them.
import metaJson from './datasets/iec60364_lv_v1/meta.json' with { type: 'json' };
import standardSizesJson from './datasets/iec60364_lv_v1/standard_sizes.json' with { type: 'json' };

import ampCuPvcJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_3loaded_50.json' with { type: 'json' };
import ampCuXlpeJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_3loaded_50.json' with { type: 'json' };
import ampAlPvcJson from './datasets/iec60364_lv_v1/ampacity/amp_al_pvc_3loaded_50.json' with { type: 'json' };
import ampAlXlpeJson from './datasets/iec60364_lv_v1/ampacity/amp_al_xlpe_3loaded_50.json' with { type: 'json' };
import ampCuPvc2LJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_2loaded_50.json' with { type: 'json' };
import ampCuXlpe2LJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_2loaded_50.json' with { type: 'json' };
import ampCuPvcSCJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_singlecore_3loaded_50.json' with { type: 'json' };
import ampCuXlpeSCJson from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_singlecore_3loaded_50.json' with { type: 'json' };
import ampAlPvcSCJson from './datasets/iec60364_lv_v1/ampacity/amp_al_pvc_singlecore_3loaded_50.json' with { type: 'json' };
import ampAlXlpeSCJson from './datasets/iec60364_lv_v1/ampacity/amp_al_xlpe_singlecore_3loaded_50.json' with { type: 'json' };

// Stage 5B-AMP: 60 Hz ampacity siblings (values replicated under IEC
// 60364-5-52:2009 Annex B 50/60 Hz equivalence clause for LV CSA ≤ 300 mm²).
import ampCuPvc60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_3loaded_60.json' with { type: 'json' };
import ampCuXlpe60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_3loaded_60.json' with { type: 'json' };
import ampAlPvc60Json from './datasets/iec60364_lv_v1/ampacity/amp_al_pvc_3loaded_60.json' with { type: 'json' };
import ampAlXlpe60Json from './datasets/iec60364_lv_v1/ampacity/amp_al_xlpe_3loaded_60.json' with { type: 'json' };
import ampCuPvc2L60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_2loaded_60.json' with { type: 'json' };
import ampCuXlpe2L60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_2loaded_60.json' with { type: 'json' };
import ampCuPvcSC60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_pvc_singlecore_3loaded_60.json' with { type: 'json' };
import ampCuXlpeSC60Json from './datasets/iec60364_lv_v1/ampacity/amp_cu_xlpe_singlecore_3loaded_60.json' with { type: 'json' };
import ampAlPvcSC60Json from './datasets/iec60364_lv_v1/ampacity/amp_al_pvc_singlecore_3loaded_60.json' with { type: 'json' };
import ampAlXlpeSC60Json from './datasets/iec60364_lv_v1/ampacity/amp_al_xlpe_singlecore_3loaded_60.json' with { type: 'json' };

import ambientAirJson from './datasets/iec60364_lv_v1/corrections/ambient_air.json' with { type: 'json' };
import ambientGroundJson from './datasets/iec60364_lv_v1/corrections/ambient_ground.json' with { type: 'json' };
import soilResistivityJson from './datasets/iec60364_lv_v1/corrections/soil_resistivity.json' with { type: 'json' };
import groupingJson from './datasets/iec60364_lv_v1/corrections/grouping.json' with { type: 'json' };

import impCuJson from './datasets/iec60364_lv_v1/impedance/rx_cu_multicore_50hz.json' with { type: 'json' };
import impAlJson from './datasets/iec60364_lv_v1/impedance/rx_al_multicore_50hz.json' with { type: 'json' };
// Stage 5B-IMP: 60 Hz multicore impedance siblings.
//   R: replicated from 50 Hz (frequency-independent for LV CSA ≤ 300 mm²).
//   X: derived as X60 = 1.2 · X50 (X = 2πfL, geometry-fixed L).
import impCu60Json from './datasets/iec60364_lv_v1/impedance/rx_cu_multicore_60hz.json' with { type: 'json' };
import impAl60Json from './datasets/iec60364_lv_v1/impedance/rx_al_multicore_60hz.json' with { type: 'json' };

import kValuesJson from './datasets/iec60364_lv_v1/short_circuit/k_values.json' with { type: 'json' };

// Stage 5C: temperature coefficient of resistance (α) at 20 °C per
// conductor material (IEC 60228 / IEC 60287-1-1). Used only when
// projectPolicy.resistanceModel === 'temperature_corrected'.
import alphaJson from './datasets/iec60364_lv_v1/physics/alpha_coefficients.json' with { type: 'json' };

// v1.3 Stage B: armour CSA dataset (BS 5467 placeholder — status='draft').
import armourSwaJson from './datasets/iec60364_lv_v1/armour/swa.json' with { type: 'json' };

import type {
  Dataset,
  DatasetMeta,
  StandardSizes,
  AmpacityDataset,
  AmbientAirDataset,
  AmbientGroundDataset,
  SoilResistivityDataset,
  GroupingDataset,
  ImpedanceDataset,
  KValuesDataset,
  AlphaCoefficientsDataset,
  ArmourDataset,
  ArmourEntry,
} from '../types/index.js';

export class DatasetQualityError extends Error {
  constructor(
    message: string,
    readonly details: string[],
  ) {
    super(message);
    this.name = 'DatasetQualityError';
  }
}

// ─────────────────────────────────────────────────────────────────────
// Quality checks (PRD §14.5)
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
      errs.push(
        `${ctx}: ampacity must increase with csa at index ${i} (${rows[i - 1]!.ampacityA} → ${rows[i]!.ampacityA})`,
      );
    }
  }
}

function assertDescendingResistance(rows: { csaMm2: number; value: number }[], ctx: string, errs: string[]): void {
  for (let i = 1; i < rows.length; i++) {
    if (rows[i]!.value >= rows[i - 1]!.value) {
      errs.push(`${ctx}: resistance must decrease with csa at index ${i} (${rows[i - 1]!.value} → ${rows[i]!.value})`);
    }
  }
}

function assertFactorRange(factor: number, ctx: string, errs: string[]): void {
  if (!(factor > 0 && factor <= 2)) {
    errs.push(`${ctx}: factor ${factor} out of sane range (0, 2]`);
  }
}

function qualityCheck(ds: {
  meta: DatasetMeta;
  standardSizes: StandardSizes;
  ampacityList: AmpacityDataset[];
  ambientAir: AmbientAirDataset;
  ambientGround: AmbientGroundDataset;
  soilResistivity: SoilResistivityDataset;
  grouping: GroupingDataset;
  impedanceList: ImpedanceDataset[];
  kValues: KValuesDataset;
  alphaCoefficients: AlphaCoefficientsDataset;
}): void {
  const errs: string[] = [];

  // standard sizes: ascending + unique
  {
    const s = ds.standardSizes.sizesMm2;
    if (s.length === 0) errs.push('standard_sizes.sizesMm2 is empty');
    for (let i = 1; i < s.length; i++) {
      if (s[i]! <= s[i - 1]!) errs.push(`standard_sizes: not strictly ascending (${s[i - 1]} → ${s[i]})`);
    }
  }

  // ampacity tables — apply checks to every bundled dataset
  //
  // Stage 5A policy: every key under `tables` must be a canonical
  // ReferenceMethod code — typos (e.g. "E1" in place of "E", or a stray "e")
  // are caught at load time rather than silently surfacing in the manifest
  // as bogus "supported" combinations. The canonical set is the same enum
  // the zod schema accepts for `installation.methodCode`.
  const CANONICAL_METHODS = new Set([
    'A1',
    'A2',
    'B1',
    'B2',
    'C',
    'D1',
    'D2',
    'E',
    'F',
    'G',
  ]);
  {
    if (ds.ampacityList.length === 0) errs.push('ampacity list is empty');
    const idSeen = new Set<string>();
    for (const a of ds.ampacityList) {
      if (idSeen.has(a.id)) errs.push(`ampacity: duplicate dataset id ${a.id}`);
      idSeen.add(a.id);
      const methods = Object.keys(a.tables);
      if (methods.length === 0) errs.push(`ampacity[${a.id}].tables is empty`);
      for (const m of methods) {
        if (!CANONICAL_METHODS.has(m)) {
          errs.push(`ampacity[${a.id}]: unknown reference-method code "${m}" (expected one of A1/A2/B1/B2/C/D1/D2/E/F/G)`);
          continue;
        }
        const t = a.tables[m]!;
        const ctx = `ampacity[${a.id}/${m}]`;
        if (t.rows.length === 0) errs.push(`${ctx}.rows is empty`);
        assertAscendingByCsa(t.rows, ctx, errs);
        assertAscendingAmpacity(t.rows, ctx, errs);
        const seen = new Set<number>();
        for (const r of t.rows) {
          if (seen.has(r.csaMm2)) errs.push(`${ctx}: duplicate csa ${r.csaMm2}`);
          seen.add(r.csaMm2);
        }
      }
    }
  }

  // ambient (air / ground)
  for (const [label, tbl] of [
    ['ambientAir', ds.ambientAir] as const,
    ['ambientGround', ds.ambientGround] as const,
  ]) {
    for (const ins of ['PVC', 'XLPE'] as const) {
      const table = tbl.tables[ins];
      if (!table) {
        errs.push(`${label}: missing ${ins} table`);
        continue;
      }
      if (table.rows.length === 0) errs.push(`${label}[${ins}].rows is empty`);
      // ascending by ambient temperature
      for (let i = 1; i < table.rows.length; i++) {
        if (table.rows[i]!.ambientTempC <= table.rows[i - 1]!.ambientTempC) {
          errs.push(`${label}[${ins}]: ambientTempC not strictly ascending at index ${i}`);
        }
      }
      for (const r of table.rows) {
        assertFactorRange(r.factor, `${label}[${ins}] @${r.ambientTempC}°C`, errs);
      }
      // base temperature row factor should be 1.0
      const base = tbl.baseTemperatureC;
      const baseRow = table.rows.find((r) => r.ambientTempC === base);
      if (baseRow && Math.abs(baseRow.factor - 1.0) > 1e-9) {
        errs.push(`${label}[${ins}]: base temperature ${base}°C factor must be 1.0 (got ${baseRow.factor})`);
      }
    }
  }

  // soil resistivity
  {
    const tbls = ds.soilResistivity.tables;
    for (const key of Object.keys(tbls)) {
      const t = tbls[key]!;
      if (t.rows.length === 0) errs.push(`soilResistivity[${key}].rows is empty`);
      for (let i = 1; i < t.rows.length; i++) {
        if (t.rows[i]!.soilResistivityK_m_W <= t.rows[i - 1]!.soilResistivityK_m_W) {
          errs.push(`soilResistivity[${key}]: not ascending at index ${i}`);
        }
      }
      for (const r of t.rows) assertFactorRange(r.factor, `soilResistivity[${key}] @${r.soilResistivityK_m_W}`, errs);
      const baseRow = t.rows.find((r) => r.soilResistivityK_m_W === ds.soilResistivity.baseSoilResistivityK_m_W);
      if (baseRow && Math.abs(baseRow.factor - 1.0) > 1e-9) {
        errs.push(`soilResistivity[${key}]: base row factor must be 1.0 (got ${baseRow.factor})`);
      }
    }
  }

  // grouping: groupCount=1 must be factor=1
  {
    const tbls = ds.grouping.tables;
    for (const key of Object.keys(tbls)) {
      const t = tbls[key]!;
      if (t.rows.length === 0) errs.push(`grouping[${key}].rows is empty`);
      for (let i = 1; i < t.rows.length; i++) {
        if (t.rows[i]!.groupCount <= t.rows[i - 1]!.groupCount) {
          errs.push(`grouping[${key}]: groupCount not strictly ascending at index ${i}`);
        }
      }
      const first = t.rows[0];
      if (first && first.groupCount === 1 && Math.abs(first.factor - 1.0) > 1e-9) {
        errs.push(`grouping[${key}]: groupCount=1 factor must be 1.0`);
      }
      for (const r of t.rows) assertFactorRange(r.factor, `grouping[${key}] n=${r.groupCount}`, errs);
    }
  }

  // impedance — iterate every bundled impedance dataset
  {
    if (ds.impedanceList.length === 0) errs.push('impedance list is empty');
    const idSeen = new Set<string>();
    for (const imp of ds.impedanceList) {
      if (idSeen.has(imp.id)) errs.push(`impedance: duplicate dataset id ${imp.id}`);
      idSeen.add(imp.id);
      for (const ins of ['PVC', 'XLPE'] as const) {
        const R = imp.resistance[ins];
        const X = imp.reactance[ins];
        if (!R) errs.push(`impedance[${imp.id}].resistance[${ins}] missing`);
        else {
          assertAscendingByCsa(R.rows, `impedance[${imp.id}].R[${ins}]`, errs);
          assertDescendingResistance(R.rows, `impedance[${imp.id}].R[${ins}]`, errs);
          if (typeof R.temperatureBasisC !== 'number') {
            errs.push(`impedance[${imp.id}].R[${ins}].temperatureBasisC missing`);
          }
        }
        if (!X) errs.push(`impedance[${imp.id}].reactance[${ins}] missing`);
        else {
          assertAscendingByCsa(X.rows, `impedance[${imp.id}].X[${ins}]`, errs);
        }
      }
    }
  }

  // α coefficients (Stage 5C): both Cu and Al must be present, referenceTempC
  // must match the IEC 60228 basis (20 °C), and each α value must sit in a
  // physically sensible band (0 < α < 0.01 /K — observed Cu/Al are ~4e-3).
  {
    const a = ds.alphaCoefficients;
    if (a.referenceTempC !== 20) {
      errs.push(`alpha: referenceTempC must be 20 (IEC 60228); got ${a.referenceTempC}`);
    }
    if (a.unit !== 'per_K') errs.push(`alpha: unit must be 'per_K'; got ${a.unit}`);
    for (const mat of ['Cu', 'Al'] as const) {
      const hit = a.values.find((v) => v.conductorMaterial === mat);
      if (!hit) {
        errs.push(`alpha: missing entry for ${mat}`);
        continue;
      }
      if (!(hit.alphaPerK > 0 && hit.alphaPerK < 0.01)) {
        errs.push(`alpha[${mat}]: alphaPerK ${hit.alphaPerK} out of sane range (0, 0.01)`);
      }
    }
  }

  // k values: all 4 combinations must exist
  {
    const combos: Array<[string, string]> = [
      ['Cu', 'PVC'],
      ['Cu', 'XLPE'],
      ['Al', 'PVC'],
      ['Al', 'XLPE'],
    ];
    for (const [c, i] of combos) {
      const hit = ds.kValues.values.find((v) => v.conductorMaterial === c && v.insulationType === i);
      if (!hit) errs.push(`kValues: missing combination ${c}/${i}`);
    }
  }

  if (errs.length > 0) {
    throw new DatasetQualityError(`Dataset quality check failed with ${errs.length} issue(s)`, errs);
  }
}

/**
 * v1.3 Stage B: armour dataset structural check. Lighter than the LV
 * core checks because the data is acknowledged placeholder (status='draft');
 * we only enforce shape and ascending csa. Stage D will re-validate with
 * the dataset matrix sourcing process.
 */
function armourQualityCheck(a: ArmourDataset): void {
  const errs: string[] = [];
  if (!a.entries || a.entries.length === 0) errs.push('armour: entries empty');
  if (!(a.kArmour > 0 && a.kArmour < 200)) errs.push(`armour: kArmour ${a.kArmour} out of sane range`);
  if (a.armourType !== 'SWA' && a.armourType !== 'STA') {
    errs.push(`armour: armourType must be SWA|STA, got ${a.armourType}`);
  }
  // Group by cableConstruction; csa within each group must strictly ascend.
  const groups = new Map<string, ArmourEntry[]>();
  for (const e of a.entries) {
    const k = e.cableConstruction;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(e);
  }
  for (const [k, rows] of groups) {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i]!.conductorCsaMm2 <= rows[i - 1]!.conductorCsaMm2) {
        errs.push(`armour[${k}]: conductorCsaMm2 not ascending at index ${i}`);
      }
    }
    for (const r of rows) {
      if (!(r.armourCsaMm2 > 0)) errs.push(`armour[${k}]: armourCsaMm2 ${r.armourCsaMm2} non-positive`);
    }
  }
  if (errs.length > 0) {
    throw new DatasetQualityError(`Armour dataset quality check failed with ${errs.length} issue(s)`, errs);
  }
}

// ─────────────────────────────────────────────────────────────────────
// Public loader
// ─────────────────────────────────────────────────────────────────────

let CACHE: Dataset | null = null;

export function loadDataset(): Dataset {
  if (CACHE) return CACHE;

  const meta = metaJson as DatasetMeta;
  const standardSizes = standardSizesJson as StandardSizes;

  // Ampacity: Cu/PVC (Stage 1), Cu/XLPE + Al/PVC + Al/XLPE (Stage 3A),
  // Cu/PVC + Cu/XLPE 2-loaded (Stage 3B, single-phase),
  // Cu/Al × PVC/XLPE single-core 3-loaded (Stage 5A-SC-FG, Methods F + G).
  const ampCuPvc = ampCuPvcJson as AmpacityDataset;
  const ampCuXlpe = ampCuXlpeJson as AmpacityDataset;
  const ampAlPvc = ampAlPvcJson as AmpacityDataset;
  const ampAlXlpe = ampAlXlpeJson as AmpacityDataset;
  const ampCuPvc2L = ampCuPvc2LJson as AmpacityDataset;
  const ampCuXlpe2L = ampCuXlpe2LJson as AmpacityDataset;
  const ampCuPvcSC = ampCuPvcSCJson as AmpacityDataset;
  const ampCuXlpeSC = ampCuXlpeSCJson as AmpacityDataset;
  const ampAlPvcSC = ampAlPvcSCJson as AmpacityDataset;
  const ampAlXlpeSC = ampAlXlpeSCJson as AmpacityDataset;
  // Stage 5B-AMP: 60 Hz siblings (10 files, replicated values).
  const ampCuPvc60 = ampCuPvc60Json as AmpacityDataset;
  const ampCuXlpe60 = ampCuXlpe60Json as AmpacityDataset;
  const ampAlPvc60 = ampAlPvc60Json as AmpacityDataset;
  const ampAlXlpe60 = ampAlXlpe60Json as AmpacityDataset;
  const ampCuPvc2L60 = ampCuPvc2L60Json as AmpacityDataset;
  const ampCuXlpe2L60 = ampCuXlpe2L60Json as AmpacityDataset;
  const ampCuPvcSC60 = ampCuPvcSC60Json as AmpacityDataset;
  const ampCuXlpeSC60 = ampCuXlpeSC60Json as AmpacityDataset;
  const ampAlPvcSC60 = ampAlPvcSC60Json as AmpacityDataset;
  const ampAlXlpeSC60 = ampAlXlpeSC60Json as AmpacityDataset;
  const ampacityList = [
    ampCuPvc,
    ampCuXlpe,
    ampAlPvc,
    ampAlXlpe,
    ampCuPvc2L,
    ampCuXlpe2L,
    ampCuPvcSC,
    ampCuXlpeSC,
    ampAlPvcSC,
    ampAlXlpeSC,
    ampCuPvc60,
    ampCuXlpe60,
    ampAlPvc60,
    ampAlXlpe60,
    ampCuPvc2L60,
    ampCuXlpe2L60,
    ampCuPvcSC60,
    ampCuXlpeSC60,
    ampAlPvcSC60,
    ampAlXlpeSC60,
  ];

  const ambientAir = ambientAirJson as AmbientAirDataset;
  const ambientGround = ambientGroundJson as AmbientGroundDataset;
  const soilResistivity = soilResistivityJson as SoilResistivityDataset;
  const grouping = groupingJson as GroupingDataset;

  // Impedance: Cu/multicore (Stage 1), Al/multicore (Stage 3A) at 50 Hz;
  // 5B-IMP ships their 60 Hz siblings (R replicated, X = 1.2 · X50).
  const impCu = impCuJson as ImpedanceDataset;
  const impAl = impAlJson as ImpedanceDataset;
  const impCu60 = impCu60Json as ImpedanceDataset;
  const impAl60 = impAl60Json as ImpedanceDataset;
  const impedanceList = [impCu, impAl, impCu60, impAl60];

  const kValues = kValuesJson as KValuesDataset;
  const alphaCoefficients = alphaJson as AlphaCoefficientsDataset;
  const armourSwa = armourSwaJson as ArmourDataset;

  qualityCheck({
    meta,
    standardSizes,
    ampacityList,
    ambientAir,
    ambientGround,
    soilResistivity,
    grouping,
    impedanceList,
    kValues,
    alphaCoefficients,
  });
  // v1.3 Stage B: minimal armour quality check — only structural sanity,
  // since the data itself is BS 5467 placeholder (status='draft') and
  // will be re-validated in a future Sourcing pass.
  armourQualityCheck(armourSwa);

  const ds: Dataset = {
    meta,
    standardSizes,
    ampacity: { datasets: ampacityList, cuPvc3Loaded50: ampCuPvc },
    corrections: { ambientAir, ambientGround, soilResistivity, grouping },
    impedance: { datasets: impedanceList, cuMulticore50: impCu },
    shortCircuit: { kValues },
    physics: { alphaCoefficients },
    armour: { swa: armourSwa },
  };

  CACHE = Object.freeze(ds) as Dataset;
  return CACHE;
}

/** Test-only: clear the internal cache between tests. */
export function __resetDatasetCache(): void {
  CACHE = null;
}
