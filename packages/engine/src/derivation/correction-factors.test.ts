import { describe, it, expect } from 'vitest';
import { loadDataset } from '../data/loader.js';
import { deriveCorrectionFactors } from './correction-factors.js';
import type { CircuitInput } from '../types/index.js';

const ds = loadDataset();

const BASE: CircuitInput = {
  load: {
    type: 'general',
    powerKW: 25,
    powerFactor: 0.85,
    efficiency: 0.9,
    demandFactor: 1.0,
  },
  system: { voltageV: 400, phase: 3, frequencyHz: 50 },
  cable: {
    conductorMaterial: 'Cu',
    insulationType: 'PVC',
    coreConfiguration: '3C+N',
    cableType: 'multicore',
  },
  installation: { methodCode: 'C', ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 1 },
  route: { lengthM: 50 },
  protection: {
    deviceType: 'MCB',
    ratedCurrentA: 50,
    operatingCurrentI2A: 72.5,
    tripTimeS: 0.1,
    shortCircuitKA: 10,
  },
  projectPolicy: {
    maxVoltageDropPercent: 5,
    useReactance: false,
    resistanceModel: 'fixed_reference',
    roundingPolicy: 'next_standard_csa',
  },
};

describe('deriveCorrectionFactors', () => {
  it('returns auto_dataset FieldState for each factor at base conditions', () => {
    const r = deriveCorrectionFactors(BASE, ds);
    expect(r.error).toBeUndefined();
    expect(r.fieldStates.k1.source).toBe('auto_dataset');
    expect(r.fieldStates.k2.source).toBe('auto_dataset');
    expect(r.fieldStates.k3.source).toBe('auto_dataset');
    // At 30°C/PVC base + soil-irrelevant (air) + groupCount=1, factors are 1.0
    expect(r.fieldStates.k1.value).toBe(1.0);
    expect(r.fieldStates.k2.value).toBe(1.0);
    expect(r.fieldStates.k3.value).toBe(1.0);
  });

  it('kTotal source = auto_formula and equals k1·k2·k3', () => {
    const r = deriveCorrectionFactors(BASE, ds);
    expect(r.fieldStates.kTotal.source).toBe('auto_formula');
    expect(r.fieldStates.kTotal.formula).toBe('k_total = k1·k2·k3');
    expect(r.fieldStates.kTotal.value).toBe(1.0);
    expect(r.fieldStates.kTotal.inputs).toEqual({ k1: 1, k2: 1, k3: 1 });
  });

  it('FieldState carries datasetRef for each factor', () => {
    const r = deriveCorrectionFactors(BASE, ds);
    expect(r.fieldStates.k1.datasetRef).toBe('iec60364_lv_v1.corrections.ambient');
    expect(r.fieldStates.k2.datasetRef).toBe('iec60364_lv_v1.corrections.soilResistivity');
    expect(r.fieldStates.k3.datasetRef).toBe('iec60364_lv_v1.corrections.grouping');
  });

  it('elevated ambient produces k1 < 1.0 at non-base temp (e.g. 50°C/PVC)', () => {
    const r = deriveCorrectionFactors(
      { ...BASE, installation: { ...BASE.installation, ambientTempC: 50 } },
      ds,
    );
    expect(r.fieldStates.k1.source).toBe('auto_dataset');
    expect(r.fieldStates.k1.value).toBeLessThan(1.0);
    expect(r.fieldStates.k1.value).toBeGreaterThan(0.5);
  });

  it('returns incomplete FieldStates + error when grouping > tabulated range', () => {
    const r = deriveCorrectionFactors(
      { ...BASE, installation: { ...BASE.installation, groupCount: 999 } },
      ds,
    );
    expect(r.error).toBeDefined();
    expect(r.error?.code).toBe('E-LOOKUP-002');
    expect(r.fieldStates.k1.status).toBe('incomplete');
    expect(r.fieldStates.kTotal.status).toBe('incomplete');
  });

  it('combined.total matches kTotal.value', () => {
    const r = deriveCorrectionFactors(BASE, ds);
    expect(r.combined?.total).toBe(r.fieldStates.kTotal.value);
  });
});
