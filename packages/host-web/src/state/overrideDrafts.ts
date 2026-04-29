/**
 * Override drafts — session-only memory of values the user typed into an
 * override input while the override toggle was ON. CR-OQ-4 in the LV
 * design change requires that toggling the override OFF and back ON
 * restores the previously typed value, but does *not* persist that value
 * across page reloads.
 *
 * Implementation choices that follow from CR-OQ-4 + the host's existing
 * patterns:
 *   - Plain object keyed by `fieldId` (stable id from the engine, e.g.
 *     'designCurrent'). React state lives in App.tsx via `useState`.
 *   - No serialization helpers — the drafts are intentionally not
 *     persisted; nothing here writes to localStorage.
 *   - Pure functions (no React, no DOM) so vitest can cover them in
 *     plain Node.
 */

export type OverrideFieldId = 'designCurrent' | 'loadedConductors' | 'armourCsaMm2';

export interface OverrideDrafts {
  designCurrent?: number;
  loadedConductors?: number;
  armourCsaMm2?: number;
}

export const EMPTY_DRAFTS: OverrideDrafts = Object.freeze({});

/** Returns a new drafts object with `fieldId` set to `value`. */
export function setDraft<F extends OverrideFieldId>(
  drafts: OverrideDrafts,
  fieldId: F,
  value: number,
): OverrideDrafts {
  if (!Number.isFinite(value)) return drafts;
  if (drafts[fieldId] === value) return drafts;
  return { ...drafts, [fieldId]: value };
}

/**
 * Returns a new drafts object with `fieldId` removed. Call when the user
 * actively clears the override (vs. just toggling it off — see
 * `restoreDraft` for the toggle case).
 */
export function clearDraft(drafts: OverrideDrafts, fieldId: OverrideFieldId): OverrideDrafts {
  if (!(fieldId in drafts)) return drafts;
  const next = { ...drafts };
  delete next[fieldId];
  return next;
}

/**
 * Returns the previously-stored draft for `fieldId`, or `fallback` if no
 * draft exists. Used by OverrideToggle when re-enabling the override —
 * we want the input to repopulate with the last value the user typed.
 */
export function restoreDraft(
  drafts: OverrideDrafts,
  fieldId: OverrideFieldId,
  fallback: number,
): number {
  const v = drafts[fieldId];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

/** Type guard for the limited fieldId set. */
export function isOverrideFieldId(s: string): s is OverrideFieldId {
  return s === 'designCurrent' || s === 'loadedConductors' || s === 'armourCsaMm2';
}
