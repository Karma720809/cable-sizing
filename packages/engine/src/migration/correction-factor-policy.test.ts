/**
 * MIG-TC-02 — Legacy correction factors preservation (Patch-1).
 *
 * Decision matrix:
 *   no legacy k                → null
 *   sufficient=false, *        → legacy_preserved
 *   sufficient=true, ¬approved → legacy_preserved
 *   sufficient=true, approved  → auto_dataset (recalculated value)
 */
import { describe, it, expect, vi } from 'vitest';
import { applyCorrectionFactorPolicy } from './correction-factor-policy.js';

describe('MIG-TC-02: applyCorrectionFactorPolicy (Patch-1)', () => {
  const recalcFresh = vi.fn(() => ({ k1: 1.0, k2: 0.95, kTotal: 0.95 }));

  it('returns null when no legacy k values are present', () => {
    expect(
      applyCorrectionFactorPolicy({
        legacyKValues: undefined,
        sufficientInputsForRecalc: true,
        userApproved: true,
        recalculate: recalcFresh,
      }),
    ).toBeNull();

    expect(
      applyCorrectionFactorPolicy({
        legacyKValues: {},
        sufficientInputsForRecalc: true,
        userApproved: true,
        recalculate: recalcFresh,
      }),
    ).toBeNull();
  });

  it('preserves legacy when sufficientInputs is false (regardless of approval)', () => {
    const legacy = { k1: 0.91, k2: 0.85, kTotal: 0.77 };
    const r = applyCorrectionFactorPolicy({
      legacyKValues: legacy,
      sufficientInputsForRecalc: false,
      userApproved: true, // ignored in this branch
      recalculate: recalcFresh,
    });
    expect(r?.source).toBe('legacy_preserved');
    expect(r?.status).toBe('valid');
    expect(r?.value).toEqual({ k1: 0.91, k2: 0.85, kTotal: 0.77 });
  });

  it('preserves legacy when sufficientInputs is true but user has not approved', () => {
    const legacy = { k1: 0.91, k2: 0.85, kTotal: 0.77 };
    const r = applyCorrectionFactorPolicy({
      legacyKValues: legacy,
      sufficientInputsForRecalc: true,
      userApproved: false,
      recalculate: recalcFresh,
    });
    expect(r?.source).toBe('legacy_preserved');
    expect(r?.value).toEqual({ k1: 0.91, k2: 0.85, kTotal: 0.77 });
  });

  it('recalculates only when both sufficientInputs and userApproved are true', () => {
    const recalc = vi.fn(() => ({ k1: 1.0, k2: 0.95, kTotal: 0.95 }));
    const r = applyCorrectionFactorPolicy({
      legacyKValues: { k1: 0.91, k2: 0.85, kTotal: 0.77 },
      sufficientInputsForRecalc: true,
      userApproved: true,
      recalculate: recalc,
    });
    expect(recalc).toHaveBeenCalledOnce();
    expect(r?.source).toBe('auto_dataset');
    expect(r?.value).toEqual({ k1: 1.0, k2: 0.95, kTotal: 0.95 });
  });

  it('derives kTotal from k1·k2·k3 when only parts are present', () => {
    const r = applyCorrectionFactorPolicy({
      legacyKValues: { k1: 0.5, k2: 0.4, k3: 1.0 },
      sufficientInputsForRecalc: false,
      userApproved: false,
      recalculate: recalcFresh,
    });
    expect(r?.source).toBe('legacy_preserved');
    expect(r?.value?.kTotal).toBeCloseTo(0.2, 6);
  });

  it('does not invoke recalculate when in legacy_preserved branch', () => {
    const recalc = vi.fn();
    applyCorrectionFactorPolicy({
      legacyKValues: { kTotal: 0.5 },
      sufficientInputsForRecalc: false,
      userApproved: false,
      recalculate: recalc as () => never,
    });
    expect(recalc).not.toHaveBeenCalled();
  });
});
