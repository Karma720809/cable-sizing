# Worker Protocol — API v1

The `@cable-sizing/engine` Worker API is a JSON-serializable request/response
protocol. The engine exposes a pure dispatcher (`handleWorkerMessage`) plus an
optional self-binder (`installWorkerHandler`).

## Envelope

Every response is one of two shapes:

### Success

```ts
{
  ok: true,
  type: 'pong' | 'manifest:result' | 'validate:result' | 'sizeCable:result',
  requestId: string,
  data: <type-specific payload>
}
```

Success envelopes **never** contain an `error` field.

### Failure

```ts
{
  ok: false,
  type: 'error',
  requestId: string,
  error: {
    code: 'E-API-001' | 'E-API-002',
    message: string,
    issues?: Array<{ path: string; message: string }>
  }
}
```

Failure envelopes **never** contain a `data` field. The `issues[]` array is
present only when the failure came from zod structural validation.

## Request / response catalogue

### `ping`

Lightweight health check. Returns engine + API versions so UI can gate its
feature set.

```ts
// → request
{ id: 'r-1', type: 'ping' }

// ← response
{
  ok: true, type: 'pong', requestId: 'r-1',
  data: { engineVersion: '0.4.0', apiVersion: 1 }
}
```

### `manifest`

Returns a machine-readable snapshot of what the current engine build supports.

```ts
// → request
{ id: 'r-2', type: 'manifest' }

// ← response (abbreviated)
{
  ok: true, type: 'manifest:result', requestId: 'r-2',
  data: {
    manifest: {
      datasetId: 'iec60364_lv_v1',
      engineVersion: '0.4.0',
      apiVersion: 1,
      standardSizesMm2: [1.5, 2.5, 4, 6, 10, …, 300],
      bundledDatasets: [
        {
          id: 'amp_cu_pvc_3loaded_multicore_50',
          conductorMaterial: 'Cu',
          insulationType: 'PVC',
          loadedConductors: 3,
          cableType: 'multicore',
          frequencyHz: 50,
          methods: ['A1','A2','B1','B2','C','D1','D2'],
          csaRange: { minMm2: 1.5, maxMm2: 300 },
          sourceRef: '…'
        },
        …
      ],
      supportedCombinations: [
        {
          conductorMaterial: 'Cu',
          insulationType: 'PVC',
          loadedConductors: 3,
          frequencyHz: 50,
          method: 'C',
          availableCsaMm2: [1.5, 2.5, 4, …, 300]
        },
        …
      ],
      impedanceCoverage: [
        { conductorMaterial: 'Cu', cableType: 'multicore', frequencyHz: 50,
          insulationTypes: ['PVC','XLPE'] },
        …
      ],
      kValueCoverage: [
        { conductorMaterial: 'Cu', insulationType: 'PVC', kValue: 115,
          initialTempC: 70, finalTempC: 160 },
        …
      ]
    }
  }
}
```

### `validate`

Structural check against the zod schema. Does **not** run the sizing engine.

```ts
// → request
{ id: 'r-3', type: 'validate', input: <CircuitInput-shaped object> }

// ← response (valid)
{ ok: true, type: 'validate:result', requestId: 'r-3',
  data: { valid: true } }

// ← response (invalid)
{ ok: true, type: 'validate:result', requestId: 'r-3',
  data: {
    valid: false,
    issues: [{ path: 'system.phase', message: 'Invalid literal value, expected 1' }]
  } }
```

Note that a malformed input returns an **`ok: true`** envelope — validation
*succeeded* in identifying that the input is structurally wrong. `ok: false` is
reserved for protocol-level failures.

### `sizeCable`

End-to-end sizing. Structural validation happens first; a failure there short-
circuits to `E-API-002`.

```ts
// → request
{ id: 'r-4', type: 'sizeCable', input: <CircuitInput-shaped object> }

// ← response (success)
{
  ok: true, type: 'sizeCable:result', requestId: 'r-4',
  data: { result: <SizingResult> }
}

// ← response (structural failure)
{
  ok: false, type: 'error', requestId: 'r-4',
  error: {
    code: 'E-API-002',
    message: 'CircuitInput failed structural validation (2 issue(s))',
    issues: [
      { path: 'cable.insulationType', message: "Invalid enum value. …" },
      …
    ]
  }
}
```

Engine-level failures (E-VAL-*, E-LOOKUP-*, E-DOMAIN-*, E-CSA-*) do **not**
produce an `error` envelope — they come back on the `success` envelope with
`ok: true` and `overallStatus: 'INCOMPLETE'` inside `data.result`. This keeps
partial results (audit trail, warnings) renderable in the UI.

## Error code catalogue (API level)

| Code | Trigger | Issues included? |
|---|---|---|
| `E-API-001` | Unknown request `type` | no |
| `E-API-002` | `input` failed zod validation (only for `sizeCable`) | yes |

Engine-level error codes (`E-VAL-*`, `E-LOOKUP-*`, `E-DOMAIN-*`, `E-CSA-*`)
are defined in `docs/error-semantics.md` and surface **inside the
`SizingResult`**, not as an `E-API-*` failure.

## Client usage sketch

```ts
// main thread
const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const pending = new Map<string, (res: WorkerResponse) => void>();

worker.onmessage = (ev) => {
  const res = ev.data as WorkerResponse;
  pending.get(res.requestId)?.(res);
  pending.delete(res.requestId);
};

function call<T extends WorkerRequest>(req: T): Promise<WorkerResponse> {
  return new Promise((resolve) => {
    pending.set(req.id, resolve);
    worker.postMessage(req);
  });
}
```

```ts
// worker.ts
import { installWorkerHandler } from '@cable-sizing/engine';
installWorkerHandler();
```

## Versioning

`engineVersion` and `apiVersion` evolve on different cadences.

- Bump `engineVersion` for any calculation-logic or dataset change.
- Bump `apiVersion` **only** when the envelope shape (fields, types, semantics)
  changes in a way that breaks existing consumers. Adding a new request type
  with a new response variant is **not** a breaking change.

See `docs/versioning-policy.md` for the full compatibility contract.
