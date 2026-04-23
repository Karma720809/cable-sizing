# @cable-sizing/engine

IEC 60364-5-52 low-voltage power cable sizing engine.
Pure TypeScript, no runtime DOM/Node dependencies (except `fs` at dataset
load time).

## Stage 1 scope

This package currently exposes the **layered building blocks**:

| Layer          | Module                                         |
| -------------- | ---------------------------------------------- |
| Physics        | `designCurrent`, `voltageDrop`, `shortCircuitCSA` |
| Standard rules | `computeCorrections`, `resolveAmpacityRows`, `lookupImpedance`, `lookupKValue` |
| Data           | `loadDataset()` → `iec60364_lv_v1`             |
| Utils          | `exactOrConservative`, `nextStandardAtLeast`, … |

The orchestrator (`sizeCable(input): SizingResult`) lands in Stage 2.

## Quick example — design current only

```ts
import { designCurrent } from '@cable-sizing/engine';

const ib = designCurrent({
  powerKW: 50,
  voltageV: 400,
  phase: 3,
  powerFactor: 0.85,
  efficiency: 0.9,
  demandFactor: 1.0,
});

console.log(ib.designCurrentA); // ≈ 94.31
```

## Quick example — end-to-end building blocks

```ts
import {
  loadDataset, designCurrent, computeCorrections,
  resolveAmpacityRows, selectCsaForRequiredIz,
} from '@cable-sizing/engine';

const ds = loadDataset();
const { designCurrentA } = designCurrent({
  powerKW: 50, voltageV: 400, phase: 3,
  powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0,
});
const corr = computeCorrections(ds, {
  method: 'C', insulation: 'PVC',
  ambientTempC: 30, soilResistivityK_m_W: null, groupCount: 1,
});
if (corr.ok) {
  const requiredIz = designCurrentA / corr.combined.total;
  const rows = resolveAmpacityRows(ds, {
    conductorMaterial: 'Cu', insulationType: 'PVC',
    loadedConductors: 3, cableType: 'multicore', frequencyHz: 50,
    method: 'C',
  });
  if (rows.ok) {
    const hit = selectCsaForRequiredIz(rows.rows, requiredIz);
    console.log(hit); // { csaMm2, ampacityA }
  }
}
```

## Dataset

`src/data/datasets/iec60364_lv_v1/` — 9 JSON files derived from
Schneider Electric’s Electrical Installation Guide. See `meta.json` for
source attribution and the dataset’s `status: "draft"`.

Quality checks (PRD §14.5) run on every `loadDataset()` call.

## Correction-factor lookup policy (v0.1.1)

Non-exact key matches on the ambient / soil / grouping tables resolve
via a **safe-side** rule:

1. If an exact key is present → use it.
2. Otherwise, of the two adjacent neighbors, pick the one whose
   **factor value is smaller** — larger derating, larger required CSA.
3. If the target falls outside the tabulated range (only one or zero
   neighbors exist), raise `E-LOOKUP-002` rather than silently
   extrapolating.

Any non-exact resolution emits `W-LOOKUP-SAFE-SIDE` (formerly
`W-FACTOR-CONSERVATIVE` in v0.1.0 — renamed per Stage 1 Gate review
because the prior "nearest lower key" semantics could yield the
*larger*, non-conservative factor on monotonic-derating tables).

## Tests

```bash
npm run test
npm run test -- --coverage
```
