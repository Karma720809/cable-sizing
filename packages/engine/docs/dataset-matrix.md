# Dataset Support Matrix — iec60364_lv_v1

Snapshot of what the engine currently ships with. The authoritative source is
the runtime `getDatasetManifest()` output; this document reflects the state of
the bundle at engine version **0.10.0**.

## Ampacity tables (IEC 60364-5-52 Table B.52.4 multicore; Tables B.52.10–B.52.13 single-core)

As of **5B-AMP (0.8.0)**, every 50 Hz row below has an exact 60 Hz twin
shipping under the IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence clause
(applicable for LV conductor CSA ≤ 300 mm², where skin and proximity effects
are negligible). Values are identical; only `frequencyHz` differs. The table
below lists each material/insulation/loaded/cableType row once — read each
row as covering **both 50 Hz and 60 Hz**.

| Material | Insulation | Loaded conductors | Frequency | Cable type | Methods | csa range (mm²) |
|---|---|---|---|---|---|---|
| Cu | PVC  | 3 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | 1.5 – 300 |
| Cu | XLPE | 3 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | 1.5 – 300 |
| Cu | PVC  | 2 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | 1.5 – 300 |
| Cu | XLPE | 2 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | 1.5 – 300 |
| Al | PVC  | 3 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | **16** – 300 |
| Al | XLPE | 3 | 50 + **60** Hz | multicore   | A1, A2, B1, B2, C, **E**, D1, D2 | **16** – 300 |
| Cu | PVC  | 3 | 50 + **60** Hz | **single-core** | **F**, **G** | **25** – 300 |
| Cu | XLPE | 3 | 50 + **60** Hz | **single-core** | **F**, **G** | **25** – 300 |
| Al | PVC  | 3 | 50 + **60** Hz | **single-core** | **F**, **G** | **25** – 300 |
| Al | XLPE | 3 | 50 + **60** Hz | **single-core** | **F**, **G** | **25** – 300 |

Single-core datasets start at 25 mm²: rows 1.5–16 mm² are N/A in the source
tables for F/G (cf. IEC 60364-5-52:2009 B.52.10/12 cols. 5+7 for Cu,
B.52.11/13 for Al). The Cu ladder nominally extends below 25 mm² but those
rows are absent for these free-air methods. Arrangement defaults: Method F =
touching trefoil; Method G = spaced flat horizontal at 1 × Dₑ. See the
Sourcing history for the full list of absent/omitted rows.

### Sourcing history

- **5A-Cu-E** (engine 0.5.0): Method E rows for Cu multicore PVC/XLPE × 2L/3L
  were sourced from TiSoft reference tables `table_b_52_10` (Cu/PVC) and
  `table_b_52_12` (Cu/XLPE), both mirroring IEC 60364-5-52 Annex B.52.10 /
  B.52.12. The source tables include 400 / 500 / 630 mm² rows, but those csa
  values are outside the engine's current `standard_sizes.json` ladder (which
  ends at 300 mm²) and were not ingested. The source also marks those rows as
  N/A for multicore Method E in any case.
- **5A-Al-E** (engine 0.6.0): Method E rows for Al multicore × 3-loaded were
  sourced directly from the IEC primary (KS C IEC 60364-5-52:2009):
  - Al / PVC / 3-loaded: **Table B.52.11** (70 °C conductor, 30 °C ambient),
  - Al / XLPE or EPR / 3-loaded: **Table B.52.13** (90 °C conductor, 30 °C
    ambient).
  The standard does not publish Method E rows for 1.5 / 2.5 / 4 / 6 / 10 mm²
  Al (Al cables are not standardised below 16 mm²); those csa values are
  consequently absent. The 400 / 500 / 630 mm² rows exist in the source but
  remain unsupported by the current `standard_sizes.json` ladder. 2-loaded
  Al Method E is deferred (scope decision, not a sourcing gap).
- **5A-SC-FG** (engine 0.7.0): Methods F and G rows on single-core × 3-loaded
  were sourced directly from the IEC primary (KS C IEC 60364-5-52:2009),
  columns 5 (Method F, touching trefoil) and 7 (Method G, spaced flat
  horizontal at 1 × Dₑ):
  - Cu / PVC / 3-loaded / single-core: **Table B.52.10** (70 °C / 30 °C),
  - Cu / XLPE or EPR / 3-loaded / single-core: **Table B.52.12** (90 °C /
    30 °C),
  - Al / PVC / 3-loaded / single-core: **Table B.52.11** (70 °C / 30 °C),
  - Al / XLPE or EPR / 3-loaded / single-core: **Table B.52.13** (90 °C /
    30 °C).
  Row coverage is 25–300 mm² for all four datasets. The Cu source tables do
  not publish F/G values for 1.5 / 2.5 / 4 / 6 / 10 / 16 mm² (N/A under
  free-air single-core arrangements); those csa values are consequently
  absent. Al below 16 mm² is not standardised, and 16 mm² is N/A in the Al
  source for F/G. 400 / 500 / 630 mm² rows exist in all four source tables
  but remain unsupported by the current `standard_sizes.json` ladder.
  2-loaded single-core and Method F "spaced" / Method G "vertical" variants
  are deferred (scope decisions, not sourcing gaps).
- **5B-AMP** (engine 0.8.0): Ampacity at **60 Hz** was added by cloning
  every 50 Hz dataset value-for-value into a sibling file with
  `frequencyHz: 60`. The IEC 60364-5-52:2009 Annex B preamble states the
  tabulated current-carrying capacities apply to LV installations at 50 Hz
  **or 60 Hz** for conductor cross sections up to 300 mm² (skin and
  proximity effects negligible in this range). Each 60 Hz dataset's
  `sourceRef` carries an explicit `[5B-AMP: …]` equivalence marker and
  cites the original source verbatim. No fresh measurements or standards
  were introduced; no row was added, removed, or revalued relative to its
  50 Hz twin. 60 Hz **impedance** (R/X) was **not** touched in this gate
  — see "Planned additions" below (5B-IMP-INFRA, 5B-IMP). Until those
  land, a request at `frequencyHz: 60` resolves the ampacity path
  successfully and then fails at voltage-drop with `E-LOOKUP-003`
  (impedance dataset not bundled at 60 Hz), which is the same INCOMPLETE
  shape as any other unsupported (material, insulation, frequency)
  combination.

### Planned additions (Stage 5)

The Stage 5 rollout extends the ampacity coverage along three independent
axes, each a separate sub-gate:

| Sub-gate | Adds | Shape |
|---|---|---|
| ~~**5A-Cu-E**~~ (landed in 0.5.0) | Method E on Cu multicore (PVC / XLPE × 2-/3-loaded) | extended existing 4 Cu files in place, new `"E"` key under `tables` |
| ~~**5A-Al-E**~~ (landed in 0.6.0) | Method E on Al multicore (PVC / XLPE × 3-loaded; 2-loaded deferred) | extended 2 Al files in place, new `"E"` key under `tables` |
| ~~**5A-SC-FG**~~ (infra at 0.6.0; values landed in 0.7.0) | Methods F and G, single-core, Cu + Al × PVC/XLPE × 3-loaded, one default arrangement per method | 4 new single-core dataset files (each holds both F and G under `tables`); `SupportedCombination.cableType` added additively |
| ~~**5B-AMP**~~ (landed in 0.8.0) | Ampacity at 60 Hz — value-for-value clone of all 10 ampacity datasets under IEC Annex B 50/60 Hz equivalence (LV, CSA ≤ 300 mm²) | 10 new files with `frequencyHz: 60`; `sourceRef` carries `[5B-AMP: …]` marker; no impedance change |
| ~~**5B-IMP-INFRA**~~ (landed in-place at 0.8.0, no version bump) | 60 Hz impedance fallback formalised behind `W-REACTANCE-60HZ-DEFERRED` (X → 0) + `W-RESISTANCE-50HZ-USED-AT-60HZ` (R reused from 50 Hz bundle); policy A-1 + R-a | code/type/test-only; WarningCode enum extended by 2; pipeline voltage-drop loop now resolves an effective impedance frequency before lookups |
| ~~**5B-IMP**~~ (landed in 0.9.0) | Native 60 Hz multicore impedance (Cu + Al). Reactance path **X-1**: R replicated from 50 Hz (frequency-independent for LV CSA ≤ 300 mm²); X derived as X₆₀ = 1.2·X₅₀ (X = 2πfL, geometry-fixed) | 2 new impedance dataset files `rx_{cu,al}_multicore_60hz.json`; impedance bundle count 2 → 4; fallback activation now scoped by (material, cableType) — multicore takes the native path, single-core still falls back |
| ~~**5C**~~ (landed in 0.10.0) | `temperature_corrected` resistance model. **T-1** loading-ratio θ_op; **F-1** IEC 60287-1-1 linear-α formula; α from IEC 60228 (Cu 3.93e-3/K, Al 4.03e-3/K); applied inside the vdrop scan (**P-1**); uniform over native and fallback paths (**C-1**); `VoltageDropResult` additively gains `cableR_atOperatingTemp_ohm_per_km` + `operatingTempC` (**S-1**) | 1 new physics dataset `physics/alpha_coefficients.json`; `WarningCode` + 2 (`W-TEMP-CORRECTION-APPLIED`, `W-TEMP-CORRECTION-CAPPED`); `ErrorCode` + 1 (`E-TEMP-AMBIENT-OVER-MAX`); default `resistanceModel: 'fixed_reference'` keeps existing behaviour byte-identical |

### Supported-combinations semantics (5A-Cu-E policy)

A reference method is counted as **supported** — i.e. listed under
`DatasetBundleEntry.methods` and enumerated in `DatasetManifest.supportedCombinations`
— if and only if its `rows[]` array contains at least one concrete
`(csaMm2, ampacityA)` pair. A method key declared on a dataset but left with
empty rows is **not** a supported combination; hosts will never receive a
combination they cannot actually look up.

This rule is enforced in two places:

1. `getDatasetManifest()` filters `rows.length > 0` before emitting.
2. The loader's quality check rejects empty rows at dataset load time (fatal,
   raises `DatasetQualityError`). Today this makes the manifest filter
   belt-and-suspenders — it becomes load-bearing when (and if) a future stage
   introduces an explicit `pending` method placeholder.

The loader additionally rejects any `tables` key that is not a canonical
`ReferenceMethod` code (A1/A2/B1/B2/C/D1/D2/E/F/G) — typos cannot silently
surface as bogus "supported" combinations.

## Single-phase vs three-phase rule

The ampacity lookup selects `loadedConductors` based on `system.phase`:

| `system.phase` | `loadedConductors` | Rationale |
|---|---|---|
| 1 | 2 | L + N are current-carrying; PE carries no balanced-load current |
| 3 | 3 | Three phases carry balanced current; N carries no current in a balanced 3ϕ system |

A circuit described with `phase = 1` and a Cu/PVC cable will therefore resolve
to the **Cu/PVC 2-loaded** table, which gives *higher* ampacity per csa than the
3-loaded table for the same conductor (fewer heat-generating conductors in the
bundle). This is why identical other parameters can yield different recommended
csa across phases.

The `SizingResult.ampacity.loadedConductorsUsed` field makes this choice
explicit for UI rendering.

## Impedance (R at rated temp / X at rated frequency)

As of **5B-IMP (0.9.0)**, multicore Cu and Al carry native 50 Hz **and**
60 Hz bundles. Single-core has never had a bundled impedance dataset at
either frequency — requests for it fall back under 5B-IMP-INFRA policy.

| Material | Cable type | Frequency | PVC basis | XLPE basis | Source of values |
|---|---|---|---|---|---|
| Cu | multicore | 50 Hz | 70 °C | 90 °C | Schneider Guide / IEC 60364 Appendix 2 |
| Al | multicore | 50 Hz | 70 °C | 90 °C | IEC 60228 / Schneider Guide |
| Cu | multicore | **60 Hz** | 70 °C | 90 °C | R replicated from 50 Hz; X = 1.2·X₅₀ (5B-IMP) |
| Al | multicore | **60 Hz** | 70 °C | 90 °C | R replicated from 50 Hz; X = 1.2·X₅₀ (5B-IMP) |

Reactance values are tabulated per csa and apply only when
`projectPolicy.useReactance === true`.

### 5B-IMP derivation bases (60 Hz multicore)

- **R (resistance)**: replicated value-for-value from the 50 Hz sibling
  under the IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence clause —
  skin and proximity effects are < 1 % for LV conductor CSA ≤ 300 mm², so
  resistance is effectively frequency-independent in this range. Same
  physical basis invoked for ampacity at 5B-AMP.
- **X (reactance)**: derived as **X₆₀ = 1.2·X₅₀** from the frequency-
  proportional relation X = 2πfL with fixed cable geometry. Stored
  rounded to 4 significant figures for JSON legibility; rounding error
  vs the exact ratio is < 1e-3 relative, verified by the 5B-IMP spot
  check.

Both bases are recorded explicitly in each 60 Hz dataset's `sourceRef`
(the `[5B-IMP: …]` marker).

### 5B-IMP-INFRA graceful-degrade fallback (still live for uncovered combos)

The fallback ships at 5B-IMP-INFRA (engine 0.8.0) and remains the default
behaviour for any `(conductorMaterial, cableType)` combination without a
native 60 Hz bundle. Today that means **single-core at 60 Hz**; multicore
Cu/Al at 60 Hz take the native path and trigger neither warning.

| Axis | Fallback at 60 Hz | Warning emitted | Scope after 5B-IMP |
|---|---|---|---|
| **R** (resistance) | Look up R from the 50 Hz impedance bundle as-is | `W-RESISTANCE-50HZ-USED-AT-60HZ` | Fires only for single-core 60 Hz (no single-core impedance at either frequency) |
| **X** (reactance) | Internally force `useReactance = false` (X = 0) regardless of caller's projectPolicy | `W-REACTANCE-60HZ-DEFERRED` | Fires only for single-core 60 Hz with `useReactance: true` |

The 50/60 Hz voltage-drop **parity** when `useReactance = false` is
preserved by design: R values at 60 Hz are value-for-value identical to
their 50 Hz siblings, X contributes zero on both sides, so the computed
drop numbers match to the last decimal. Locked in by test.

Both fallback warnings are retired fully once a single-core 60 Hz
impedance bundle ships — at that point the fallback path is never taken
for any combination and neither warning is ever pushed. No caller code
needs to change to benefit.

The only shape that still returns INCOMPLETE at 60 Hz today is a request
for a cable/impedance combination that has no 50 Hz dataset either (the
single-core case) — that surfaces as `E-LOOKUP-003`, the same error the
caller would see at 50 Hz. The 60 Hz fallback does not invent impedance
data where none exists for the requested cable type.

## Short-circuit k-values (IEC 60364-4-43 / 60364-5-54)

| Material | Insulation | k-value | Initial temp | Final temp |
|---|---|---|---|---|
| Cu | PVC  | 115 | 70 °C  | 160 °C |
| Cu | XLPE | 143 | 90 °C  | 250 °C |
| Al | PVC  |  76 | 70 °C  | 160 °C |
| Al | XLPE |  94 | 90 °C  | 250 °C |

## Correction factors

| Factor | Key | Scope |
|---|---|---|
| k1 (ambient air)   | PVC + XLPE sub-tables, °C grid | installations not in ground |
| k1 (ambient ground)| PVC + XLPE sub-tables, °C grid | D1/D2 methods |
| k2 (soil resistivity) | K·m/W grid | D1/D2 methods only |
| k3 (grouping) | count grid × per-grouping-arrangement tables | any method |

Non-exact lookups resolve via the **safe-side rule**: pick the neighbor that
produces the *smaller* factor (⇒ larger derating ⇒ larger required csa). When
this happens, `SizingResult.ampacity.lookupPolicyUsed === 'safe-side'` and a
`W-LOOKUP-SAFE-SIDE` warning is emitted.

## Discovery at runtime

```ts
import { getDatasetManifest } from '@cable-sizing/engine';

const m = getDatasetManifest();
// m.supportedCombinations: every concrete (material, insulation, loadedConductors,
// frequency, method) the engine can answer today, along with available csa values.
```
