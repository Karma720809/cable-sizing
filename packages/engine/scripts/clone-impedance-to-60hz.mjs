#!/usr/bin/env node
/**
 * Stage 5B-IMP — generate 60 Hz impedance datasets from 50 Hz siblings.
 *
 * Policy (ratified by 5B-IMP approval):
 *   • R (resistance): replicated value-for-value from the 50 Hz bundle.
 *     Skin/proximity effects are < 1 % for LV conductor CSA ≤ 300 mm², so
 *     resistance is effectively frequency-independent. Same physical basis
 *     as the 5B-AMP ampacity equivalence clause (IEC 60364-5-52:2009 Annex B).
 *   • X (reactance): derived as X₆₀ = 1.2 · X₅₀ (frequency-proportional,
 *     since inductive reactance X = 2π·f·L and cable geometry fixes L).
 *
 * Field transforms:
 *   id               : `impedance_<mat>_multicore_50hz_v1` → `..._60hz_v1`
 *   frequencyHz      : 50 → 60
 *   sourceRef        : appended with a 5B-IMP note recording both bases
 *   resistance.*.rows: untouched
 *   reactance.*.rows : value ← value · 1.2, rounded to 4 significant figures
 *                      to keep the JSON human-legible and the arithmetic
 *                      visibly proportional.
 *
 * Idempotent: rerunning overwrites the 60 Hz files with byte-stable output.
 *
 * Usage: node scripts/clone-impedance-to-60hz.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(
  __dirname,
  '..',
  'src',
  'data',
  'datasets',
  'iec60364_lv_v1',
  'impedance',
);

const SOURCE_NOTE_APPENDIX =
  ' [5B-IMP: R replicated from the 50 Hz sibling under IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence for LV CSA ≤ 300 mm²; X derived as X60 = 1.2 · X50 from the frequency-proportional relation X = 2πfL with fixed cable geometry.]';

/** Round to 4 significant figures, keeping JSON numbers compact and readable. */
function round4sig(n) {
  if (n === 0) return 0;
  const sign = Math.sign(n);
  const abs = Math.abs(n);
  const mag = Math.floor(Math.log10(abs));
  const factor = Math.pow(10, 3 - mag); // 4 sig figs ⇒ (4-1)=3
  return (sign * Math.round(abs * factor)) / factor;
}

function transform(src) {
  const out = JSON.parse(JSON.stringify(src));
  out.id = out.id.replace('_50hz_', '_60hz_');
  out.frequencyHz = 60;
  out.sourceRef = (out.sourceRef ?? '') + SOURCE_NOTE_APPENDIX;
  // Resistance: unchanged
  // Reactance: × 1.2
  for (const ins of Object.keys(out.reactance)) {
    const tbl = out.reactance[ins];
    tbl.rows = tbl.rows.map((r) => ({
      csaMm2: r.csaMm2,
      value: round4sig(r.value * 1.2),
    }));
    if (tbl.note) {
      tbl.note = tbl.note + ' (X × 1.2 for 60 Hz)';
    }
  }
  return out;
}

const files = readdirSync(DATA_DIR).filter(
  (f) => /^rx_[a-z]+_multicore_50hz\.json$/.test(f),
);
if (files.length === 0) {
  console.error('No 50 Hz impedance source files found in', DATA_DIR);
  process.exit(1);
}

let wrote = 0;
for (const f of files) {
  const srcPath = join(DATA_DIR, f);
  const dstPath = join(DATA_DIR, f.replace('_50hz.json', '_60hz.json'));
  const src = JSON.parse(readFileSync(srcPath, 'utf8'));
  const dst = transform(src);
  writeFileSync(dstPath, JSON.stringify(dst, null, 2) + '\n', 'utf8');
  console.log(`wrote ${dstPath}`);
  wrote++;
}
console.log(`done: ${wrote} file(s)`);
