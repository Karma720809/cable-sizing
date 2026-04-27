import { describe, it, expect } from 'vitest';
import { evaluateMvProtection, PROTECTION_DISCLAIMER } from './protection-mv.js';

describe('MV protection coordination', () => {
  it('PASS when In ≥ IB and breaking ≥ Isc', () => {
    const r = evaluateMvProtection({
      designCurrentA: 100,
      ratedCurrentA: 200,
      breakingKA: 25,
      shortCircuitKA: 12,
    });
    expect(r.status).toBe('PASS');
    expect(r.condition1.pass).toBe(true);
    expect(r.condition2.pass).toBe(true);
  });

  it('FAIL when In < IB', () => {
    const r = evaluateMvProtection({
      designCurrentA: 200,
      ratedCurrentA: 100,
      breakingKA: 25,
      shortCircuitKA: 12,
    });
    expect(r.status).toBe('FAIL');
    expect(r.condition1.pass).toBe(false);
  });

  it('FAIL when breaking < Isc (TC-09)', () => {
    const r = evaluateMvProtection({
      designCurrentA: 100,
      ratedCurrentA: 200,
      breakingKA: 15,
      shortCircuitKA: 25,
    });
    expect(r.status).toBe('FAIL');
    expect(r.condition2.pass).toBe(false);
  });

  it('INCOMPLETE when any input is null', () => {
    const r = evaluateMvProtection({
      designCurrentA: 100,
      ratedCurrentA: null,
      breakingKA: 25,
      shortCircuitKA: 12,
    });
    expect(r.status).toBe('INCOMPLETE');
  });

  it('always carries disclaimer text', () => {
    const r = evaluateMvProtection({
      designCurrentA: 100,
      ratedCurrentA: 200,
      breakingKA: 25,
      shortCircuitKA: 12,
    });
    expect(r.disclaimer).toBe(PROTECTION_DISCLAIMER);
  });
});
