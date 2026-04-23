/**
 * Reference installation methods — PRD §7 / §11.2.
 *
 * Classifies an IEC 60364-5-52 reference method as air-borne vs in-ground,
 * which drives which ambient / soil / grouping tables apply.
 */

import type { ReferenceMethod } from '../../types/index.js';

export type InstallationEnvironment = 'air' | 'ground';

const GROUND_METHODS: ReadonlySet<ReferenceMethod> = new Set(['D1', 'D2']);

export function environmentOf(method: ReferenceMethod): InstallationEnvironment {
  return GROUND_METHODS.has(method) ? 'ground' : 'air';
}

/**
 * Which grouping-table key applies to the given reference method.
 * Matches dataset keys in `corrections/grouping.json`.
 */
export function groupingTableKey(method: ReferenceMethod): string {
  switch (method) {
    case 'C':
      return 'single_layer_wall';
    case 'E':
    case 'F':
      return 'single_layer_perforated_tray';
    case 'D1':
    case 'D2':
      return 'buried_touching';
    default:
      return 'bunched_air';
  }
}

/**
 * Soil resistivity sub-table. PRD MVP uses `buried_ducts` for D1 (in conduit
 * in ground) and `direct_buried` for D2 (single-core in ground – typically
 * direct-buried in Schneider’s classification).
 */
export function soilTableKey(method: ReferenceMethod): string {
  return method === 'D2' ? 'direct_buried' : 'buried_ducts';
}
