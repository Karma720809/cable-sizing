import { describe, it, expect } from 'vitest';
import { FieldStateBuilder, type FieldState } from './field-state.js';

describe('FieldStateBuilder', () => {
  it('autoFormula carries formula id and input snapshot', () => {
    const s = FieldStateBuilder.autoFormula(126.06, 'IB_3PH_KW', {
      P_kW: 75,
      V: 380,
      cosphi: 0.85,
    });
    expect(s.source).toBe('auto_formula');
    expect(s.status).toBe('valid');
    expect(s.value).toBe(126.06);
    expect(s.formula).toBe('IB_3PH_KW');
    expect(s.inputs).toEqual({ P_kW: 75, V: 380, cosphi: 0.85 });
  });

  it('autoDataset records datasetRef without formula', () => {
    const s = FieldStateBuilder.autoDataset(0.94, 'iec60364_lv_v1.corrections.ambientAir');
    expect(s.source).toBe('auto_dataset');
    expect(s.status).toBe('valid');
    expect(s.value).toBe(0.94);
    expect(s.datasetRef).toBe('iec60364_lv_v1.corrections.ambientAir');
    expect(s.formula).toBeUndefined();
  });

  it('user is valid + source=user', () => {
    const s = FieldStateBuilder.user(380);
    expect(s).toEqual({ source: 'user', status: 'valid', value: 380 });
  });

  it('override sets reason=override_applied and accepts timestamp', () => {
    const ts = '2026-04-28T07:44:00Z';
    const s = FieldStateBuilder.override(150, ts);
    expect(s.source).toBe('override');
    expect(s.status).toBe('valid');
    expect(s.value).toBe(150);
    expect(s.reason).toBe('override_applied');
    expect(s.overriddenAt).toBe(ts);
  });

  it('override without timestamp omits overriddenAt key', () => {
    const s = FieldStateBuilder.override(150);
    expect(s.overriddenAt).toBeUndefined();
  });

  it('legacyPreserved tags reason for migration UI', () => {
    const s = FieldStateBuilder.legacyPreserved(0.77);
    expect(s.source).toBe('legacy_preserved');
    expect(s.status).toBe('valid');
    expect(s.reason).toBe('legacy_preserved_no_recalc');
  });

  it('incomplete defaults to missing_input', () => {
    const s = FieldStateBuilder.incomplete();
    expect(s.status).toBe('incomplete');
    expect(s.value).toBeNull();
    expect(s.reason).toBe('missing_input');
  });

  it('unavailable defaults to not_applicable', () => {
    const s = FieldStateBuilder.unavailable();
    expect(s.status).toBe('unavailable');
    expect(s.value).toBeNull();
    expect(s.reason).toBe('not_applicable');
  });

  it('preserves generic value type at the type level', () => {
    const num: FieldState<number> = FieldStateBuilder.autoFormula(1, 'F', {});
    const str: FieldState<string> = FieldStateBuilder.user('value');
    const bool: FieldState<boolean> = FieldStateBuilder.override(true);
    expect(typeof num.value).toBe('number');
    expect(typeof str.value).toBe('string');
    expect(typeof bool.value).toBe('boolean');
  });
});
