import { describe, it, expect } from 'vitest';
import { loadMvDataset } from './data-mv.js';
import { verifyScreen } from './screen-sizing.js';

describe('MV screen sizing', () => {
  const ds = loadMvDataset();
  const k = 143;

  it('auto-fills screen csa from dataset when override absent', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 200,
      screenCsaOverrideMm2: null,
      earthFaultKA: 5,
      earthFaultTimeS: 0.5,
      kValueScreen: k,
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.autoFilled).toBe(true);
      expect(r.screenCsaMm2).toBe(45); // CNCV-W 200mm² → 45mm² screen
    }
  });

  it('PASS when screen ≥ required (lo Ie)', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 250,
      screenCsaOverrideMm2: null,
      earthFaultKA: 5,
      earthFaultTimeS: 0.5,
      kValueScreen: k,
    });
    if (r.ok) {
      // required = 5000·√0.5/143 ≈ 24.7mm² < 83mm² screen
      expect(r.status).toBe('PASS');
    }
  });

  it('FAIL when screen < required (heavy Ie)', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 60,
      screenCsaOverrideMm2: null,
      earthFaultKA: 10,
      earthFaultTimeS: 0.5,
      kValueScreen: k,
    });
    if (r.ok) {
      // required = 10000·√0.5/143 ≈ 49.4mm² > 22mm² screen
      expect(r.status).toBe('FAIL');
      expect(r.screenCsaMm2).toBe(22);
    }
  });

  it('INCOMPLETE when both Ie and t omitted', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 200,
      screenCsaOverrideMm2: null,
      earthFaultKA: null,
      earthFaultTimeS: null,
      kValueScreen: k,
    });
    if (r.ok) expect(r.status).toBe('INCOMPLETE');
  });

  it('E-MV-VAL-006 when only one of Ie / t given', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 200,
      screenCsaOverrideMm2: null,
      earthFaultKA: 5,
      earthFaultTimeS: null,
      kValueScreen: k,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('E-MV-VAL-006');
  });

  it('user override supersedes auto-fill (override flag set)', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 200,
      screenCsaOverrideMm2: 95,
      earthFaultKA: 5,
      earthFaultTimeS: 0.5,
      kValueScreen: k,
    });
    if (r.ok) {
      expect(r.override).toBe(true);
      expect(r.autoFilled).toBe(false);
      expect(r.screenCsaMm2).toBe(95);
    }
  });

  it('missing screen row → E-MV-LOOKUP-004', () => {
    const r = verifyScreen({
      screen: ds.screen,
      cableType: 'CNCV-W',
      conductorCsaMm2: 75, // not in table
      screenCsaOverrideMm2: null,
      earthFaultKA: 5,
      earthFaultTimeS: 0.5,
      kValueScreen: k,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('E-MV-LOOKUP-004');
  });
});
