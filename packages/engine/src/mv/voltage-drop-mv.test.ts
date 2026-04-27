import { describe, it, expect } from 'vitest';
import { loadMvDataset } from './data-mv.js';
import { voltageDropScan } from './voltage-drop-mv.js';

describe('MV voltage drop scan', () => {
  const ds = loadMvDataset();
  const baseInput = {
    standardSizes: ds.standardSizes.sizesMm2,
    impedance: ds.impedance,
    capacitance: ds.capacitance,
    cableType: 'CNCV-W' as const,
    capacitanceOverrideUFPerKm: null,
    voltageV: 22900,
    lineToGroundV: 13200,
    powerFactor: 0.85,
    frequencyHz: 60,
    chargingCurrentThreshold: 0.01,
  };

  it('short line, low IB → smallest csa already passes', () => {
    const r = voltageDropScan({
      ...baseInput,
      startCsaMm2: 60,
      endCsaMm2: 600,
      designCurrentA: 100,
      lengthM: 500,
      maxAllowedPercent: 3,
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.selectedCSAmm2).toBe(60);
  });

  it('long heavy line forces a bump (60mm² fails 2.5% budget)', () => {
    const r = voltageDropScan({
      ...baseInput,
      startCsaMm2: 60,
      endCsaMm2: 600,
      designCurrentA: 200,
      lengthM: 5000,
      maxAllowedPercent: 2.5,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.selectedCSAmm2).toBeGreaterThan(60);
      // selection follows the smallest CSA that passes the budget
      const passes = r.candidates.filter((c) => c.pass);
      expect(passes[0]?.csaMm2).toBe(r.selectedCSAmm2);
    }
  });

  it('skips candidates below startCsaMm2', () => {
    const r = voltageDropScan({
      ...baseInput,
      startCsaMm2: 200,
      endCsaMm2: 600,
      designCurrentA: 100,
      lengthM: 500,
      maxAllowedPercent: 3,
    });
    if (r.ok) {
      expect(r.candidates[0]?.csaMm2).toBe(200);
    }
  });

  it('returns null selection when no candidate satisfies', () => {
    const r = voltageDropScan({
      ...baseInput,
      startCsaMm2: 60,
      endCsaMm2: 600,
      designCurrentA: 800,
      lengthM: 30000, // 30 km extreme
      maxAllowedPercent: 1,
    });
    if (r.ok) {
      expect(r.selectedCSAmm2).toBeNull();
      // largest candidate still over budget
      const last = r.candidates[r.candidates.length - 1]!;
      expect(last.dropPercent).toBeGreaterThan(1);
    }
  });

  it('every candidate carries reactance > 0 (MV requires reactance)', () => {
    const r = voltageDropScan({
      ...baseInput,
      startCsaMm2: 60,
      endCsaMm2: 600,
      designCurrentA: 100,
      lengthM: 1000,
      maxAllowedPercent: 3,
    });
    if (r.ok) {
      for (const c of r.candidates) {
        expect(c.xOhmPerKm).toBeGreaterThan(0);
      }
    }
  });
});
