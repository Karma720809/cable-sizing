import { describe, it, expect } from 'vitest';
import { loadDataset } from '../../data/loader.js';
import { lookupKValue } from './k-value-lookup.js';

const ds = loadDataset();

describe('lookupKValue', () => {
  it('returns k=143 for Cu/XLPE', () => {
    const r = lookupKValue(ds, 'Cu', 'XLPE');
    expect(r.ok && r.hit.kValue).toBe(143);
    expect(r.ok && r.hit.initialTempC).toBe(90);
    expect(r.ok && r.hit.finalTempC).toBe(250);
  });

  it('returns k=115 for Cu/PVC', () => {
    const r = lookupKValue(ds, 'Cu', 'PVC');
    expect(r.ok && r.hit.kValue).toBe(115);
  });

  it('returns k=94 for Al/XLPE and k=76 for Al/PVC', () => {
    expect((lookupKValue(ds, 'Al', 'XLPE') as any).hit.kValue).toBe(94);
    expect((lookupKValue(ds, 'Al', 'PVC') as any).hit.kValue).toBe(76);
  });
});
