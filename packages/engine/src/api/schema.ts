/**
 * Runtime (zod) validation schema for CircuitInput — Stage 3C.
 *
 * The engine core (`sizeCable`) already performs deep semantic validation and
 * emits E-VAL-* errors, but that path assumes a structurally-well-typed object.
 * Consumers that receive input across a trust boundary (Web Worker postMessage,
 * REST body, form submission, file import) need a *structural* gate first.
 *
 * `CircuitInputSchema.parse(raw)` throws on structural failure; `safeParse`
 * returns a discriminated result. Both return a `CircuitInput`-typed value on
 * success so downstream code stays strict-typed.
 */
import { z } from 'zod';
import type { CircuitInput } from '../types/index.js';

const loadSchema = z.object({
  type: z.enum(['general', 'motor', 'heater', 'lighting']),
  powerKW: z.number().finite().nullable(),
  powerFactor: z.number().finite().nullable(),
  efficiency: z.number().finite().nullable(),
  demandFactor: z.number().finite().nullable(),
  designCurrentOverrideA: z.number().finite().nullable().optional(),
});

const systemSchema = z.object({
  voltageV: z.number().finite(),
  phase: z.union([z.literal(1), z.literal(3)]),
  frequencyHz: z.union([z.literal(50), z.literal(60)]),
});

const cableSchema = z.object({
  conductorMaterial: z.enum(['Cu', 'Al']),
  insulationType: z.enum(['PVC', 'XLPE']),
  coreConfiguration: z.enum(['2C', '3C', '4C', '3C+N']),
  cableType: z.enum(['multicore', 'single-core']),
});

const installationSchema = z.object({
  methodCode: z.enum(['A1', 'A2', 'B1', 'B2', 'C', 'D1', 'D2', 'E', 'F', 'G']),
  ambientTempC: z.number().finite().nullable(),
  soilResistivityK_m_W: z.number().finite().nullable().optional(),
  groupCount: z.number().int().nullable(),
});

const routeSchema = z.object({
  lengthM: z.number().finite(),
});

const protectionSchema = z.object({
  deviceType: z.enum(['MCB', 'MCCB', 'Fuse', 'UserDefined']),
  ratedCurrentA: z.number().finite().nullable(),
  operatingCurrentI2A: z.number().finite().nullable().optional(),
  tripTimeS: z.number().finite().nullable(),
  shortCircuitKA: z.number().finite().nullable(),
});

const projectPolicySchema = z.object({
  maxVoltageDropPercent: z.number().finite(),
  useReactance: z.boolean(),
  ignoreReactanceBelowMm2: z.number().finite().optional(),
  resistanceModel: z.enum(['fixed_reference', 'temperature_corrected']),
  roundingPolicy: z.literal('next_standard_csa'),
});

export const CircuitInputSchema = z.object({
  load: loadSchema,
  system: systemSchema,
  cable: cableSchema,
  installation: installationSchema,
  route: routeSchema,
  protection: protectionSchema,
  projectPolicy: projectPolicySchema,
});

// Note: a compile-time assertion that `z.infer<typeof CircuitInputSchema>`
// exactly matches `CircuitInput` is tempting but runs afoul of
// exactOptionalPropertyTypes (zod emits `key?: T | undefined`, our interface
// uses `key?: T`). Runtime tests cover the structural contract; the `as
// CircuitInput` cast in parseCircuitInput is intentional.

export type CircuitInputParseResult =
  | { ok: true; value: CircuitInput }
  | { ok: false; issues: Array<{ path: string; message: string }> };

/**
 * Discriminated-union wrapper around `CircuitInputSchema.safeParse`.
 *
 * Flattens zod's issue tree to `{ path: "load.powerKW", message: "..." }`
 * for easy surfacing in UI forms or audit logs.
 */
export function parseCircuitInput(raw: unknown): CircuitInputParseResult {
  const r = CircuitInputSchema.safeParse(raw);
  if (r.success) return { ok: true, value: r.data as CircuitInput };
  const issues = r.error.issues.map((i) => ({
    path: i.path.join('.'),
    message: i.message,
  }));
  return { ok: false, issues };
}
