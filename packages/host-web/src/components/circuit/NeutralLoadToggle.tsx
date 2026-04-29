/**
 * NeutralLoadToggle — surfaces the v1.3 `neutralCarriesCurrent` flag
 * (CR-OQ-3). Visible only for topologies where the neutral can carry
 * load current under ordinary operation:
 *   - 3ph4w: Y-connected three-phase + neutral
 *   - 1ph3w: split-phase distribution (US 240/120 V, KEPCO 220/110 V)
 *
 * For 1ph2w and 3ph3w topologies the toggle has no effect and is hidden.
 */
import React from 'react';

export type Topology = '1ph2w' | '1ph3w' | '3ph3w' | '3ph4w';

interface Props {
  topology: Topology;
  neutralCarriesCurrent: boolean;
  onChange: (b: boolean) => void;
}

export function NeutralLoadToggle({
  topology,
  neutralCarriesCurrent,
  onChange,
}: Props): React.ReactElement | null {
  const visible = topology === '3ph4w' || topology === '1ph3w';
  if (!visible) return null;
  return (
    <label className="field field-check" data-testid="neutral-load-toggle">
      <span>Neutral carries current (unbalanced / single-phase loads)</span>
      <input
        type="checkbox"
        checked={neutralCarriesCurrent}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
