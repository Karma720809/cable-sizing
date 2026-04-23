/**
 * Input validation — PRD §16 E-VAL-* codes.
 *
 * Runs before any physics/lookup work. Accumulates all violations so
 * the UI can surface them at once. A single fatal error here aborts
 * the sizeCable() pipeline; the orchestrator returns a minimal
 * SizingResult with `overallStatus = 'INCOMPLETE'`.
 *
 * Validation rules (PRD §7 / §16):
 *   E-VAL-001  voltageV must be > 0
 *   E-VAL-002  powerFactor must be in (0, 1]
 *   E-VAL-003  ground install (D1/D2) but soilResistivity is null
 *   E-VAL-004  no designCurrentOverrideA and no powerKW
 *   E-VAL-005  lengthM must be > 0
 *   E-VAL-006  groupCount must be >= 1
 *   E-VAL-007  ambientTempC required (when no override path)
 *   E-VAL-008  efficiency / demandFactor out of (0, 1]
 *   E-VAL-009  maxVoltageDropPercent must be > 0
 *   E-VAL-010  invalid phase (not 1 or 3) or frequency (not 50 or 60)
 *
 * (E-DOMAIN-001 — efficiency = 0 — is subsumed by E-VAL-008.)
 */

import type { CircuitInput, EngineError } from '../types/index.js';
import { environmentOf } from '../standards/iec60364/reference-methods.js';

function push(errors: EngineError[], code: EngineError['code'], message: string, field: string): void {
  errors.push({ code, message, field, fatal: true });
}

export function validateCircuitInput(input: CircuitInput): EngineError[] {
  const errors: EngineError[] = [];

  // E-VAL-001
  if (!(input.system.voltageV > 0)) {
    push(errors, 'E-VAL-001', 'voltageV must be > 0', 'system.voltageV');
  }

  // E-VAL-010
  if (input.system.phase !== 1 && input.system.phase !== 3) {
    push(errors, 'E-VAL-010', 'system.phase must be 1 or 3', 'system.phase');
  }
  if (input.system.frequencyHz !== 50 && input.system.frequencyHz !== 60) {
    push(errors, 'E-VAL-010', 'system.frequencyHz must be 50 or 60', 'system.frequencyHz');
  }

  // E-VAL-004 / E-VAL-002 / E-VAL-008
  const hasOverride =
    input.load.designCurrentOverrideA != null && input.load.designCurrentOverrideA > 0;
  if (!hasOverride) {
    if (input.load.powerKW == null || !(input.load.powerKW > 0)) {
      push(errors, 'E-VAL-004', 'powerKW must be provided (or use designCurrentOverrideA)', 'load.powerKW');
    }
    // powerFactor (0, 1] — null is allowed (defaults resolver will fill it)
    const pf = input.load.powerFactor;
    if (pf != null && (!(pf > 0) || pf > 1)) {
      push(errors, 'E-VAL-002', 'powerFactor must be in (0, 1]', 'load.powerFactor');
    }
    // efficiency (0, 1] — null allowed (defaulted)
    const eta = input.load.efficiency;
    if (eta != null && (!(eta > 0) || eta > 1)) {
      push(errors, 'E-VAL-008', 'efficiency must be in (0, 1]', 'load.efficiency');
    }
    // demandFactor (0, 1] — null allowed (defaulted)
    const df = input.load.demandFactor;
    if (df != null && (!(df > 0) || df > 1)) {
      push(errors, 'E-VAL-008', 'demandFactor must be in (0, 1]', 'load.demandFactor');
    }
  }

  // E-VAL-005
  if (!(input.route.lengthM > 0)) {
    push(errors, 'E-VAL-005', 'route.lengthM must be > 0', 'route.lengthM');
  }

  // E-VAL-006
  if (input.installation.groupCount != null && input.installation.groupCount < 1) {
    push(errors, 'E-VAL-006', 'installation.groupCount must be >= 1', 'installation.groupCount');
  }

  // E-VAL-003 — soil required for ground methods
  if (environmentOf(input.installation.methodCode) === 'ground') {
    const soil = input.installation.soilResistivityK_m_W;
    if (soil == null || !(soil > 0)) {
      push(
        errors,
        'E-VAL-003',
        `soilResistivityK_m_W is required for ground reference methods (${input.installation.methodCode})`,
        'installation.soilResistivityK_m_W',
      );
    }
  }

  // E-VAL-009
  if (!(input.projectPolicy.maxVoltageDropPercent > 0)) {
    push(errors, 'E-VAL-009', 'maxVoltageDropPercent must be > 0', 'projectPolicy.maxVoltageDropPercent');
  }

  return errors;
}
