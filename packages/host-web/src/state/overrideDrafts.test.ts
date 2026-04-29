import { describe, it, expect } from 'vitest';
import {
  EMPTY_DRAFTS,
  clearDraft,
  isOverrideFieldId,
  restoreDraft,
  setDraft,
} from './overrideDrafts.js';

describe('overrideDrafts', () => {
  it('setDraft writes a finite number and returns a new object', () => {
    const next = setDraft(EMPTY_DRAFTS, 'designCurrent', 145);
    expect(next).not.toBe(EMPTY_DRAFTS);
    expect(next.designCurrent).toBe(145);
  });

  it('setDraft is a no-op on identical value (referential stability)', () => {
    const a = setDraft(EMPTY_DRAFTS, 'designCurrent', 145);
    const b = setDraft(a, 'designCurrent', 145);
    expect(b).toBe(a);
  });

  it('setDraft rejects non-finite values', () => {
    const same = setDraft(EMPTY_DRAFTS, 'designCurrent', Number.NaN);
    expect(same).toBe(EMPTY_DRAFTS);
  });

  it('clearDraft removes a field', () => {
    const a = setDraft(EMPTY_DRAFTS, 'armourCsaMm2', 35);
    const b = clearDraft(a, 'armourCsaMm2');
    expect('armourCsaMm2' in b).toBe(false);
  });

  it('clearDraft is a no-op when the field is absent', () => {
    expect(clearDraft(EMPTY_DRAFTS, 'designCurrent')).toBe(EMPTY_DRAFTS);
  });

  it('restoreDraft returns stored value or fallback', () => {
    const a = setDraft(EMPTY_DRAFTS, 'loadedConductors', 4);
    expect(restoreDraft(a, 'loadedConductors', 3)).toBe(4);
    expect(restoreDraft(a, 'designCurrent', 100)).toBe(100);
  });

  it('isOverrideFieldId narrows correctly', () => {
    expect(isOverrideFieldId('designCurrent')).toBe(true);
    expect(isOverrideFieldId('lengthM')).toBe(false);
  });

  it('CR-OQ-4: round-trip of toggle OFF → ON restores the typed value', () => {
    // 1. user enables override and types 145 A.
    let drafts = setDraft(EMPTY_DRAFTS, 'designCurrent', 145);
    // 2. user toggles override OFF — drafts retained for the session.
    //    (i.e. host should NOT call clearDraft here.)
    const onValue = restoreDraft(drafts, 'designCurrent', 0);
    expect(onValue).toBe(145);
    // 3. user keeps editing the form unrelated; later re-enables override.
    //    drafts should still hand back 145.
    expect(restoreDraft(drafts, 'designCurrent', 0)).toBe(145);
    // Sanity: clearing actually drops it.
    drafts = clearDraft(drafts, 'designCurrent');
    expect(restoreDraft(drafts, 'designCurrent', 0)).toBe(0);
  });
});
