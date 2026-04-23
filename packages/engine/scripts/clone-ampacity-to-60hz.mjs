#!/usr/bin/env node
/**
 * Stage 5B-AMP — clone each 50 Hz ampacity dataset to a 60 Hz sibling.
 *
 * Values are copied verbatim. Per IEC 60364-5-52:2009 Annex B, the tabulated
 * current-carrying capacities apply to LV installations operating at either
 * 50 Hz or 60 Hz (skin and proximity effects are negligible for csa ≤
 * 300 mm² in this range), so replication without revaluation is the
 * standard-permitted path.
 *
 * Transformations per file:
 *   - id:          "<base>_50" → "<base>_60"   (suffix swap; tolerates files
 *                  whose id encodes the frequency as "_50" at the end)
 *   - frequencyHz: 50 → 60
 *   - sourceRef:   existing text + " [5B-AMP: values replicated at 60 Hz
 *                  under IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence
 *                  clause for LV conductor CSA ≤ 300 mm²]"
 *
 * Output filename mirrors input with the `_50` filename suffix swapped
 * for `_60`.
 *
 * This script is idempotent: re-running overwrites the 60 Hz files with
 * freshly regenerated content from the current 50 Hz sources.
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATASET_DIR = join(
  __dirname,
  '..',
  'src',
  'data',
  'datasets',
  'iec60364_lv_v1',
  'ampacity',
);

const EQUIVALENCE_NOTE =
  ' [5B-AMP: values replicated at 60 Hz under IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence clause for LV conductor CSA ≤ 300 mm²]';

const files = readdirSync(DATASET_DIR).filter(
  (f) => f.endsWith('_50.json') && !f.startsWith('amp_') === false, // keep only amp_*_50.json
);

let cloned = 0;
for (const src of files) {
  const srcPath = join(DATASET_DIR, src);
  const raw = readFileSync(srcPath, 'utf8');
  const ds = JSON.parse(raw);

  if (ds.frequencyHz !== 50) {
    throw new Error(`expected frequencyHz=50 in ${src}, got ${ds.frequencyHz}`);
  }

  // Flip frequency axis
  ds.frequencyHz = 60;
  // Swap id suffix "_50" → "_60" if present at end; otherwise append "_60hz"
  if (typeof ds.id === 'string' && ds.id.endsWith('_50')) {
    ds.id = ds.id.slice(0, -3) + '_60';
  } else if (typeof ds.id === 'string') {
    ds.id = ds.id + '_60hz';
  }
  // Append equivalence note (guard against double-append on re-runs)
  if (!ds.sourceRef.includes('[5B-AMP:')) {
    ds.sourceRef = ds.sourceRef + EQUIVALENCE_NOTE;
  }

  const dstName = src.replace(/_50\.json$/, '_60.json');
  const dstPath = join(DATASET_DIR, dstName);
  writeFileSync(dstPath, JSON.stringify(ds, null, 2) + '\n', 'utf8');
  console.log(`  ${src}  →  ${dstName}`);
  cloned++;
}

console.log(`\n✔ cloned ${cloned} ampacity dataset(s) from 50 Hz to 60 Hz`);
