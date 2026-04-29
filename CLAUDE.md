# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

This repo (`cable-sizing/`) is the npm-workspaces monorepo that ships the cable-sizing engine and its browser host. In typical local setups it sits alongside two **read-only reference directories** one level up that hold the source-of-truth specs:

- `../고압/` — 22.9 kV MV reference (Korean PRD, Calc Spec, Amendments, manufacturer dataset source). Authoritative spec input for `packages/engine/src/mv/`. Never modify.
- `../저압 설계변경서/` — LV v1.3 input-automation design change (`Design_Change_LV_..._v1.3_FINAL.md`, `Implementation_Spec_LV_v2.0.md`, `Claude_Code_Prompts_LV_v2.0.md`). The MIG-TC / GC-LV-AUTO acceptance criteria and CR-OQ-* decision codes referenced throughout the engine come from here.

The remote is `https://github.com/Karma720809/cable-sizing` and `main` auto-deploys to Vercel (build command lives in `vercel.json`). Push to `main` is intentionally restricted — land changes via a feature branch + PR.

## Common commands

```bash
# Full monorepo
npm install
npm run build       # builds engine, then host-web (tsc + vite build)
npm run typecheck   # tsc --noEmit on every workspace
npm run test        # vitest run on every workspace

# Engine-only
npm --workspace packages/engine run test
npm --workspace packages/engine run coverage

# Host-web dev server (loads the engine via Web Worker)
npm --workspace packages/host-web run dev   # http://localhost:5173/
npm --workspace packages/host-web run preview

# Single test file or pattern
npx vitest run packages/engine/src/mv/golden-cases.test.ts
npx vitest run -t "TC-01"

# Dataset integrity sanity check (LV + MV loaders)
npx vitest run packages/engine/src/data/loader.test.ts \
              packages/engine/src/mv/data-mv.test.ts
```

The host package consumes `@cable-sizing/engine` from its built `dist/`, so **after editing engine code rebuild it** (`npm --workspace packages/engine run build`) before the host picks up changes — `vitest`/`tsc` in the host package will otherwise typecheck against the previous build.

## High-level architecture

**Two-package monorepo, calc engine + browser host, Web Worker boundary.**

### `packages/engine` — pure TypeScript calculation engine

- No DOM, no Node `fs` at runtime; datasets are static `import … with { type: 'json' }` so the same module runs under Vitest (Node), Vite (browser), and inside a Web Worker.
- Two parallel sizing pipelines, both expressed as a 10-step orchestrator that emits a structured `auditTrail`:
  - **LV** — `sizeCable(input)` in `src/orchestrator/pipeline.ts`. IEC 60364-5-52 + KS, dataset `iec60364_lv_v1`. Voltage-class agnostic physics primitives (`physics/voltage-drop.ts`, `physics/short-circuit.ts`, `physics/current.ts`) live one level up and are shared with MV.
  - **MV** — `sizeCableMv(input)` in `src/mv/pipeline-mv.ts`. Korean 22.9 kV CNCV-W per KEPCO ES 6145, dataset `mv_22kv_kr_v1`. Adds charging current `Ic = 2π·f·C·U₀` (with conservative `I_eff = √(IB² + Ic²)` blending), screen short-circuit verification with auto-fill from the dataset, and `k1·k2·k3·k4` corrections via "round input toward harsher conditions" lookup. The MV path lives in `src/mv/` and never edits LV files.
- **Lookup discipline matters.** Ampacity / impedance / k-value / capacitance use **exact-match only** (`utils/lookup.ts:exactOnly`); a missing combination is a fatal `E-…-LOOKUP-…` error, not a silent fallback. Correction-factor tables use safe-side neighbor (`exactOrSafeSide` for LV; conservative-by-direction for MV) and emit `W-LOOKUP-SAFE-SIDE` whenever a non-exact resolution happens.
- **Three independent version identifiers** — see `packages/engine/docs/versioning-policy.md`. Bump rules:
  - `engineVersion` (`src/version.ts`) — every logic, dataset, warning/error code, or `SizingResult` shape change.
  - `apiVersion` (`src/api/manifest.ts`) — only when the worker envelope shape breaks compatibility.
  - `datasetId` — only when the underlying standard edition changes.
  When you bump `engineVersion`, search for tests that hardcode the old version (e.g. `temperature-correction.integration.test.ts`).
- `decimal.js` is used wherever rounding could affect a borderline csa selection; `zod` (`src/api/schema.ts`) validates the LV `CircuitInput` at the worker boundary. The MV input is currently validated inside `pipeline-mv.ts` (errors surface in `result.errors`, not in the envelope), which is intentional.
- Dataset JSON is loaded once and frozen (`Object.freeze`) by `loadDataset()` / `loadMvDataset()`. Tests that load the dataset reset the cache via `__resetDatasetCache()` / `__resetMvDatasetCache()` to keep ordering stable.
- **LV v1.3 input automation (engine 0.12.0).** Three layers cooperate, each pure-function: (a) `src/derivation/` derives `designCurrent`, `loadedConductors`, correction factors, and `armourCsa` from the input, returning a `FieldState<T>` with `source` (`auto_formula` / `auto_dataset` / `user` / `override` / `legacy_preserved`) and `status`. (b) `src/migration/` ports v1.x payloads (Patch-1 correction-factor preservation, Patch-2 source mapping, Patch-3 discarded fields). (c) The orchestrator emits `SizingResult.fieldStates` and `result.info[]` as an **additive sidecar** alongside the frozen v1 envelope — pre-v1.3 consumers ignore the new fields (Adjustment-3 / AC-17/18). When you add a new derived value, build the FieldState via `FieldStateBuilder` rather than constructing literals.

### `packages/host-web` — Vite + React + dedicated Web Worker

- `src/worker/engine.worker.ts` calls `installWorkerHandler()` from the engine; the host never imports `sizeCable` / `sizeCableMv` directly. All UI ↔ engine traffic goes through the **frozen v1 envelope** documented in `packages/engine/docs/worker-protocol.md`. New UI features must extend, never break, that envelope.
- `useEngineWorker()` (`src/hooks/useEngineWorker.ts`) wraps `postMessage` in a Promise-based API correlated by `requestId`. It surfaces `sizeCable`, `sizeCableMv`, `validate`, `manifest`, and `ping`.
- `CircuitForm` is a single form with a top-level `voltageClass` selector; the LV and MV branches share `FormState` but render disjoint fieldsets, and `App.tsx` chooses `engine.sizeCable` vs `engine.sizeCableMv` based on `form.voltageClass`. `ResultPanel` likewise dispatches on `res.type` (`sizeCable:result` vs `sizeCableMv:result`) — keep both branches in sync when adding fields.
- `smoke.test.ts` at the host level invokes the engine's `handleWorkerMessage()` directly to round-trip the form-builder output through the real protocol without spinning up a Worker; treat that file as the contract test between host and engine.
- `src/components/circuit/` holds the v1.3 atomic components (SourceIcon, StatusBadge, DerivedFieldDisplay, OverrideToggle, ReferenceMethodSelector, NeutralLoadToggle, LoadInputFields). They are zero-dep (inline SVG, plain CSS variables defined in `styles.css` — no shadcn, no Tailwind). `DerivedFieldDisplay` consumes `SizingResult.fieldStates[fieldId]` directly; the form passes the latest sizing `result` down so derived rows render alongside the inputs that drove them. `state/overrideDrafts.ts` is the session-only store backing CR-OQ-4 (override toggle off → on restores last typed value; never persisted).
- **Vitest environment split.** `vitest.config.ts` only loads jsdom for files ending in `*.dom.test.tsx` (`environmentMatchGlobs`). Pure tests stay as `*.test.ts` / `*.test.tsx` and run under Node. Component tests calling `render()` from `@testing-library/react` MUST be named `*.dom.test.tsx` or they fail with `document is not defined`. For controlled `<input type="number">` whose onChange does `Number(e.target.value)`, prefer `fireEvent.change(input, { target: { value: '500' } })` over `userEvent.clear` + `userEvent.type` — the latter is flaky against the engine's coerce-to-0-on-empty pattern.

## When extending

- **Adding a sizing rule** (LV or MV): put the math in `physics/` if it is voltage-agnostic, otherwise in the appropriate pipeline-specific module. Update the orchestrator, add an `AuditStep`, define error/warning codes in `types/index.ts` (LV codes coexist with MV codes in the same union — keep the prefixes `E-` / `W-` and `E-MV-` / `W-MV-`), and write a Golden Case in `packages/engine/src/mv/golden-cases.test.ts` (MV) or `orchestrator/golden-cases.test.ts` (LV).
- **Changing dataset values**: edit JSON, run the loader test, bump `engineVersion`, and update the Sourcing history in `packages/engine/docs/dataset-matrix.md`. The MV dataset's `meta.json` must keep `status: "approved"` — the loader rejects anything else.
- **Worker protocol changes**: see `packages/engine/docs/worker-protocol.md`. Adding a new request type is additive (no `apiVersion` bump). Removing or reshaping is a breaking change.
- **Adding a regression case (LV v1.3+).** The canonical regression set lives as JSON fixtures consumed by `describe.each` runners — extend by dropping a JSON file, no runner edits required for an existing family:
  - `packages/engine/src/orchestrator/fixtures/GC-LV-NN.json` (real-number accuracy) and `GC-LV-AUTO-NN.json` (FieldState provenance / info / warning behavior) — runner: `fixtures/runner.test.ts`. Assertions are key-driven: include `recommendedCSAmm2`, `fieldStates[fieldId].source`, `warningCodes[]`, `infoCodes[]`, etc. only when you intend to assert them.
  - `packages/engine/src/migration/fixtures/MIG-TC-NN.json` — runner dispatches on `target` (`migrateLegacyInput` / `applyCorrectionFactorPolicy` / `checkEquivalence`).
  After adding the JSON, register it in the runner's `import … with { type: 'json' }` list and append to the `FIXTURES` array. Inline TS golden tests (`golden-cases.test.ts` with TC-001..TC-012) still exist as a thinner regression layer and should not be deleted.
- **Sidecar envelope rule.** `SizingResult.fieldStates` and `result.info` are optional/additive only. Any change that reshapes a pre-v1.3 SizingResult key, removes an existing key, or makes an existing optional field required is a breaking change and must bump `apiVersion`. The regression net is `packages/engine/src/api/sidecar-compat.test.ts` — keep it green.
