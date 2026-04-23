# Error & Warning Semantics

The engine distinguishes three kinds of signals:

1. **Engine errors (`E-*`)** — reported inside `SizingResult.errors[]`, fatal
   ones abort the pipeline and collapse `overallStatus` to `INCOMPLETE`.
2. **Warnings (`W-*`)** — reported inside `SizingResult.warnings[]`, informational
   but surface in the UI; presence alone turns `overallStatus` from `PASS` to
   `WARNING`.
3. **API-level failures (`E-API-*`)** — returned on the Worker failure envelope
   (`ok: false`). These never come back *inside* a `SizingResult`.

## E-API-* vs E-LOOKUP-*

A common confusion is "why did I get a `SizingResult` with `INCOMPLETE` instead
of a failure envelope?" The rule:

| Failure | Envelope | Code location |
|---|---|---|
| Input was not even structurally a `CircuitInput` | `ok: false` (failure) | `error.code = 'E-API-002'` |
| Input was structurally valid, but semantically wrong (e.g. `voltageV = 0`) | `ok: true` (success) | `result.errors[].code = 'E-VAL-001'` |
| Valid input, but dataset doesn't cover it (e.g. single-core) | `ok: true` (success) | `result.errors[].code = 'E-LOOKUP-001'` |
| Unknown request type | `ok: false` (failure) | `error.code = 'E-API-001'` |

The guiding principle: **`E-API-*` is about the message protocol; `E-*` is about
the calculation**. A consumer that successfully delivered a message, even if the
message's content doesn't yield a valid result, still gets a `SizingResult`
envelope with a partial audit trail.

## Engine error codes

| Code | Meaning | Fatal |
|---|---|---|
| `E-VAL-001` | voltage ≤ 0 | yes |
| `E-VAL-002` | powerFactor out of (0, 1] | yes |
| `E-VAL-003` | ground install (D1/D2) but `soilResistivityK_m_W` missing | yes |
| `E-VAL-004` | neither `powerKW` nor `designCurrentOverrideA` supplied | yes |
| `E-VAL-005` | `route.lengthM` ≤ 0 | yes |
| `E-VAL-006` | `groupCount` < 1 | yes |
| `E-VAL-007` | `ambientTempC` required but null | yes |
| `E-VAL-008` | `efficiency` / `demandFactor` out of (0, 1] | yes |
| `E-VAL-009` | `maxVoltageDropPercent` ≤ 0 | yes |
| `E-VAL-010` | invalid `phase` / `frequencyHz` | yes |
| `E-LOOKUP-001` | ampacity dataset not available for the requested 5-tuple | yes |
| `E-LOOKUP-002` | correction factor safe-side neighbor not available | yes |
| `E-LOOKUP-003` | impedance R/X for requested csa is missing | yes |
| `E-LOOKUP-004` | k-value not defined for the material/insulation pair | yes |
| `E-DOMAIN-001` | physical domain violation (e.g. efficiency = 0 → divide by zero) | yes |
| `E-CSA-001` | required csa exceeds the largest standard size | yes |
| `E-DATA-001` | dataset quality check failed at engine init | yes |

## Warning codes

| Code | Meaning |
|---|---|
| `W-DEFAULT-APPLIED` | One or more input fields were null → resolved via defaults table |
| `W-REACTANCE-IGNORED` | `ignoreReactanceBelowMm2` threshold caused reactance to be zeroed for small csa |
| `W-IB-OVERRIDE` | `designCurrentOverrideA` was used; load parameters bypassed |
| `W-I2-MISSING` | `operatingCurrentI2A` omitted → protection cond. 2 is `INCOMPLETE` |
| `W-LOOKUP-SAFE-SIDE` | At least one correction factor resolved via safe-side neighbor (non-exact match) |
| `W-PROTECTION-RECHECK` | IZ recheck loop had to bump the csa above ampacity-only selection |

## Overall status lattice

```
INCOMPLETE ← any fatal E-VAL-*, E-LOOKUP-*, E-DOMAIN-*, E-CSA-*, or W-I2-MISSING alone
PASS       ← all criteria PASS, no warnings
WARNING    ← all criteria PASS, at least one W-* present
FAIL       ← any criterion FAIL but no fatal error
```

## Lookup-miss → INCOMPLETE (not FAIL)

When a lookup fails (e.g. `E-LOOKUP-001` for an unsupported cable type), the
pipeline cannot produce a defensible recommendation. The result status is
`INCOMPLETE` rather than `FAIL` — `FAIL` means "we ran the check and it didn't
pass", while `INCOMPLETE` means "we were unable to run the check at all".

UIs should render:

- `PASS`       → green checkmark
- `WARNING`    → yellow chip + warning list
- `FAIL`       → red × + pointer to the failing criterion
- `INCOMPLETE` → neutral icon + message explaining which error code blocked the check
