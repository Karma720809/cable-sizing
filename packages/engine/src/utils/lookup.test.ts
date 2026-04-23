import { describe, it, expect } from 'vitest';
import { exactOrSafeSide, exactOnly, selectFirstAtLeast, nextStandardAtLeast } from './lookup.js';

// A monotonic-derating table: as key grows, factor shrinks (e.g. ambient °C, groupCount).
const rows = [
  { k: 10, v: 1.22 },
  { k: 20, v: 1.12 },
  { k: 30, v: 1.0 },
  { k: 40, v: 0.87 },
];

describe('exactOrSafeSide', () => {
  it('returns exact match when key is in the table', () => {
    const h = exactOrSafeSide(rows, 30, (r) => r.k, (r) => r.v);
    expect(h?.matchType).toBe('exact');
    expect(h?.row.v).toBe(1.0);
  });

  it('picks the neighbor with the smaller factor on monotonic derating tables', () => {
    // target=25: neighbors 20 (1.12) and 30 (1.00). Smaller factor → 30.
    const h = exactOrSafeSide(rows, 25, (r) => r.k, (r) => r.v);
    expect(h?.matchType).toBe('safe-side');
    expect(h?.row.k).toBe(30);
    expect(h?.row.v).toBe(1.0);
  });

  it('is robust when factor is not monotonic w.r.t. key (still picks smaller factor)', () => {
    // A hypothetical non-monotonic table: target=15 between k=10 (1.22) and k=20 (1.12).
    // Safe-side: smaller factor → 1.12.
    const nonMono = [
      { k: 10, v: 1.22 },
      { k: 20, v: 1.12 },
      { k: 30, v: 1.15 }, // bump up
    ];
    const h = exactOrSafeSide(nonMono, 25, (r) => r.k, (r) => r.v);
    expect(h?.matchType).toBe('safe-side');
    expect(h?.row.v).toBe(1.12);
  });

  it('returns undefined when the target is below the smallest tabulated key', () => {
    expect(exactOrSafeSide(rows, 5, (r) => r.k, (r) => r.v)).toBeUndefined();
  });

  it('returns undefined when the target exceeds the largest tabulated key (no unsafe extrapolation)', () => {
    expect(exactOrSafeSide(rows, 999, (r) => r.k, (r) => r.v)).toBeUndefined();
  });
});

describe('exactOnly', () => {
  it('matches exact only', () => {
    expect(exactOnly(rows, 20, (r) => r.k)?.v).toBe(1.12);
    expect(exactOnly(rows, 21, (r) => r.k)).toBeUndefined();
  });
});

describe('selectFirstAtLeast / nextStandardAtLeast', () => {
  const sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300];

  it('picks next standard size ≥ threshold', () => {
    expect(nextStandardAtLeast(sizes, 13.2)).toBe(16);
    expect(nextStandardAtLeast(sizes, 16.0)).toBe(16);
    expect(nextStandardAtLeast(sizes, 16.01)).toBe(25);
  });

  it('returns undefined when threshold exceeds max size', () => {
    expect(nextStandardAtLeast(sizes, 301)).toBeUndefined();
  });

  it('selectFirstAtLeast works on ampacity rows', () => {
    const amp = [
      { csa: 1.5, iz: 13.5 },
      { csa: 2.5, iz: 18 },
      { csa: 4, iz: 24 },
    ];
    const hit = selectFirstAtLeast(amp, 20, (r) => r.iz);
    expect(hit?.csa).toBe(4);
  });
});
