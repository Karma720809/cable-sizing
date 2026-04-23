/**
 * Spot-check fixture — Method E, Cu multicore (Stage 5A-Cu-E values rollout).
 *
 * Anchors every injected Method E row-set against the authoritative source
 * (TiSoft table_b_52_10 for Cu/PVC, table_b_52_12 for Cu/XLPE — both mirroring
 * IEC 60364-5-52 Annex B.52.10 / B.52.12 Reference Method E). Each assertion
 * pins one concrete (csaMm2, ampacityA) pair; collectively they cover:
 *   - smallest csa (1.5 mm²),
 *   - mid-range (25 mm² and 50 mm²),
 *   - largest csa (300 mm²),
 *   - cross-table invariants that differentiate Method E from Method C
 *     (free-air premium) and XLPE from PVC (90 °C vs 70 °C rating premium).
 *
 * The 400 / 500 / 630 mm² rows are intentionally OMITTED because the current
 * `standard_sizes.json` ladder ends at 300 mm²; the source marks these cells
 * as N/A for Method E multicore in any case.
 */
import { describe, it, expect } from 'vitest';
import { loadDataset } from '../loader.js';

const ds = loadDataset();

function findAmp(
  material: 'Cu' | 'Al',
  insulation: 'PVC' | 'XLPE',
  loaded: 2 | 3,
): { rows: { csaMm2: number; ampacityA: number }[]; method: string } {
  const d = ds.ampacity.datasets.find(
    (x) =>
      x.conductorMaterial === material &&
      x.insulationType === insulation &&
      x.loadedConductors === loaded,
  );
  if (!d) throw new Error(`ampacity dataset not found: ${material}/${insulation}/${loaded}L`);
  const e = d.tables['E'];
  if (!e) throw new Error(`Method E missing on ${d.id}`);
  return { rows: e.rows, method: 'E' };
}

function amp(rows: { csaMm2: number; ampacityA: number }[], csa: number): number {
  const r = rows.find((x) => x.csaMm2 === csa);
  if (!r) throw new Error(`row for csa=${csa} not found`);
  return r.ampacityA;
}

describe('spot-check — Method E, Cu/PVC multicore 3-loaded', () => {
  const { rows } = findAmp('Cu', 'PVC', 3);

  it('1.5 mm² anchor', () => expect(amp(rows, 1.5)).toBe(18.5));
  it('25 mm² mid-range', () => expect(amp(rows, 25)).toBe(101));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(153));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(497));

  it('Method E @ 50 mm² > Method C @ 50 mm² (free-air premium)', () => {
    const d = ds.ampacity.datasets.find(
      (x) => x.conductorMaterial === 'Cu' && x.insulationType === 'PVC' && x.loadedConductors === 3,
    )!;
    expect(amp(d.tables['E']!.rows, 50)).toBeGreaterThan(amp(d.tables['C']!.rows, 50));
  });
});

describe('spot-check — Method E, Cu/XLPE multicore 3-loaded', () => {
  const { rows } = findAmp('Cu', 'XLPE', 3);

  it('1.5 mm² anchor', () => expect(amp(rows, 1.5)).toBe(23));
  it('25 mm² mid-range', () => expect(amp(rows, 25)).toBe(127));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(192));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(621));

  it('Cu/XLPE Method E @ 50 mm² > Cu/PVC Method E @ 50 mm² (90 °C rating premium)', () => {
    const xlpe = findAmp('Cu', 'XLPE', 3).rows;
    const pvc = findAmp('Cu', 'PVC', 3).rows;
    expect(amp(xlpe, 50)).toBeGreaterThan(amp(pvc, 50));
  });
});

describe('spot-check — Method E, Cu/PVC multicore 2-loaded', () => {
  const { rows } = findAmp('Cu', 'PVC', 2);

  it('1.5 mm² anchor', () => expect(amp(rows, 1.5)).toBe(22));
  it('25 mm² mid-range', () => expect(amp(rows, 25)).toBe(119));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(180));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(593));

  it('2-loaded ampacity > 3-loaded ampacity at 50 mm² (Cu/PVC Method E)', () => {
    expect(amp(findAmp('Cu', 'PVC', 2).rows, 50)).toBeGreaterThan(
      amp(findAmp('Cu', 'PVC', 3).rows, 50),
    );
  });
});

describe('spot-check — Method E, Cu/XLPE multicore 2-loaded', () => {
  const { rows } = findAmp('Cu', 'XLPE', 2);

  it('1.5 mm² anchor', () => expect(amp(rows, 1.5)).toBe(26));
  it('25 mm² mid-range', () => expect(amp(rows, 25)).toBe(149));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(225));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(741));

  it('2-loaded ampacity > 3-loaded ampacity at 50 mm² (Cu/XLPE Method E)', () => {
    expect(amp(findAmp('Cu', 'XLPE', 2).rows, 50)).toBeGreaterThan(
      amp(findAmp('Cu', 'XLPE', 3).rows, 50),
    );
  });
});
