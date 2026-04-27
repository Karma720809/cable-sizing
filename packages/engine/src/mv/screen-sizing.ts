/**
 * Screen short-circuit verification. Calc Spec v0.2 §7.2 + Amendment 1.
 *
 *   S_screen_required = (I_earth · √t_earth) / k_screen
 *   PASS  iff   screen_csa_mm2 ≥ S_screen_required
 *
 * Three-input policy for the (I_earth, t_earth) pair:
 *   - both provided   → compute and verify
 *   - both missing    → INCOMPLETE + W-MV-SCREEN-INCOMPLETE
 *   - exactly one     → fatal E-MV-VAL-006 (the user is asking for a check
 *                       but didn't supply enough information)
 *
 * Amendment 1 — when the user does not provide a `screenCsaMm2`, the engine
 * auto-fills it from the screen dataset using the recommended conductor
 * CSA. When the user *does* supply a value that differs from the auto-fill
 * value, both are reported and W-MV-SCREEN-OVERRIDE is emitted.
 */

import Decimal from 'decimal.js';
import { exactOnly } from '../utils/lookup.js';
import { shortCircuitCSA } from '../physics/short-circuit.js';
import type {
  MvCableType,
  MvScreenDataset,
  MvScreenStatus,
} from './types-mv.js';

export interface ScreenSizingInput {
  screen: { datasets: readonly MvScreenDataset[] };
  cableType: MvCableType;
  /** Final conductor CSA selected by the orchestrator (used to auto-fill). */
  conductorCsaMm2: number;
  /** User-supplied screen CSA override, if any. */
  screenCsaOverrideMm2: number | null | undefined;
  earthFaultKA: number | null | undefined;
  earthFaultTimeS: number | null | undefined;
  /** k value for the screen (Cu/XLPE → 143). */
  kValueScreen: number;
}

export interface ScreenSizingOk {
  ok: true;
  screenCsaMm2: number | null;
  requiredScreenCsaMm2: number | null;
  autoFilled: boolean;
  override: boolean;
  status: MvScreenStatus;
  /** Pre-formatted reason string for audit. */
  reason: string;
}

export interface ScreenSizingErr {
  ok: false;
  code: 'E-MV-LOOKUP-004' | 'E-MV-VAL-006';
  message: string;
}

export function verifyScreen(input: ScreenSizingInput): ScreenSizingOk | ScreenSizingErr {
  // 1) Resolve screen csa: override > auto-fill from dataset.
  let screenCsa: number | null = null;
  let autoFilled = false;
  let override = false;

  if (typeof input.screenCsaOverrideMm2 === 'number' && input.screenCsaOverrideMm2 > 0) {
    screenCsa = input.screenCsaOverrideMm2;
    override = true;
  } else {
    const ds = input.screen.datasets.find((d) => d.cableType === input.cableType);
    if (!ds) {
      return {
        ok: false,
        code: 'E-MV-LOOKUP-004',
        message: `No screen dataset for cableType=${input.cableType}`,
      };
    }
    const row = exactOnly(ds.rows, input.conductorCsaMm2, (r) => r.csaMm2);
    if (!row) {
      return {
        ok: false,
        code: 'E-MV-LOOKUP-004',
        message: `No screen row for csa=${input.conductorCsaMm2}mm² in ${ds.id}`,
      };
    }
    screenCsa = row.screen_csa_mm2;
    autoFilled = true;
  }

  // 2) Three-branch input policy on the earth fault pair.
  const hasI = typeof input.earthFaultKA === 'number' && Number.isFinite(input.earthFaultKA);
  const hasT = typeof input.earthFaultTimeS === 'number' && Number.isFinite(input.earthFaultTimeS);

  if (!hasI && !hasT) {
    return {
      ok: true,
      screenCsaMm2: screenCsa,
      requiredScreenCsaMm2: null,
      autoFilled,
      override,
      status: 'INCOMPLETE',
      reason: 'Earth-fault current and time both missing — screen check skipped (W-MV-SCREEN-INCOMPLETE).',
    };
  }
  if (hasI !== hasT) {
    return {
      ok: false,
      code: 'E-MV-VAL-006',
      message: 'Earth-fault current and time must both be provided (or both omitted).',
    };
  }

  // 3) Compute required screen csa via adiabatic formula (LV physics is reused).
  const ie = input.earthFaultKA! * 1000; // kA → A
  const sc = shortCircuitCSA({
    shortCircuitA: ie,
    tripTimeS: input.earthFaultTimeS!,
    kValue: input.kValueScreen,
  });
  const requiredRaw = new Decimal(sc.requiredCSARaw).toNumber();

  const status: MvScreenStatus = screenCsa >= requiredRaw ? 'PASS' : 'FAIL';
  const reason =
    status === 'PASS'
      ? `Screen CSA ${screenCsa}mm² ≥ required ${requiredRaw.toFixed(2)}mm² (Ie=${input.earthFaultKA}kA, t=${input.earthFaultTimeS}s, k=${input.kValueScreen}).`
      : `Screen CSA ${screenCsa}mm² < required ${requiredRaw.toFixed(2)}mm² — screen FAIL.`;

  return {
    ok: true,
    screenCsaMm2: screenCsa,
    requiredScreenCsaMm2: requiredRaw,
    autoFilled,
    override,
    status,
    reason,
  };
}
