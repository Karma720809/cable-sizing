/**
 * Spot-check fixture — Method E, Al multicore (Stage 5A-Al-E values rollout).
 *
 * Anchors every injected Method E row-set against the authoritative source:
 *   - KS C IEC 60364-5-52:2009 Table B.52.11 (Al / PVC / 3-loaded / Method E,
 *     70 °C conductor, 30 °C ambient),
 *   - KS C IEC 60364-5-52:2009 Table B.52.13 (Al / XLPE or EPR / 3-loaded /
 *     Method E, 90 °C conductor, 30 °C ambient).
 *
 * The Al ampacity bundles start at 16 mm² by policy (Al cables are not
 * standardised below 16 mm² per IEC). The rollout therefore omits
 * [1.5, 2.5, 4, 6, 10] as absent-in-source and [400, 500, 630] as outside the
 * current standard_sizes.json ladder (identical policy to 5A-Cu-E).
 *
 * Anchors: smallest (16 mm²), mid-range (50 mm²), largest (300 mm²).
 * Cross-table invariants: Method E > Method C (free-air premium),
 * XLPE > PVC (90 °C rating premium), Cu > Al at identical method/insulation
 * (Al has higher resistivity ⇒ lower ampacity at the same csa).
 */
import { describe, it, expect } from 'vitest';
import { loadDataset } from '../loader.js';

const ds = loadDataset();

function findAmp(
  material: 'Cu' | 'Al',
  insulation: 'PVC' | 'XLPE',
  loaded: 2 | 3,
): { csaMm2: number; ampacityA: number }[] {
  const d = ds.ampacity.datasets.find(
    (x) =>
      x.conductorMaterial === material &&
      x.insulationType === insulation &&
      x.loadedConductors === loaded,
  );
  if (!d) throw new Error(`ampacity dataset not found: ${material}/${insulation}/${loaded}L`);
  const e = d.tables['E'];
  if (!e) throw new Error(`Method E missing on ${d.id}`);
  return e.rows;
}

function amp(rows: { csaMm2: number; ampacityA: number }[], csa: number): number {
  const r = rows.find((x) => x.csaMm2 === csa);
  if (!r) throw new Error(`row for csa=${csa} not found`);
  return r.ampacityA;
}

describe('spot-check — Method E, Al/PVC multicore 3-loaded (Table B.52.11)', () => {
  const rows = findAmp('Al', 'PVC', 3);

  it('starts at 16 mm² (no 1.5–10 mm² rows; absent in source)', () => {
    expect(rows[0]!.csaMm2).toBe(16);
    const smaller = rows.filter((r) => r.csaMm2 < 16);
    expect(smaller.length).toBe(0);
  });

  it('16 mm² anchor', () => expect(amp(rows, 16)).toBe(61));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(117));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(381));

  it('ends at 300 mm² (400/500/630 omitted by standard-size-ladder policy)', () => {
    expect(rows[rows.length - 1]!.csaMm2).toBe(300);
    const larger = rows.filter((r) => r.csaMm2 > 300);
    expect(larger.length).toBe(0);
  });

  it('Method E @ 50 mm² > Method C @ 50 mm² (free-air premium)', () => {
    const d = ds.ampacity.datasets.find(
      (x) => x.conductorMaterial === 'Al' && x.insulationType === 'PVC' && x.loadedConductors === 3,
    )!;
    expect(amp(d.tables['E']!.rows, 50)).toBeGreaterThan(amp(d.tables['C']!.rows, 50));
  });
});

describe('spot-check — Method E, Al/XLPE multicore 3-loaded (Table B.52.13)', () => {
  const rows = findAmp('Al', 'XLPE', 3);

  it('starts at 16 mm² (no 1.5–10 mm² rows; absent in source)', () => {
    expect(rows[0]!.csaMm2).toBe(16);
  });

  it('16 mm² anchor', () => expect(amp(rows, 16)).toBe(77));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(146));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(471));

  it('ends at 300 mm² (400/500/630 omitted by standard-size-ladder policy)', () => {
    expect(rows[rows.length - 1]!.csaMm2).toBe(300);
  });

  it('Al/XLPE Method E @ 50 mm² > Al/PVC Method E @ 50 mm² (90 °C rating premium)', () => {
    expect(amp(findAmp('Al', 'XLPE', 3), 50)).toBeGreaterThan(amp(findAmp('Al', 'PVC', 3), 50));
  });
});

describe('spot-check — Method E cross-material invariants (Cu > Al)', () => {
  it('Cu/PVC 3L Method E @ 50 mm² > Al/PVC 3L Method E @ 50 mm²', () => {
    expect(amp(findAmp('Cu', 'PVC', 3), 50)).toBeGreaterThan(amp(findAmp('Al', 'PVC', 3), 50));
  });

  it('Cu/XLPE 3L Method E @ 50 mm² > Al/XLPE 3L Method E @ 50 mm²', () => {
    expect(amp(findAmp('Cu', 'XLPE', 3), 50)).toBeGreaterThan(amp(findAmp('Al', 'XLPE', 3), 50));
  });
});
