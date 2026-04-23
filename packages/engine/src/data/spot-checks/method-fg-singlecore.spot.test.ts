/**
 * Spot-check fixture — Methods F and G, single-core (Stage 5A-SC-FG values rollout).
 *
 * Anchors every injected F/G row-set against the authoritative source:
 *   - IEC 60364-5-52:2009 Table B.52.10 (Cu/PVC, cols. 5+7),
 *   - IEC 60364-5-52:2009 Table B.52.11 (Al/PVC, cols. 5+7),
 *   - IEC 60364-5-52:2009 Table B.52.12 (Cu/XLPE-EPR, cols. 5+7),
 *   - IEC 60364-5-52:2009 Table B.52.13 (Al/XLPE-EPR, cols. 5+7),
 *
 * where column 5 is the Method F arrangement (touching trefoil) and column 7
 * is the Method G arrangement (spaced flat horizontal 1 × De). All datasets
 * are single-core, 3 loaded conductors, 50 Hz.
 *
 * csa ladder policy (applied uniformly to every dataset):
 *   - Cu: inject 25–300 mm². [1.5, 2.5, 4, 6, 10, 16] are N/A in source;
 *     [400, 500, 630] have source values but lie outside the engine's
 *     `standard_sizes.json` ladder (terminates at 300).
 *   - Al: inject 25–300 mm². [16] is N/A in source (Al not standardised
 *     below 16 mm² — but the 16 mm² row itself is N/A for single-core F/G);
 *     [400, 500, 630] have source values but are outside the ladder.
 *
 * Cross-axis invariants verified:
 *   - Method G > Method F at identical csa (spaced beats touching).
 *   - Method F/G on single-core > Method E on multicore for the same
 *     material/insulation at identical csa (less mutual heating).
 *   - Cu > Al at identical method/insulation/csa.
 *   - XLPE > PVC at identical method/material/csa.
 */
import { describe, it, expect } from 'vitest';
import { loadDataset } from '../loader.js';

const ds = loadDataset();

function sc(
  material: 'Cu' | 'Al',
  insulation: 'PVC' | 'XLPE',
  method: 'F' | 'G',
): { csaMm2: number; ampacityA: number }[] {
  const d = ds.ampacity.datasets.find(
    (x) =>
      x.conductorMaterial === material &&
      x.insulationType === insulation &&
      x.loadedConductors === 3 &&
      x.cableType === 'single-core',
  );
  if (!d) throw new Error(`single-core dataset not found: ${material}/${insulation}/3L`);
  const t = d.tables[method];
  if (!t) throw new Error(`Method ${method} missing on ${d.id}`);
  return t.rows;
}

function mcE(
  material: 'Cu' | 'Al',
  insulation: 'PVC' | 'XLPE',
): { csaMm2: number; ampacityA: number }[] {
  const d = ds.ampacity.datasets.find(
    (x) =>
      x.conductorMaterial === material &&
      x.insulationType === insulation &&
      x.loadedConductors === 3 &&
      x.cableType === 'multicore',
  );
  if (!d) throw new Error(`multicore dataset not found: ${material}/${insulation}/3L`);
  return d.tables['E']!.rows;
}

function amp(rows: { csaMm2: number; ampacityA: number }[], csa: number): number {
  const r = rows.find((x) => x.csaMm2 === csa);
  if (!r) throw new Error(`row for csa=${csa} not found`);
  return r.ampacityA;
}

// ── Cu / PVC ────────────────────────────────────────────────────────────
describe('spot-check — Method F, Cu/PVC single-core 3-loaded (Table B.52.10 col.5)', () => {
  const rows = sc('Cu', 'PVC', 'F');
  it('starts at 25 mm² (1.5–16 mm² N/A in source)', () =>
    expect(rows[0]!.csaMm2).toBe(25));
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(110));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(167));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(561));
  it('ends at 300 mm² (400/500/630 outside ladder)', () =>
    expect(rows[rows.length - 1]!.csaMm2).toBe(300));
});

describe('spot-check — Method G, Cu/PVC single-core 3-loaded (Table B.52.10 col.7)', () => {
  const rows = sc('Cu', 'PVC', 'G');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(146));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(219));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(709));
  it('Method G @ 50 mm² > Method F @ 50 mm² (spaced beats touching)', () => {
    expect(amp(sc('Cu', 'PVC', 'G'), 50)).toBeGreaterThan(amp(sc('Cu', 'PVC', 'F'), 50));
  });
});

// ── Cu / XLPE ───────────────────────────────────────────────────────────
describe('spot-check — Method F, Cu/XLPE single-core 3-loaded (Table B.52.12 col.5)', () => {
  const rows = sc('Cu', 'XLPE', 'F');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(135));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(207));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(703));
  it('Cu/XLPE F @ 50 mm² > Cu/PVC F @ 50 mm² (90 °C rating premium)', () => {
    expect(amp(sc('Cu', 'XLPE', 'F'), 50)).toBeGreaterThan(amp(sc('Cu', 'PVC', 'F'), 50));
  });
});

describe('spot-check — Method G, Cu/XLPE single-core 3-loaded (Table B.52.12 col.7)', () => {
  const rows = sc('Cu', 'XLPE', 'G');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(182));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(275));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(902));
  it('Method G @ 50 mm² > Method F @ 50 mm² (spaced beats touching)', () => {
    expect(amp(sc('Cu', 'XLPE', 'G'), 50)).toBeGreaterThan(amp(sc('Cu', 'XLPE', 'F'), 50));
  });
});

// ── Al / PVC ────────────────────────────────────────────────────────────
describe('spot-check — Method F, Al/PVC single-core 3-loaded (Table B.52.11 col.5)', () => {
  const rows = sc('Al', 'PVC', 'F');
  it('starts at 25 mm² (1.5–10 mm² absent; 16 mm² N/A in source)', () =>
    expect(rows[0]!.csaMm2).toBe(25));
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(84));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(128));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(434));
  it('Cu/PVC F @ 50 mm² > Al/PVC F @ 50 mm² (Cu lower resistivity)', () => {
    expect(amp(sc('Cu', 'PVC', 'F'), 50)).toBeGreaterThan(amp(sc('Al', 'PVC', 'F'), 50));
  });
});

describe('spot-check — Method G, Al/PVC single-core 3-loaded (Table B.52.11 col.7)', () => {
  const rows = sc('Al', 'PVC', 'G');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(112));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(169));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(557));
  it('Method G @ 50 mm² > Method F @ 50 mm² (spaced beats touching)', () => {
    expect(amp(sc('Al', 'PVC', 'G'), 50)).toBeGreaterThan(amp(sc('Al', 'PVC', 'F'), 50));
  });
});

// ── Al / XLPE ───────────────────────────────────────────────────────────
describe('spot-check — Method F, Al/XLPE single-core 3-loaded (Table B.52.13 col.5)', () => {
  const rows = sc('Al', 'XLPE', 'F');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(103));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(159));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(547));
  it('Al/XLPE F @ 50 mm² > Al/PVC F @ 50 mm² (90 °C rating premium)', () => {
    expect(amp(sc('Al', 'XLPE', 'F'), 50)).toBeGreaterThan(amp(sc('Al', 'PVC', 'F'), 50));
  });
});

describe('spot-check — Method G, Al/XLPE single-core 3-loaded (Table B.52.13 col.7)', () => {
  const rows = sc('Al', 'XLPE', 'G');
  it('25 mm² anchor', () => expect(amp(rows, 25)).toBe(138));
  it('50 mm² mid-range', () => expect(amp(rows, 50)).toBe(210));
  it('300 mm² anchor', () => expect(amp(rows, 300)).toBe(708));
  it('Method G @ 50 mm² > Method F @ 50 mm² (spaced beats touching)', () => {
    expect(amp(sc('Al', 'XLPE', 'G'), 50)).toBeGreaterThan(amp(sc('Al', 'XLPE', 'F'), 50));
  });
});

// ── Cross-axis invariants: single-core vs multicore ────────────────────
describe('spot-check — SC-FG cross-axis invariants (SC free-air > MC bundled)', () => {
  it('Cu/PVC  SC Method G @ 50 mm² > MC Method E @ 50 mm²', () => {
    expect(amp(sc('Cu', 'PVC', 'G'), 50)).toBeGreaterThan(amp(mcE('Cu', 'PVC'), 50));
  });
  it('Cu/XLPE SC Method G @ 50 mm² > MC Method E @ 50 mm²', () => {
    expect(amp(sc('Cu', 'XLPE', 'G'), 50)).toBeGreaterThan(amp(mcE('Cu', 'XLPE'), 50));
  });
  it('Al/PVC  SC Method G @ 50 mm² > MC Method E @ 50 mm²', () => {
    expect(amp(sc('Al', 'PVC', 'G'), 50)).toBeGreaterThan(amp(mcE('Al', 'PVC'), 50));
  });
  it('Al/XLPE SC Method G @ 50 mm² > MC Method E @ 50 mm²', () => {
    expect(amp(sc('Al', 'XLPE', 'G'), 50)).toBeGreaterThan(amp(mcE('Al', 'XLPE'), 50));
  });
});
