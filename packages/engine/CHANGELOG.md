# Changelog — `@cable-sizing/engine`

All notable changes to the engine package. The engine follows a single
monotonic `engineVersion` that bumps with any logic or dataset change. See
`docs/versioning-policy.md` for the full policy (engineVersion vs apiVersion
vs datasetId).

The format is inspired by [Keep a Changelog](https://keepachangelog.com/).

## [0.10.0] — 2026-04-23 — Stage 5C: temperature-corrected resistance

Ships **temperature-corrected resistance** as an opt-in alternative to the
existing fixed-reference R mode. Default behaviour is unchanged: every
request with `projectPolicy.resistanceModel === 'fixed_reference'` (the
default) produces byte-identical results to 0.9.0.

### Scope decisions locked (per 2026-04-23 approval)
- **T = T-1** (loading-ratio operating-temperature estimate):
  `θ_op = θ_amb + (IB / IZ)² · (θ_max − θ_amb)`, with `IB / IZ` clamped
  to 1.0. Per IEC 60287-1-1 practice.
- **F = F-1** (full IEC linear-α formula):
  `R(θ_op) = R(θ_ref) · [1 + α·(θ_op − 20)] / [1 + α·(θ_ref − 20)]`,
  with α tabulated at 20 °C (IEC 60228) and θ_ref = insulation rated
  conductor max (PVC = 70 °C, XLPE = 90 °C, already present as
  `resistance.temperatureBasisC` since 0.1.0).
- **α source = IEC 60228**: Cu = 3.93×10⁻³/K, Al = 4.03×10⁻³/K.
- **P = P-1**: correction applied **inside** the voltage-drop csa scan,
  per-csa, because IZ depends on the iterating csa.
- **C = C-1**: correction is uniform — applies on both the native
  50/60 Hz impedance path and the single-core 60 Hz fallback path.
  Reactance is never temperature-corrected (X ≈ geometry-only).
- **S = S-1**: `VoltageDropResult` is additively extended with two new
  optional fields. Semantics of `cableR_ohm_per_km` are unchanged
  (reference-temperature R).

### Added
- `src/data/datasets/iec60364_lv_v1/physics/alpha_coefficients.json` —
  tabulated α₂₀ per conductor material, sourced to IEC 60228 and
  IEC 60287-1-1 §2. Loaded and quality-checked on startup
  (referenceTempC = 20, unit = per_K, Cu and Al both present, each α
  in (0, 0.01)).
- `src/physics/temperature-correction.ts` — three pure helpers:
  `correctR()` (IEC linear-α), `estimateOperatingTempC()` (loading
  ratio, reports `capped: true` when IB > IZ), `lookupAlpha()`.
- `Dataset.physics.alphaCoefficients: AlphaCoefficientsDataset` and
  the supporting `AlphaCoefficientEntry` / `AlphaCoefficientsDataset`
  types in `types/index.ts`.
- `VoltageDropResult.cableR_atOperatingTemp_ohm_per_km?: number | null`
  — the R value actually used for ΔU when correction is active;
  `null` under `fixed_reference`.
- `VoltageDropResult.operatingTempC?: number | null` — the estimated
  θ_op; `null` under `fixed_reference`.
- `WarningCode` gains `W-TEMP-CORRECTION-APPLIED` (once per request
  when correction is active) and `W-TEMP-CORRECTION-CAPPED` (any csa
  in scan had IB > IZ, loading ratio clamped).
- `ErrorCode` gains `E-TEMP-AMBIENT-OVER-MAX` — fatal when
  `resistanceModel === 'temperature_corrected'` and
  `ambientTempC ≥ θ_max` (no thermal headroom → IEC 60287 rating
  envelope exceeded; engine refuses to extrapolate).
- Unit tests: `src/physics/temperature-correction.test.ts`.
- Integration tests: `src/orchestrator/temperature-correction.integration.test.ts`.

### Changed
- `src/orchestrator/pipeline.ts` — voltage-drop scan now computes
  `θ_op` and temperature-corrected R per iterated csa when the policy
  flag is set. The pre-loop ambient-over-max guard short-circuits with
  the fatal error above.
- `src/version.ts`, `package.json`: engineVersion `0.9.0 → 0.10.0`.

### Non-regressive
- `resistanceModel` defaults to `'fixed_reference'`; every existing
  test stays green bit-for-bit (no implicit opt-in).
- 50/60 Hz native/fallback coverage is unchanged — 5C is orthogonal
  to the 5B-IMP / 5B-IMP-INFRA frequency axis.
- 5A/5B dataset policy is untouched. Reactance X is never
  temperature-corrected.

## [0.9.0] — 2026-04-23 — Stage 5B-IMP values rollout

Third and final sub-gate of Stage 5B. Ships **native 60 Hz multicore
impedance** for Cu and Al, retiring the 5B-IMP-INFRA graceful-degrade
fallback for those combinations. The fallback itself remains live — it
continues to cover combinations without a native 60 Hz bundle (currently:
single-core, which has never been covered at either frequency).

### Scope decisions locked (per 2026-04-23 approval)
- Ship **2 new 60 Hz impedance datasets**: Cu multicore, Al multicore
  (matching the 2 existing 50 Hz multicore bundles).
- **R (resistance)**: replicated value-for-value from the 50 Hz sibling.
  Physical basis: IEC 60364-5-52:2009 Annex B 50/60 Hz equivalence
  (skin/proximity effects < 1 % for LV CSA ≤ 300 mm²). Same clause
  invoked for ampacity at 5B-AMP.
- **X (reactance)**: derived as **X60 = 1.2 · X50** from the frequency-
  proportional relation X = 2π·f·L with fixed cable geometry; stored
  rounded to 4 significant figures.
- Both derivation bases are recorded explicitly in each new dataset's
  `sourceRef` (the `[5B-IMP: …]` marker).
- The 5B-IMP-INFRA policy layer (A-1 + R-a + `warnings[]`-only) is
  **not reopened**. The fallback code path is unchanged; only its
  activation condition is refined to be scoped by `(conductorMaterial,
  cableType)` instead of global, so that native-covered combos take the
  native path and uncovered combos keep the fallback path.

### Added
- `src/data/datasets/iec60364_lv_v1/impedance/rx_cu_multicore_60hz.json`
- `src/data/datasets/iec60364_lv_v1/impedance/rx_al_multicore_60hz.json`
- `scripts/clone-impedance-to-60hz.mjs` — reproducible idempotent generator
  that transforms each 50 Hz multicore impedance file into its 60 Hz
  sibling (id/frequency/sourceRef updates, R rows passthrough, X rows
  × 1.2 rounded to 4 sig figs).
- `src/data/spot-checks/impedance-60hz-derivation.spot.test.ts` — 4 tests
  pinning down the R-parity and X-ratio invariants across all 64 bundled
  (insulation × csa) pairs, plus a sourceRef marker check.
- `frequency-60hz-fallback.test.ts` extended with a native-60Hz section
  (R parity, X60 ≈ 1.2·X50, no-warnings guarantee for multicore 60 Hz).

### Changed
- `src/data/loader.ts` — impedance list grows from **2 → 4** bundles.
- `src/orchestrator/pipeline.ts` — the 60 Hz fallback activation flag is
  now scoped by `(conductorMaterial, cableType)`, so multicore Cu/Al at
  60 Hz take the native 60 Hz bundle directly and emit **no** fallback
  warnings, while single-core 60 Hz continues to emit the fallback
  warnings exactly as at 0.8.0. Warning messages now include the combo
  that was not covered (e.g. `Cu/single-core`).
- `src/types/index.ts` — JSDoc on `W-REACTANCE-60HZ-DEFERRED` and
  `W-RESISTANCE-50HZ-USED-AT-60HZ` updated to reflect the post-5B-IMP
  scope (multicore covered, single-core still falling back).
- `src/data/loader.test.ts` / `src/api/manifest.test.ts` — impedance
  coverage counts updated (2 → 4).
- `docs/dataset-matrix.md` — Impedance section: 60 Hz column flips from
  "graceful-degrade" to "native" for multicore rows; single-core row
  remains in fallback.
- `package.json` + `src/version.ts` — `engineVersion` bumped `0.8.0 →
  0.9.0`.

### Sourcing
Both new datasets inherit the original Schneider Guide / IEC 60228 /
Appendix 2 citation from their 50 Hz siblings and append a 5B-IMP marker
documenting the physical bases of the R replication (Annex B) and the X
derivation (X = 2πfL, ratio 1.2):

> `[5B-IMP: R replicated from the 50 Hz sibling under IEC 60364-5-52:2009
> Annex B 50/60 Hz equivalence for LV CSA ≤ 300 mm²; X derived as
> X60 = 1.2 · X50 from the frequency-proportional relation X = 2πfL with
> fixed cable geometry.]`

### Runtime behaviour
- **Multicore Cu/Al at 60 Hz**: takes the native bundle. Voltage-drop
  uses R = R50 exactly and X = 1.2·X50 (to 4 sig figs). No warnings.
- **Multicore Cu/Al at 60 Hz + useReactance=false**: bit-for-bit parity
  with the 50 Hz calculation (R identical, X contributes zero on both
  sides). Locked in by test.
- **Single-core at 60 Hz**: unchanged from 0.8.0 — the 5B-IMP-INFRA
  fallback activates, `W-RESISTANCE-50HZ-USED-AT-60HZ` fires, and the
  end-to-end result is still INCOMPLETE because no single-core impedance
  exists at either frequency.
- **50 Hz paths everywhere**: bit-for-bit unchanged.

### Compatibility
- `apiVersion` unchanged (still `1`).
- `datasetId` unchanged (`iec60364_lv_v1`).
- No schema changes. No breaking changes to the `SizingResult` shape.
- The 5B-IMP-INFRA warning codes remain part of the public `WarningCode`
  union; they are simply emitted for fewer combinations now.

### Verification
- engine: `tsc --noEmit` clean; full suite green (ampacity, impedance,
  pipeline, manifest, spot-checks, 5B-IMP-INFRA fallback suite extended
  with native-60Hz cases).
- host-web smoke: passing.
- Manifest invariants: `impedanceCoverage` now has 4 entries (Cu/Al ×
  50/60 Hz); ampacity manifest unchanged at 20 bundles; no change to
  supported reference methods or csa grid.

## [Unreleased] — Stage 5B-IMP-INFRA (no engineVersion bump)

Infrastructure-only gate for 60 Hz impedance. Formalises what happens at
`system.frequencyHz === 60` while the impedance bundle remains 50 Hz-only,
so callers get a graceful, documented fallback instead of the bare
`E-LOOKUP-003` INCOMPLETE that would otherwise fire. `engineVersion`
remains at `0.8.0`; values for native 60 Hz impedance datasets arrive at
Stage 5B-IMP.

### Scope decisions locked (per 2026-04-23 approval)
- **Axis A (reactance policy): A-1** — requests with `frequencyHz: 60 &&
  useReactance: true` internally degrade to `useReactance: false` for the
  voltage-drop step; caller is informed via `W-REACTANCE-60HZ-DEFERRED`.
- **Axis R (resistance policy): R-a** — 60 Hz requests look up R rows
  from the 50 Hz impedance bundle directly (skin / proximity effects
  < 1 % for LV CSA ≤ 300 mm²); caller is informed via
  `W-RESISTANCE-50HZ-USED-AT-60HZ`. Direct dual of the IEC 60364-5-52:2009
  Annex B 50/60 Hz ampacity equivalence clause invoked at 5B-AMP.
- Warning surface uses the existing `SizingResult.warnings[]` array; no
  new audit fields or schema extensions.
- `apiVersion` stays at `1`; `engineVersion` stays at `0.8.0`.

### Added
- `WarningCode` extended by two codes (additive union, no runtime zod
  constraint affected):
  - `W-REACTANCE-60HZ-DEFERRED`
  - `W-RESISTANCE-50HZ-USED-AT-60HZ`
- `src/orchestrator/frequency-60hz-fallback.test.ts` — 8 tests pinning
  down A-1 + R-a semantics, 50 Hz non-regression, 50/60 Hz voltage-drop
  parity under `useReactance: false`, warning message shape, and the
  preserved INCOMPLETE behaviour when neither frequency has an impedance
  dataset for the requested cable type (e.g. single-core).

### Changed
- `src/orchestrator/pipeline.ts` — voltage-drop loop now resolves an
  effective impedance frequency (`lookupFreq`) and an effective reactance
  flag (`useReactanceEffective`) before iterating standard sizes. When a
  native 60 Hz impedance bundle is not present, the pipeline falls back
  to 50 Hz R rows and forces X = 0, pushing the two new warnings. Both
  fallbacks disappear automatically once a 60 Hz impedance dataset is
  bundled (Stage 5B-IMP).
- `docs/dataset-matrix.md` — Impedance section rewritten to describe the
  new 60 Hz graceful-degrade matrix (R reused, X = 0, both flagged);
  planned-additions row for 5B-IMP-INFRA struck through.

### Not changed (deliberate non-regression)
- No impedance dataset files were added, removed, or modified.
- 50 Hz code paths execute through the same lookup with no semantic
  change. The two new warnings are never emitted at `frequencyHz: 50`.
- 50/60 Hz voltage-drop parity under `useReactance: false` is exact (R
  from the same 50 Hz row on both sides, X = 0 on both sides) — locked
  in by a dedicated test.
- Request / response schema (zod) unchanged.
- Single-core 60 Hz requests still return `E-LOOKUP-003` / INCOMPLETE
  because no single-core impedance dataset has ever been bundled; the
  60 Hz fallback does not invent impedance data where none exists for
  the requested cable type.

### Verification
- engine: `tsc --noEmit` clean; **235 / 235** tests passing (+8 vs 0.8.0
  release — new 5B-IMP-INFRA suite).
- host-web smoke: **5 / 5** passing.

## [0.8.0] — 2026-04-23 — Stage 5B-AMP values rollout

First sub-gate of Stage 5B (60 Hz). **Ampacity only** — impedance (R, X) at
60 Hz is deferred to 5B-IMP-INFRA + 5B-IMP. No `apiVersion` bump; all
additions are strictly additive on axes (`frequencyHz`) already present in
the schema and manifest since 0.4.0.

### Added
- **10 new ampacity dataset files at 60 Hz**, cloned value-for-value from
  the existing 50 Hz bundle under the IEC 60364-5-52:2009 Annex B 50/60 Hz
  equivalence clause for LV conductor CSA ≤ 300 mm² (skin and proximity
  effects negligible in this range):
  - `amp_cu_pvc_3loaded_60.json`, `amp_cu_xlpe_3loaded_60.json`
  - `amp_al_pvc_3loaded_60.json`, `amp_al_xlpe_3loaded_60.json`
  - `amp_cu_pvc_2loaded_60.json`, `amp_cu_xlpe_2loaded_60.json`
  - `amp_cu_pvc_singlecore_3loaded_60.json`,
    `amp_cu_xlpe_singlecore_3loaded_60.json`,
    `amp_al_pvc_singlecore_3loaded_60.json`,
    `amp_al_xlpe_singlecore_3loaded_60.json`

  Each file carries `frequencyHz: 60`, a fresh `id` suffixed `_60`, and a
  `sourceRef` that preserves the original 50 Hz attribution verbatim and
  appends the `[5B-AMP: values replicated at 60 Hz under IEC 60364-5-52:2009
  Annex B 50/60 Hz equivalence clause for LV conductor CSA ≤ 300 mm²]`
  marker.
- `scripts/clone-ampacity-to-60hz.mjs` — reproducible generator that derives
  the 10 new files mechanically from their 50 Hz siblings. Idempotent;
  re-running overwrites. This is the authoritative way to regenerate the
  60 Hz bundle if the 50 Hz source is ever corrected.
- `src/data/spot-checks/ampacity-60hz-equivalence.spot.test.ts` — 6 tests,
  including a mechanical `(method, csa) → ampacityA` twin-comparison over
  **768 shared points** (the full cross-product of all 50 Hz
  (method, csa) keys), end-to-end `resolveAmpacityRows` parity at
  representative anchor keys, and `sourceRef` marker presence on every
  60 Hz dataset. Guards against silent drift if a future editor tweaks only
  one side of the 50/60 Hz pair.

### Changed
- `supportedCombinations` grows by exactly **2×**, going **56 → 112**
  (every existing 50 Hz combination now has a 60 Hz twin with identical
  `availableCsaMm2`).
- `bundledDatasets` grows by **+10**, going **10 → 20** (all new entries
  are `frequencyHz: 60`; methods and csa ranges mirror their 50 Hz twins).
- `src/data/loader.ts` — 10 new JSON imports + extension of `ampacityList`
  to 20 entries. No loader logic change.
- `src/api/manifest.test.ts` — `bundles 10 ampacity datasets` → 20; new
  invariant block asserting both 50 and 60 Hz are present,
  `|at50| === |at60|`, and every 50 Hz combination has a 60 Hz twin with
  identical `availableCsaMm2`.
- `src/data/loader.test.ts` — `bundles 10 ampacity datasets` → 20; sorted
  tag assertion now includes `frequencyHz` in the tag shape.

### Sourcing
- Values are **replicas**, not fresh measurements. No external source was
  introduced. The equivalence clause is cited inline in every 60 Hz
  dataset's `sourceRef`; no B-2 quote-paste was required for this gate.
- Rows absent at 50 Hz (e.g. Cu F/G below 25 mm², Al below 16 mm²) remain
  absent at 60 Hz — the 60 Hz bundle is a strict twin of the 50 Hz bundle.

### Runtime behaviour at 60 Hz (documented, unchanged failure mode)
- Ampacity lookup: **succeeds** for any combination that succeeds at 50 Hz.
- Voltage-drop lookup: **fails** with the existing `E-LOOKUP-003` error
  (impedance dataset not bundled at 60 Hz), yielding an INCOMPLETE result.
  This is the same error shape users already received for any missing
  impedance dataset; it is not a new failure mode introduced by 5B-AMP.
  5B-IMP-INFRA will formalise this behaviour as a named warning
  (`W-REACTANCE-60HZ-DEFERRED`) and gate decision; 5B-IMP will ship
  impedance values and retire the warning.
- A quick read-only audit of `ampacity-lookup.ts`, `impedance-lookup.ts`,
  `pipeline.ts`, `validation.ts`, and `schema.ts` confirmed no implicit
  50 Hz assumptions — all frequency routing is parameter-driven and already
  accepted `{50, 60}` since 0.4.0.

### Compatibility
- `apiVersion` unchanged at `1`.
- `datasetId` unchanged at `iec60364_lv_v1`.
- No new warning or error codes. No new `SizingResult` fields. No changes
  to the request/response schema.
- 5B-IMP-INFRA and 5B-IMP remain deferred to separate approval cycles.

### Verification
- engine: `tsc --noEmit` clean; **227 / 227** tests passing (+7 vs 0.7.0:
  6 new 50/60 Hz equivalence spot-checks + 1 new 5B-AMP invariant block in
  `manifest.test.ts`).
- host-web smoke: **5 / 5** passing.

## [0.7.0] — 2026-04-23 — Stage 5A-SC-FG values rollout

### Added
- **Methods F and G ampacity rows on single-core × 3-loaded — 4 new dataset
  files**, one per material/insulation combination. Each file holds both
  `"F"` (touching trefoil) and `"G"` (spaced flat horizontal, 1 × Dₑ) keys
  under `tables`, 10 rows each (25–300 mm²):
  - `amp_cu_pvc_singlecore_3loaded_50` — F: 110 A @ 25 mm² → 561 A @
    300 mm²; G: 146 A @ 25 mm² → 709 A @ 300 mm²
  - `amp_cu_xlpe_singlecore_3loaded_50` — F: 135 A @ 25 mm² → 703 A @
    300 mm²; G: 182 A @ 25 mm² → 902 A @ 300 mm²
  - `amp_al_pvc_singlecore_3loaded_50` — F: 84 A @ 25 mm² → 434 A @
    300 mm²; G: 112 A @ 25 mm² → 557 A @ 300 mm²
  - `amp_al_xlpe_singlecore_3loaded_50` — F: 103 A @ 25 mm² → 547 A @
    300 mm²; G: 138 A @ 25 mm² → 708 A @ 300 mm²
- Concrete spot-check assertions in
  `src/data/spot-checks/method-fg-singlecore.spot.test.ts` replacing the
  0.6.0 skeleton: smallest (25) / mid (50) / largest (300) anchors × 8
  tables, plus cross-axis invariants (G > F per dataset for spacing effect;
  SC/G > MC/E for all 4 material/insulation combos at identical csa).

### Changed
- `supportedCombinations` grows by **8** (Cu/Al × PVC/XLPE × {F, G} × 3L ×
  50 Hz × single-core), going **48 → 56**.
- `bundledDatasets` grows by **4** (one new single-core dataset per
  material/insulation), going **6 → 10**. Each new entry reports
  `cableType: 'single-core'` and `methods: ['F', 'G']`.
- `src/standards/iec60364/method-efg-baseline.test.ts` — the F/G canary is
  now a permanent **negative-axis-mismatch** guard: F and G on
  `cableType: 'multicore'` input continue to return INCOMPLETE with
  `E-LOOKUP-001` (F/G are single-core-only methods; this is a design
  invariant, never flips). The single-core branch was retired into the
  positive spot-checks.
- `src/api/manifest.test.ts` — `bundles 10 ampacity datasets` (was 6),
  `cableType` set now includes `'single-core'`, single-core methods are
  exactly `{F, G}`, multicore never carries F or G, and Methods E/F/G are
  all supported across Cu + Al.
- `src/data/loader.test.ts` — `bundles 10 ampacity datasets` (was 6); the
  sorted-tag assertion now includes `cableType` in the tag shape.
- `docs/dataset-matrix.md` — main coverage table gains 4 new single-core
  rows; Sourcing history gains a 5A-SC-FG entry with IEC-primary
  attribution; 5A-SC-FG is marked landed in the planned-additions table.

### Sourcing
- Values sourced directly from the IEC primary — **KS C IEC 60364-5-52:2009**:
  - **Table B.52.10** — Cu / PVC / 3-loaded / single-core (70 °C / 30 °C),
    columns 5 (Method F, touching trefoil) and 7 (Method G, spaced flat
    horizontal at 1 × Dₑ).
  - **Table B.52.12** — Cu / XLPE or EPR / 3-loaded / single-core (90 °C /
    30 °C), columns 5 and 7.
  - **Table B.52.11** — Al / PVC / 3-loaded / single-core (70 °C / 30 °C),
    columns 5 and 7.
  - **Table B.52.13** — Al / XLPE or EPR / 3-loaded / single-core (90 °C /
    30 °C), columns 5 and 7.
  Recorded in each dataset's `sourceRef` field.
- **Absent in source (Cu, F/G):** rows for 1.5 / 2.5 / 4 / 6 / 10 / 16 mm²
  are not published under free-air single-core arrangements — consequently
  omitted.
- **Absent in source (Al, F/G):** rows for 1.5–10 mm² (Al not standardised
  below 16 mm²) and for 16 mm² (N/A in Al source for F/G) are consequently
  omitted.
- **Omitted by standard-size-ladder policy:** 400 / 500 / 630 mm² rows exist
  in all four source tables but fall outside the current
  `standard_sizes.json` ladder (terminates at 300 mm²).
- **Deferred (scope decisions, not sourcing gaps):** 2-loaded single-core;
  Method F "spaced" variants; Method G "vertical" variants.

### Compatibility
- `apiVersion` unchanged at `1`. The new `SupportedCombination.cableType`
  field was introduced additively at the 0.6.0 infrastructure gate; this
  release exercises it with the first `'single-core'` values. Consumers
  that ignore the field continue to work, subject to the well-understood
  caveat that they can no longer assume a unique
  `(material, insulation, loadedConductors, frequencyHz, method)` key.
- `datasetId` unchanged at `iec60364_lv_v1`.
- No new warning codes, no new error codes, no new `SizingResult` fields.

### Verification
- engine: typecheck clean; full test suite green.
- host-web smoke: green.

## [0.6.0] — 2026-04-23 — Stage 5A-Al-E values rollout

### Added
- **Method E ampacity rows on Al multicore, 3-loaded** — 2 datasets extended
  in place, each gaining a new `"E"` key under `tables` with 11 rows
  (16–300 mm²):
  - `amp_al_pvc_3loaded_50` — 61 A @ 16 mm² → 381 A @ 300 mm²
  - `amp_al_xlpe_3loaded_50` — 77 A @ 16 mm² → 471 A @ 300 mm²
- `src/data/spot-checks/method-e-al-multicore.spot.test.ts` — 14 concrete
  assertions covering smallest (16) / mid (50) / largest (300) anchors per
  dataset, csa-ladder boundary invariants (`rows[0].csa === 16`,
  `rows[last].csa === 300`), and cross-table invariants (Method E > Method C
  per Al dataset, Al/XLPE > Al/PVC at 50 mm², Cu > Al at 50 mm² for both
  PVC and XLPE Method E).

### Changed
- `supportedCombinations` grows by 2 (Al × {PVC, XLPE} × 3L × Method E ×
  50 Hz × multicore), going **46 → 48**.
- `bundledDatasets[*].methods` for the 2 Al multicore datasets now includes
  `"E"` (methods per dataset: 7 → 8).
- `src/standards/iec60364/method-efg-baseline.test.ts` — the Al/Method E
  canary was removed. Only F and G canaries remain (pending 5A-SC-FG).
- `src/api/manifest.test.ts` — the Method E material assertion was flipped
  from `{ Cu only }` to `{ Cu, Al }`.
- `docs/dataset-matrix.md` — Al rows gain `**E**`; Sourcing history gains
  a 5A-Al-E entry with IEC-primary attribution; 5A-Al-E is marked landed
  in the planned-additions table.

### Sourcing
- Values sourced directly from the IEC primary — **KS C IEC 60364-5-52:2009
  Table B.52.11** (Al / PVC / 3-loaded / Method E; 70 °C conductor, 30 °C
  ambient) and **Table B.52.13** (Al / XLPE or EPR / 3-loaded / Method E;
  90 °C conductor, 30 °C ambient). Recorded in each dataset's `sourceRef`.
- Unlike 5A-Cu-E, no intermediary (e.g. TiSoft) is cited. The 5A-Cu-E
  `sourceRef` strings are preserved as-is — historical attribution of that
  rollout is not revised retroactively.
- Rows for 1.5 / 2.5 / 4 / 6 / 10 mm² are **omitted** as absent in source
  (Al cables are not standardised below 16 mm²).
- Rows for 400 / 500 / 630 mm² are **omitted by standard-size-ladder policy**
  (current `standard_sizes.json` terminates at 300 mm²).
- 2-loaded Al Method E is **deferred** (scope decision; not a sourcing gap).

### Compatibility
- `apiVersion` unchanged at `1`. Adding row-sets to an existing
  `(material, insulation, loadedConductors)` triple is strictly additive
  under the API v1 compatibility contract.
- `datasetId` unchanged at `iec60364_lv_v1`.
- No new warning or error codes. No new `SizingResult` fields.

### Verification
- engine: **181 / 181** tests passing (+14 vs 0.5.0 from the new Al spot-
  checks; −1 from the removed Al canary).
- host-web smoke: 5 / 5 passing.
- `tsc -p tsconfig.json --noEmit`: clean.

## [0.5.0] — 2026-04-23 — Stage 5A-Cu-E values rollout

### Added
- **Method E ampacity rows on Cu multicore** — 4 datasets extended in place,
  each gaining a new `"E"` key under `tables` with 16 rows (1.5–300 mm²):
  - `amp_cu_pvc_3loaded_50` — 18.5 A @ 1.5 mm² → 497 A @ 300 mm²
  - `amp_cu_pvc_2loaded_50` — 22 A @ 1.5 mm² → 593 A @ 300 mm²
  - `amp_cu_xlpe_3loaded_50` — 23 A @ 1.5 mm² → 621 A @ 300 mm²
  - `amp_cu_xlpe_2loaded_50` — 26 A @ 1.5 mm² → 741 A @ 300 mm²
- `src/data/spot-checks/method-e-cu-multicore.spot.test.ts` — 20 concrete
  anchor assertions replacing the prior `it.todo` skeleton (smallest / mid /
  largest csa × 4 datasets + 4 cross-table invariants: Method E > Method C,
  Cu/XLPE > Cu/PVC, 2-loaded > 3-loaded).
- `CHANGELOG.md` (this file).

### Changed
- `supportedCombinations` grows by 4 entries (Cu × {PVC, XLPE} × {2L, 3L} ×
  Method E × 50 Hz × multicore), going from 42 → 46.
- `bundledDatasets[*].methods` for the 4 Cu multicore datasets now includes
  `"E"` (methods per dataset: 7 → 8).
- `src/standards/iec60364/method-efg-baseline.test.ts` — E was removed from
  the Cu canary; Method E on **Al** multicore keeps a dedicated negative
  canary pending 5A-Al-E. F and G remain negative pending 5A-SC-FG.
- `src/api/manifest.test.ts` — "E is NOT supported" flipped to "E is
  supported on Cu only; Al/E and F/G pending".
- `src/data/loader.test.ts` — "7 tables per dataset" → "8 tables".
- `src/standards/iec60364/ampacity-lookup.test.ts` — the "unknown reference
  method" negative test now uses Method F (E became valid).
- `docs/dataset-matrix.md` — main coverage table gains `**E**` on Cu rows;
  new "Sourcing history" section; 5A-Cu-E marked as landed in the planned-
  additions table.

### Sourcing
- Values traced to TiSoft reference tables `table_b_52_10` (Cu/PVC) and
  `table_b_52_12` (Cu/XLPE), both mirroring IEC 60364-5-52 Annex B.52.10 /
  B.52.12 Reference Method E. Recorded in each dataset's `sourceRef` field.
- The source tables include 400 / 500 / 630 mm² rows; those csa values are
  outside the current `standard_sizes.json` ladder (terminates at 300 mm²)
  and were not ingested. The source marks those cells as N/A for multicore
  Method E in any case.

### Compatibility
- `apiVersion` unchanged at `1`. Addition of a new `(method, csa → A)` row-
  set is strictly additive under the API v1 compatibility contract.
- `datasetId` unchanged at `iec60364_lv_v1` (the underlying standard edition
  did not change).
- All prior `SizingResult` audit fields remain stable; no new warning codes,
  no new error codes, no new response fields.

### Verification
- engine: 168 / 168 tests passing (+25 vs 0.4.0 — 20 new spot-checks + 3
  baseline canaries + 2 adjusted).
- host-web smoke: 5 / 5 passing.
- `tsc -p tsconfig.json --noEmit`: clean.

## [0.4.0] — Phase 4A / 4C baseline

Initial gated release covering Phases 1–4:

- Pipeline, 5 conditions, corrections, short-circuit, voltage drop.
- Ampacity bundle: Cu/PVC, Cu/XLPE, Al/PVC, Al/XLPE (all 3-loaded) + Cu/PVC,
  Cu/XLPE (2-loaded), all 50 Hz multicore, methods A1/A2/B1/B2/C/D1/D2.
- Dataset manifest (`getDatasetManifest`), `supportedCombinations`,
  `impedanceCoverage`, `kValueCoverage`.
- Worker envelope v1 (`{ ok, type, requestId, data? | error? }`) with frozen
  request/response contract.
- Static ESM JSON loader (`with { type: 'json' }`) — no Node `fs` dependency;
  runs unchanged in Node, browsers, and dedicated Web Workers.
- Host-web workspace consuming the frozen worker contract (Vite + React 18).

See `docs/dataset-matrix.md` and `docs/versioning-policy.md` for the full
shipped surface at 0.4.0.
