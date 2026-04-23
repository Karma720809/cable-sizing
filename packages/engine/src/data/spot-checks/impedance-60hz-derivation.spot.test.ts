/**
 * Stage 5B-IMP — 50/60 Hz impedance derivation invariants.
 *
 * Policy (approved at 5B-IMP):
 *   • R (resistance): replicated value-for-value from the 50 Hz bundle,
 *     under the IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence clause
 *     for LV CSA ≤ 300 mm² (skin/proximity < 1 %).
 *   • X (reactance): derived as X60 = 1.2 · X50, from the frequency-
 *     proportional relation X = 2π·f·L with fixed cable geometry.
 *
 * These are mechanical structural invariants over every bundled 60 Hz
 * multicore dataset — they catch silent drift (e.g. a future editor
 * changing one side of the pair without the other). They do NOT validate
 * the physical clauses themselves; those are recorded in each 60 Hz
 * dataset's `sourceRef`.
 */

import { describe, it, expect } from 'vitest';
import { loadDataset } from '../loader.js';

describe('impedance 50/60 Hz derivation (Stage 5B-IMP)', () => {
  const ds = loadDataset();
  const bundles50 = ds.impedance.datasets.filter((d) => d.frequencyHz === 50);
  const bundles60 = ds.impedance.datasets.filter((d) => d.frequencyHz === 60);

  it('every 50 Hz multicore impedance dataset has a 60 Hz twin', () => {
    for (const b50 of bundles50) {
      const twin = bundles60.find(
        (b60) =>
          b60.conductorMaterial === b50.conductorMaterial &&
          b60.cableType === b50.cableType,
      );
      expect(
        twin,
        `missing 60 Hz twin for ${b50.conductorMaterial}/${b50.cableType}`,
      ).toBeDefined();
    }
  });

  it('R60 is value-for-value identical to R50 across all (insulation, csa)', () => {
    let pairsChecked = 0;
    for (const b50 of bundles50) {
      const b60 = bundles60.find(
        (b) =>
          b.conductorMaterial === b50.conductorMaterial &&
          b.cableType === b50.cableType,
      )!;
      for (const ins of ['PVC', 'XLPE'] as const) {
        const r50 = b50.resistance[ins]!;
        const r60 = b60.resistance[ins]!;
        expect(r60.temperatureBasisC).toBe(r50.temperatureBasisC);
        expect(r60.rows.length).toBe(r50.rows.length);
        for (let i = 0; i < r50.rows.length; i++) {
          expect(r60.rows[i]!.csaMm2).toBe(r50.rows[i]!.csaMm2);
          expect(r60.rows[i]!.value).toBe(r50.rows[i]!.value);
          pairsChecked++;
        }
      }
    }
    // Cu multicore carries 16 csa rows (1.5–300); Al multicore carries 11
    // (16–300, Al not standardised below 16). Two insulations each:
    // (16 + 11) × 2 = 54 pairs.
    expect(pairsChecked).toBe(54);
  });

  it('X60 ≈ 1.2 · X50 across all (insulation, csa) within 4-sig-fig tolerance', () => {
    let pairsChecked = 0;
    for (const b50 of bundles50) {
      const b60 = bundles60.find(
        (b) =>
          b.conductorMaterial === b50.conductorMaterial &&
          b.cableType === b50.cableType,
      )!;
      for (const ins of ['PVC', 'XLPE'] as const) {
        const x50 = b50.reactance[ins]!;
        const x60 = b60.reactance[ins]!;
        expect(x60.rows.length).toBe(x50.rows.length);
        for (let i = 0; i < x50.rows.length; i++) {
          expect(x60.rows[i]!.csaMm2).toBe(x50.rows[i]!.csaMm2);
          const expected = x50.rows[i]!.value * 1.2;
          const actual = x60.rows[i]!.value;
          // 4-sig-fig dataset rounding → tolerance of one LSB on the
          // rounded value, i.e. 5e-4 relative (loose bound 1e-3).
          expect(Math.abs(actual - expected) / expected).toBeLessThan(1e-3);
          pairsChecked++;
        }
      }
    }
    expect(pairsChecked).toBe(54);
  });

  it('every 60 Hz dataset carries a sourceRef recording both derivation bases', () => {
    for (const b60 of bundles60) {
      expect(b60.sourceRef).toMatch(/5B-IMP/);
      expect(b60.sourceRef).toMatch(/Annex B|equivalence/i);
      expect(b60.sourceRef).toMatch(/1\.2|X60|2.?f.?L/);
    }
  });
});
