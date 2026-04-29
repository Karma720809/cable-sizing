/**
 * MIG-TC-01 — Source mapping (Patch-2).
 *
 * Spec §13.3 acceptance: Manual fields → 'user', Auto+Override → 'override'.
 */
import { describe, it, expect } from 'vitest';
import {
  mapLegacyFieldSource,
  MANUAL_FIELDS,
  AUTO_OVERRIDE_FIELDS,
} from './source-mapping.js';

describe('MIG-TC-01: mapLegacyFieldSource (Patch-2)', () => {
  it('every Manual field maps to source = user', () => {
    for (const f of MANUAL_FIELDS) {
      expect(mapLegacyFieldSource(f)).toBe('user');
    }
  });

  it('every Auto+Override field maps to source = override', () => {
    for (const f of AUTO_OVERRIDE_FIELDS) {
      expect(mapLegacyFieldSource(f)).toBe('override');
    }
  });

  it('designCurrent / loadedConductors / armourCsaMm2 specifically → override', () => {
    expect(mapLegacyFieldSource('designCurrent')).toBe('override');
    expect(mapLegacyFieldSource('loadedConductors')).toBe('override');
    expect(mapLegacyFieldSource('armourCsaMm2')).toBe('override');
  });

  it('voltage / phase / powerKW / length specifically → user', () => {
    expect(mapLegacyFieldSource('voltage')).toBe('user');
    expect(mapLegacyFieldSource('phase')).toBe('user');
    expect(mapLegacyFieldSource('powerKW')).toBe('user');
    expect(mapLegacyFieldSource('length')).toBe('user');
  });

  it('unknown fields fall back to user (conservative — disables auto-derivation)', () => {
    expect(mapLegacyFieldSource('mysteryField')).toBe('user');
    expect(mapLegacyFieldSource('')).toBe('user');
  });

  it('Manual and Auto+Override sets do not overlap', () => {
    const manual = new Set<string>(MANUAL_FIELDS);
    for (const f of AUTO_OVERRIDE_FIELDS) {
      expect(manual.has(f)).toBe(false);
    }
  });
});
