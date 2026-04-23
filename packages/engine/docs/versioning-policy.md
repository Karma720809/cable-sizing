# Versioning Policy

The engine exposes three version-like identifiers, each evolving on its own
cadence for its own audience.

## Identifiers

| Name | Source | Audience | Cadence |
|---|---|---|---|
| `engineVersion` | `src/version.ts` → `ENGINE_VERSION` | anyone interpreting a `SizingResult` | every logic / dataset change |
| `apiVersion`    | `src/api/manifest.ts` → `API_VERSION` | worker message consumers | only when envelope shape breaks |
| `datasetId`     | `src/data/datasets/*/meta.json` | anyone citing a result or auditing a calculation | only when the standard edition itself changes |

## When to bump what

### Bump `engineVersion` if…

- a calculation formula changes
- a dataset JSON changes (values, new methods, new combinations)
- a warning or error code is added, renamed, or given new semantics
- a field is added to `SizingResult` (even additively)
- default-resolution logic changes

### Bump `apiVersion` **only** if…

- a field is **removed** from a worker response envelope
- a field changes type or semantics in a way that breaks existing consumers
- a request type is renamed or retired
- the success/failure discriminator (`ok`) is re-interpreted

Adding a **new** request type or a **new** response variant is additive and does
**not** bump `apiVersion`. Consumers that don't know the new type simply never
send it.

### Bump `datasetId` if…

- the underlying standard edition changes (e.g. IEC 60364-5-52:2009 → future
  revision)
- the dataset is re-sourced from a different standard body

## Compatibility contract (API v1)

For as long as `apiVersion === 1`, the following is guaranteed:

- Every response has `{ ok: boolean, type: string, requestId: string }`.
- Success responses have `data` and never `error`.
- Failure responses have `error: { code, message, issues? }` and never `data`.
- `requestId` from the request is echoed verbatim on the response.
- `ping` always returns `{ engineVersion, apiVersion }`.
- Existing `error.code` values do not change meaning (new codes may be added).

Consumers should treat unknown `type` values as "response I don't know how to
render" rather than as protocol failure — this lets us add request types
additively.

## Result surface stability

Fields inside `SizingResult` are not part of the API version contract. They
evolve with `engineVersion`. A host app should:

- Read `result.engineVersion` to decide which renderer to use.
- Fall back gracefully when optional fields are missing (older engine bundles).

The Phase 4A.3 additions (`selectionDriver`, `ampacity.loadedConductorsUsed`,
`ampacity.selectedDatasetId`, `ampacity.selectedMethodRef`,
`ampacity.lookupPolicyUsed`) arrived with `engineVersion = 0.4.0`. Host apps
targeting older bundles should tolerate their absence.

## Dataset loader transport

Phase 4C moved `data/loader.ts` from Node-only `fs.readFileSync` to **static
ESM JSON imports** (`import x from './…json' with { type: 'json' }`). This
is a deliberate policy, not a coincidence of implementation:

- **The engine has no runtime filesystem dependency.** It runs unchanged in
  Node (Vitest, SSR), browsers, and dedicated Web Workers.
- **Datasets are inlined at bundle time.** Consumers that tree-shake will only
  pay for the datasets they reach via `loadDataset()` (today: all of them, as
  the loader references each in the `qualityCheck` pass).
- **Transport changes are not an API contract change.** As long as the
  `Dataset` shape, quality-check behaviour, and returned values are identical,
  swapping the transport (static imports ↔ future code-split variants ↔
  manifest-driven lazy loading) does **not** bump `apiVersion` and does not
  bump `engineVersion`.
- Any change that *alters* the Dataset shape or the quality-check result does
  bump `engineVersion` (and potentially `datasetId`).

### Supported-combinations semantics

`DatasetManifest.supportedCombinations` is defined to contain **only lookup-viable
combinations** — every enumerated entry must have at least one concrete
`(csaMm2, ampacityA)` row that the engine can resolve. A reference-method key
declared on a dataset but left with empty rows is filtered out of the manifest
and is considered *not* supported for planning/UI purposes. See
`docs/dataset-matrix.md` for the full rule.

This is a **compatibility invariant** for API v1: any future transport or
sourcing change must preserve "entries in `supportedCombinations` are always
lookup-viable." Adding new supported combinations (as each Stage 5 sub-gate
lands its source values) is strictly additive.

### Future: dataset import registry

The current loader enumerates each JSON file with an explicit `import`
statement. This is acceptable for the 13 files we bundle today but will not
scale gracefully as Stage 5+ adds datasets for E/F/G methods, 60 Hz, and
temperature-corrected resistance.

The target direction, to be introduced when the dataset count roughly doubles:

- A single `registry.ts` module that exports a typed map of all bundled
  datasets keyed by a manifest-style descriptor
  (`{ kind: 'ampacity', material: 'Cu', insulation: 'PVC', loadedConductors: 3, frequencyHz: 50 }`).
- The loader becomes a thin assembler over the registry; new datasets are
  added in one place and are automatically reachable by both `loadDataset()`
  and `getDatasetManifest()`.
- This is still a transport change per the rule above — no `apiVersion` bump.
