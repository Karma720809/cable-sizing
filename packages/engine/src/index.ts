/**
 * @cable-sizing/engine — public API (Stage 1)
 *
 * Stage 1 exposes the *layered* building blocks. The orchestrator
 * (`sizeCable(input): SizingResult`) arrives in Stage 2.
 */

// Types
export * from './types/index.js';
export { ENGINE_VERSION } from './version.js';

// Data
export { loadDataset, DatasetQualityError } from './data/loader.js';

// Physics
export { designCurrent } from './physics/current.js';
export type { DesignCurrentInput, DesignCurrentBreakdown } from './physics/current.js';
export { voltageDrop } from './physics/voltage-drop.js';
export type { VoltageDropInput, VoltageDropBreakdown } from './physics/voltage-drop.js';
export { shortCircuitCSA } from './physics/short-circuit.js';
export type { ShortCircuitInput, ShortCircuitBreakdown } from './physics/short-circuit.js';

// Standard rules (IEC 60364)
export { environmentOf, groupingTableKey, soilTableKey } from './standards/iec60364/reference-methods.js';
export type { InstallationEnvironment } from './standards/iec60364/reference-methods.js';
export { computeK1, computeK2, computeK3, computeCorrections } from './standards/iec60364/corrections.js';
export type { CombinedCorrections } from './standards/iec60364/corrections.js';
export { resolveAmpacityRows, selectCsaForRequiredIz, ampacityAtCsa } from './standards/iec60364/ampacity-lookup.js';
export type { AmpacityTableKey } from './standards/iec60364/ampacity-lookup.js';
export { lookupImpedance } from './standards/iec60364/impedance-lookup.js';
export type { ImpedanceKey, ImpedanceHit } from './standards/iec60364/impedance-lookup.js';
export { lookupKValue } from './standards/iec60364/k-value-lookup.js';
export type { KValueHit } from './standards/iec60364/k-value-lookup.js';

// Utils
export { exactOrSafeSide, exactOnly, selectFirstAtLeast, nextStandardAtLeast } from './utils/lookup.js';
export type { LookupHit, LookupMatchType } from './utils/lookup.js';

// Orchestrator (Stage 2)
export { sizeCable } from './orchestrator/pipeline.js';
export type { SizeCableOptions } from './orchestrator/pipeline.js';
export { validateCircuitInput } from './orchestrator/validation.js';
export { applyDefaults } from './orchestrator/defaults.js';
export { AuditBuilder } from './orchestrator/audit.js';

// Public API (Stage 3C + Phase 4A) — zod validation, Worker protocol, manifest
export { CircuitInputSchema, parseCircuitInput } from './api/schema.js';
export type { CircuitInputParseResult } from './api/schema.js';
export { handleWorkerMessage, installWorkerHandler } from './api/worker.js';
export type {
  WorkerRequest,
  WorkerResponse,
  WorkerSuccess,
  WorkerFailure,
  WorkerValidationIssue,
  WorkerApiErrorCode,
} from './api/worker.js';
export { getDatasetManifest, API_VERSION } from './api/manifest.js';
export type { DatasetManifest, DatasetBundleEntry, SupportedCombination } from './api/manifest.js';
