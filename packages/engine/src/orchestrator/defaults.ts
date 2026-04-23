/**
 * Defaults resolver — PRD §13.1 (priority table).
 *
 * Purpose: fill in optional-but-nullable inputs with conservative defaults.
 * Any applied default emits a `W-DEFAULT-APPLIED` warning whose `field`
 * identifies what was defaulted, so the UI / report can annotate the
 * corresponding input cell.
 *
 * Defaults (when caller left the field null/undefined):
 *   load.powerFactor       → 0.85
 *   load.efficiency        → 0.90
 *   load.demandFactor      → 1.00
 *   installation.ambientTempC → 30 (air) / 20 (ground)
 *   installation.groupCount   → 1
 *
 * This runs AFTER validation. The resolver never mutates its input; it
 * returns a structurally cloned CircuitInput with null-holes filled.
 */

import type { CircuitInput, Warning } from '../types/index.js';
import { environmentOf } from '../standards/iec60364/reference-methods.js';

export interface DefaultsResult {
  resolved: CircuitInput;
  warnings: Warning[];
}

function warn(field: string, value: number, defaultedFor: string): Warning {
  return {
    code: 'W-DEFAULT-APPLIED',
    message: `${defaultedFor} defaulted to ${value}`,
    field,
  };
}

export function applyDefaults(input: CircuitInput): DefaultsResult {
  const warnings: Warning[] = [];

  // Clone (shallow per group is fine — nested objects get replaced below).
  const resolved: CircuitInput = {
    ...input,
    load: { ...input.load },
    system: { ...input.system },
    cable: { ...input.cable },
    installation: { ...input.installation },
    route: { ...input.route },
    protection: { ...input.protection },
    projectPolicy: { ...input.projectPolicy },
  };

  // Load: only default when override is not in use. If override is used,
  // PF/η/df are irrelevant — leave untouched.
  const hasOverride =
    resolved.load.designCurrentOverrideA != null && resolved.load.designCurrentOverrideA > 0;
  if (!hasOverride) {
    if (resolved.load.powerFactor == null) {
      resolved.load.powerFactor = 0.85;
      warnings.push(warn('load.powerFactor', 0.85, 'load.powerFactor'));
    }
    if (resolved.load.efficiency == null) {
      resolved.load.efficiency = 0.9;
      warnings.push(warn('load.efficiency', 0.9, 'load.efficiency'));
    }
    if (resolved.load.demandFactor == null) {
      resolved.load.demandFactor = 1.0;
      warnings.push(warn('load.demandFactor', 1.0, 'load.demandFactor'));
    }
  }

  // Ambient temp — default depends on air/ground.
  if (resolved.installation.ambientTempC == null) {
    const env = environmentOf(resolved.installation.methodCode);
    const def = env === 'ground' ? 20 : 30;
    resolved.installation.ambientTempC = def;
    warnings.push(warn('installation.ambientTempC', def, 'installation.ambientTempC'));
  }

  // groupCount
  if (resolved.installation.groupCount == null) {
    resolved.installation.groupCount = 1;
    warnings.push(warn('installation.groupCount', 1, 'installation.groupCount'));
  }

  return { resolved, warnings };
}
