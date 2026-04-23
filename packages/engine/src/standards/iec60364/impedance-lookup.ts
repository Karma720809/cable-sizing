/**
 * Impedance (R, X) lookup — PRD §11.3 / §11.4.
 *
 *   Strict exact-match on csaMm2 (§14.3). No interpolation.
 *   Resistance is at the fixed reference temperature per insulation
 *   (OQ-4): PVC=70°C, XLPE=90°C. The dataset carries `temperatureBasisC`
 *   on each resistance sub-table so future 'temperature_corrected' mode
 *   can be added without schema changes.
 */

import type { Dataset, InsulationType, ConductorMaterial, CableType, FrequencyHz, ErrorCode } from '../../types/index.js';
import { exactOnly } from '../../utils/lookup.js';

export interface ImpedanceKey {
  conductorMaterial: ConductorMaterial;
  cableType: CableType;
  frequencyHz: FrequencyHz;
  insulationType: InsulationType;
  csaMm2: number;
}

export interface ImpedanceLookupError {
  code: ErrorCode;
  message: string;
}

export interface ImpedanceHit {
  rOhmPerKm: number;
  xOhmPerKm: number;
  rTemperatureBasisC: number;
  sourceRef: string;
}

export function lookupImpedance(
  dataset: Dataset,
  key: ImpedanceKey,
): { ok: true; hit: ImpedanceHit } | { ok: false; error: ImpedanceLookupError } {
  // Stage 3A: multiple impedance datasets (Cu/multicore, Al/multicore, both 50 Hz).
  const imp = dataset.impedance.datasets.find(
    (d) =>
      d.conductorMaterial === key.conductorMaterial &&
      d.cableType === key.cableType &&
      d.frequencyHz === key.frequencyHz,
  );
  if (!imp) {
    const supported = dataset.impedance.datasets
      .map((d) => `${d.conductorMaterial}/${d.cableType}/${d.frequencyHz}Hz`)
      .join(', ');
    return {
      ok: false,
      error: {
        code: 'E-LOOKUP-003',
        message: `impedance dataset not available for ${key.conductorMaterial}/${key.cableType}/${key.frequencyHz}Hz (bundled: ${supported})`,
      },
    };
  }

  const R = imp.resistance[key.insulationType];
  const X = imp.reactance[key.insulationType];
  if (!R || !X) {
    return { ok: false, error: { code: 'E-LOOKUP-003', message: `R/X table missing for insulation ${key.insulationType}` } };
  }

  const rHit = exactOnly(R.rows, key.csaMm2, (r) => r.csaMm2);
  const xHit = exactOnly(X.rows, key.csaMm2, (r) => r.csaMm2);
  if (!rHit || !xHit) {
    return {
      ok: false,
      error: { code: 'E-LOOKUP-003', message: `impedance value missing for csa ${key.csaMm2} mm² (${key.insulationType})` },
    };
  }

  return {
    ok: true,
    hit: {
      rOhmPerKm: rHit.value,
      xOhmPerKm: xHit.value,
      rTemperatureBasisC: R.temperatureBasisC,
      sourceRef: imp.sourceRef,
    },
  };
}
