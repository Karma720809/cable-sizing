/**
 * A canonical, spec-valid CircuitInput used as the form's initial state.
 * Matches the shape the engine expects (see CircuitInputSchema).
 *
 * Keeping this as a plain object (not typed against CircuitInput) means the
 * host intentionally remains a *consumer* of the frozen contract — shape is
 * validated round-trip by the engine, not enforced at host compile time.
 */
export const DEFAULT_INPUT = {
  load: { type: 'general', powerKW: 25, powerFactor: 0.85, efficiency: 0.9, demandFactor: 1.0 },
  system: { voltageV: 400, phase: 3, frequencyHz: 50 },
  cable: {
    conductorMaterial: 'Cu',
    insulationType: 'PVC',
    coreConfiguration: '3C+N',
    cableType: 'multicore',
  },
  installation: {
    methodCode: 'C',
    ambientTempC: 30,
    soilResistivityK_m_W: null,
    groupCount: 1,
  },
  route: { lengthM: 50 },
  protection: {
    deviceType: 'MCB',
    ratedCurrentA: 50,
    operatingCurrentI2A: 72.5,
    tripTimeS: 0.1,
    shortCircuitKA: 10,
  },
  projectPolicy: {
    maxVoltageDropPercent: 5,
    useReactance: false,
    resistanceModel: 'fixed_reference',
    roundingPolicy: 'next_standard_csa',
  },
} as const;

export type DefaultInput = typeof DEFAULT_INPUT;
