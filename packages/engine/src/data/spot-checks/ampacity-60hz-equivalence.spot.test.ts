/**
 * Stage 5B-AMP — 50/60 Hz ampacity equivalence invariant.
 *
 * IEC 60364-5-52:2009 Annex B tabulates ampacities for LV installations;
 * the standard permits identical values at 60 Hz for conductor cross
 * sections ≤ 300 mm² (skin/proximity effects negligible in this range).
 * We therefore ship the 60 Hz ampacity bundle as a **value-for-value
 * replica** of the 50 Hz bundle.
 *
 * This test is a mechanical structural invariant:
 *   for every (material, insulation, loadedConductors, cableType, method,
 *   csaMm2) key present at 50 Hz, the ampacity at 60 Hz must be exactly
 *   the same number.
 *
 * It does NOT validate the equivalence clause itself — that is a
 * standards-level statement recorded in each 60 Hz dataset's `sourceRef`.
 * This test's job is to guard against silent drift (e.g. a future editor
 * tweaking only one side of the pair).
 */

import { describe, it, expect } from 'vitest';
import { loadDataset } from '../loader.js';
import { resolveAmpacityRows, ampacityAtCsa } from '../../standards/iec60364/ampacity-lookup.js';
import type {
  AmpacityDataset,
  ConductorMaterial,
  InsulationType,
  CableType,
  ReferenceMethod,
} from '../../types/index.js';

describe('ampacity 50/60 Hz equivalence (Stage 5B-AMP)', () => {
  const ds = loadDataset();
  const ampacity = ds.ampacity.datasets;

  const bundles50 = ampacity.filter((d) => d.frequencyHz === 50);
  const bundles60 = ampacity.filter((d) => d.frequencyHz === 60);

  it('has the same number of 50 Hz and 60 Hz ampacity datasets', () => {
    expect(bundles50.length).toBeGreaterThan(0);
    expect(bundles60.length).toBe(bundles50.length);
  });

  it('bundles 20 ampacity datasets total (10 @ 50 Hz + 10 @ 60 Hz)', () => {
    expect(ampacity.length).toBe(20);
    expect(bundles50.length).toBe(10);
    expect(bundles60.length).toBe(10);
  });

  /**
   * For each 50 Hz dataset, find its 60 Hz twin and assert that every
   * (method, csaMm2) pair exists on both sides with identical ampacityA.
   */
  it('every 50 Hz (method, csa) pair has an identical 60 Hz twin', () => {
    const checked: string[] = [];
    const mismatches: string[] = [];

    for (const d50 of bundles50) {
      const twin = bundles60.find(
        (d60) =>
          d60.conductorMaterial === d50.conductorMaterial &&
          d60.insulationType === d50.insulationType &&
          d60.loadedConductors === d50.loadedConductors &&
          d60.cableType === d50.cableType,
      );
      if (!twin) {
        mismatches.push(
          `no 60 Hz twin for ${d50.conductorMaterial}/${d50.insulationType}/${d50.loadedConductors}L/${d50.cableType}`,
        );
        continue;
      }

      // Same set of methods
      const m50 = Object.keys(d50.tables).sort();
      const m60 = Object.keys(twin.tables).sort();
      if (m50.join(',') !== m60.join(',')) {
        mismatches.push(
          `method set diverges for ${d50.conductorMaterial}/${d50.insulationType}/${d50.loadedConductors}L/${d50.cableType}: 50Hz=[${m50.join(',')}] vs 60Hz=[${m60.join(',')}]`,
        );
        continue;
      }

      // Each (method, csa) → ampacity identical
      for (const m of m50) {
        const t50 = d50.tables[m as ReferenceMethod]!.rows;
        const t60 = twin.tables[m as ReferenceMethod]!.rows;
        if (t50.length !== t60.length) {
          mismatches.push(
            `row count diverges for ${d50.id}/${m}: 50Hz=${t50.length} vs 60Hz=${t60.length}`,
          );
          continue;
        }
        for (let i = 0; i < t50.length; i++) {
          const r50 = t50[i]!;
          const r60 = t60[i]!;
          if (r50.csaMm2 !== r60.csaMm2) {
            mismatches.push(
              `${d50.id}/${m}[${i}]: csa diverges 50Hz=${r50.csaMm2} vs 60Hz=${r60.csaMm2}`,
            );
            continue;
          }
          if (r50.ampacityA !== r60.ampacityA) {
            mismatches.push(
              `${d50.id}/${m}@${r50.csaMm2}mm²: ampacity diverges 50Hz=${r50.ampacityA} vs 60Hz=${r60.ampacityA}`,
            );
            continue;
          }
          checked.push(`${d50.id}/${m}@${r50.csaMm2}`);
        }
      }
    }

    expect(mismatches).toEqual([]);
    // Sanity: we actually compared a meaningful number of points. As of
    // 5B-AMP (0.8.0), the 50 Hz bundle expands to:
    //   Cu MC 3L (PVC, XLPE): 2 × 8 methods × 16 csa = 256
    //   Cu MC 2L (PVC, XLPE): 2 × 8 methods × 16 csa = 256
    //   Al MC 3L (PVC, XLPE): 2 × 8 methods × 11 csa = 176
    //   SC 3L (Cu/Al × PVC/XLPE): 4 × 2 methods × 10 csa = 80
    //   ─────────────────────────────────────────────────────
    //   Total shared (csa, method) points: 768
    expect(checked.length).toBe(768);
  });

  /**
   * End-to-end lookup parity: go through the public `lookupAmpacity`
   * entry point (not just the dataset rows) so the frequency-axis routing
   * path itself is exercised.
   */
  it('lookupAmpacity returns identical values at 50 Hz and 60 Hz for anchor keys', () => {
    type Anchor = {
      material: ConductorMaterial;
      insulation: InsulationType;
      loaded: 2 | 3;
      cableType: CableType;
      method: ReferenceMethod;
      csa: number;
    };
    const anchors: Anchor[] = [
      // Cu multicore 3L
      { material: 'Cu', insulation: 'PVC', loaded: 3, cableType: 'multicore', method: 'C', csa: 1.5 },
      { material: 'Cu', insulation: 'PVC', loaded: 3, cableType: 'multicore', method: 'C', csa: 50 },
      { material: 'Cu', insulation: 'PVC', loaded: 3, cableType: 'multicore', method: 'E', csa: 300 },
      { material: 'Cu', insulation: 'XLPE', loaded: 3, cableType: 'multicore', method: 'D1', csa: 70 },
      // Cu multicore 2L
      { material: 'Cu', insulation: 'PVC', loaded: 2, cableType: 'multicore', method: 'C', csa: 10 },
      { material: 'Cu', insulation: 'XLPE', loaded: 2, cableType: 'multicore', method: 'B1', csa: 35 },
      // Al multicore 3L
      { material: 'Al', insulation: 'PVC', loaded: 3, cableType: 'multicore', method: 'C', csa: 16 },
      { material: 'Al', insulation: 'XLPE', loaded: 3, cableType: 'multicore', method: 'E', csa: 240 },
      // Cu/Al single-core 3L (F + G)
      { material: 'Cu', insulation: 'PVC', loaded: 3, cableType: 'single-core', method: 'F', csa: 25 },
      { material: 'Cu', insulation: 'XLPE', loaded: 3, cableType: 'single-core', method: 'G', csa: 120 },
      { material: 'Al', insulation: 'PVC', loaded: 3, cableType: 'single-core', method: 'F', csa: 95 },
      { material: 'Al', insulation: 'XLPE', loaded: 3, cableType: 'single-core', method: 'G', csa: 300 },
    ];

    for (const a of anchors) {
      const r50 = resolveAmpacityRows(ds, {
        conductorMaterial: a.material,
        insulationType: a.insulation,
        loadedConductors: a.loaded,
        cableType: a.cableType,
        frequencyHz: 50,
        method: a.method,
      });
      const r60 = resolveAmpacityRows(ds, {
        conductorMaterial: a.material,
        insulationType: a.insulation,
        loadedConductors: a.loaded,
        cableType: a.cableType,
        frequencyHz: 60,
        method: a.method,
      });
      expect(r50.ok, `50 Hz resolve failed for ${JSON.stringify(a)}`).toBe(true);
      expect(r60.ok, `60 Hz resolve failed for ${JSON.stringify(a)}`).toBe(true);
      if (r50.ok && r60.ok) {
        const v50 = ampacityAtCsa(r50.rows, a.csa);
        const v60 = ampacityAtCsa(r60.rows, a.csa);
        expect(v50, `no 50 Hz row @${a.csa} mm² for ${JSON.stringify(a)}`).toBeDefined();
        expect(v60).toBe(v50);
      }
    }
  });

  it('every 60 Hz dataset carries the 5B-AMP equivalence note in sourceRef', () => {
    for (const d of bundles60) {
      expect(d.sourceRef).toMatch(/\[5B-AMP:/);
      expect(d.sourceRef).toMatch(/50\/60 Hz equivalence/);
    }
  });

  it('every 60 Hz dataset has frequencyHz === 60 and a unique id', () => {
    const ids = new Set<string>();
    for (const d of bundles60 as AmpacityDataset[]) {
      expect(d.frequencyHz).toBe(60);
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
    }
  });
});
