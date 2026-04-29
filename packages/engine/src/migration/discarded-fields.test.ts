/**
 * MIG-TC-03 — capacitance / screenCsaMm2 discard (Patch-3).
 *
 * Both fields must be reported with `preservedInBackup: true` and never
 * auto-converted to armour CSA.
 */
import { describe, it, expect } from 'vitest';
import { extractDiscardedFields, DISCARDED_FIELD_NAMES } from './discarded-fields.js';

describe('MIG-TC-03: extractDiscardedFields (Patch-3)', () => {
  it('reports both capacitance and screenCsaMm2 when present and non-null', () => {
    const out = extractDiscardedFields({
      capacitance: 0.42,
      screenCsaMm2: 16,
      voltage: 415,
    });
    expect(out).toHaveLength(2);
    const ids = out.map((d) => d.fieldId).sort();
    expect(ids).toEqual(['capacitance', 'screenCsaMm2']);
    for (const d of out) {
      expect(d.reason).toBe('patch3_capacitance_screen');
      expect(d.preservedInBackup).toBe(true);
    }
  });

  it('preserves the legacy value verbatim', () => {
    const out = extractDiscardedFields({ capacitance: 0.42, screenCsaMm2: 16 });
    const cap = out.find((d) => d.fieldId === 'capacitance');
    const scr = out.find((d) => d.fieldId === 'screenCsaMm2');
    expect(cap?.legacyValue).toBe(0.42);
    expect(scr?.legacyValue).toBe(16);
  });

  it('skips fields that are null or undefined (no clutter)', () => {
    expect(extractDiscardedFields({ capacitance: null, screenCsaMm2: undefined })).toEqual([]);
  });

  it('returns empty when neither field is present', () => {
    expect(extractDiscardedFields({ voltage: 415, powerKW: 100 })).toEqual([]);
  });

  it('does not auto-convert to armour CSA — armour fields are not produced', () => {
    const out = extractDiscardedFields({ screenCsaMm2: 16 });
    expect(out.some((d) => d.fieldId === 'armourCsaMm2')).toBe(false);
  });

  it('DISCARDED_FIELD_NAMES contains only the two §12.4 fields', () => {
    expect([...DISCARDED_FIELD_NAMES].sort()).toEqual(['capacitance', 'screenCsaMm2']);
  });
});
