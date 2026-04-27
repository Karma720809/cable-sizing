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

/**
 * Defaults for the 22.9kV MV (Korean distribution) form. The engine treats
 * the system as fixed (22900 V phase-to-phase, 13200 V line-to-ground,
 * 3-phase 60 Hz, Cu/XLPE), so those values are not exposed as inputs.
 *
 * Initial values mirror Calc Spec v0.2 §13 TC-01: 1000kVA TR, direct
 * buried, trefoil, 0.5km, base soil/temp/depth.
 */
export const DEFAULT_MV_INPUT = {
  load: {
    type: 'transformer' as const,
    powerKW: null as number | null,
    apparentPowerMVA: 1.0 as number | null,
    powerFactor: null as number | null,
    efficiency: null as number | null,
    demandFactor: null as number | null,
  },
  system: { voltageV: 22900, lineToGroundV: 13200, phase: 3, frequencyHz: 60 },
  cable: {
    cableType: 'CNCV-W' as 'CNCV-W' | 'TR-CNCV-W' | 'FR-CNCO-W',
    screenCsaMm2: null as number | null,
    capacitanceUFPerKm: null as number | null,
  },
  installation: {
    method: 'direct_buried' as 'direct_buried' | 'duct_bank' | 'trough' | 'tunnel',
    formation: 'trefoil' as 'trefoil' | 'flat_touching' | 'flat_spaced',
    flatSpacingMm: null as number | null,
    soilResistivityK_m_W: 1.2,
    burialDepthM: 0.8,
    groupCount: 1,
    ambientTempC: 25,
  },
  protection: {
    deviceType: 'VCB' as 'VCB' | 'Fuse' | 'Recloser',
    ratedCurrentA: 200,
    breakingKA: 25,
    tripTimeS: 0.5,
    shortCircuitKA: 12,
    earthFaultKA: null as number | null,
    earthFaultTimeS: null as number | null,
  },
  route: { lengthM: 500 },
  projectPolicy: {
    maxVoltageDropPercent: 3,
    verifyScreen: true,
    chargingCurrentThreshold: 0.01,
  },
};

export type DefaultMvInput = typeof DEFAULT_MV_INPUT;
