// Mirrors the DTOs of weight-balance-backend (com.weightbalance.backend.dto).

export type SpeedUnit = 'KIAS' | 'MPH';

/** Type-level aircraft data: the calculator's AircraftData shape plus code and name. */
export interface AircraftSpec {
  code: string;
  name: string;
  mtow: number;
  stations: Record<string, StationSpec>;
  envelope: {
    points: Array<{ cg: number; weight: number }>;
    limits: { maxWeight: number; minWeight: number; forwardCG: number; aftCG: number };
  };
  performance: {
    speedUnit: SpeedUnit;
    maxDemoCrosswind: number;
    stallSpeedClean: number;
    stallSpeedLanding: number;
    bestClimbSpeed: number;
    bestGlideSpeed?: number | null;
    approachSpeedNormal: number;
    cruiseSpeed?: number | null;
    fuelConsumption: Array<{ powerSetting: string; litersPerHour: number; speed: number; speedUnit: SpeedUnit }>;
    taxiFuel: { liters: number; timeMinutes: number };
    reserveFuel: { minimumMinutes: number; recommendedLiters: number };
  };
}

/** Seats and baggage use maxWeight; fuel uses maxLiters / standardLiters / weightPerLiter. */
export interface StationSpec {
  arm: number;
  maxWeight?: number | null;
  maxLiters?: number | null;
  standardLiters?: number | null;
  weightPerLiter?: number | null;
}

export type Severity = 'INFO' | 'WARNING' | 'ALERT';
export type TypeStatus = 'CURATED' | 'USER_SUBMITTED' | 'AI_SUGGESTED';

export interface Deviation {
  field: string;
  label: string;
  unit: string | null;
  standardValue: number | null;
  importedValue: number | null;
  difference: number | null;
  percentDifference: number | null;
  severity: Severity;
  permissive: boolean;
  typeLevel: boolean;
  message: string;
}

export interface StandardSummary {
  id: number;
  code: string;
  name: string;
  status: TypeStatus;
  aiModel: string | null;
  aiNotes: string | null;
}

export interface StandardTypeResponse {
  standard: StandardSummary;
  spec: AircraftSpec;
  typicalEmptyWeightKg: number | null;
  typicalEmptyArmM: number | null;
}

export interface AirframeImportRequest {
  registration: string;
  emptyWeightKg: number;
  emptyArmM: number;
  weighedOn?: string | null;
  source?: 'MANUAL' | 'SCAN';
  sourceDocument?: string | null;
  spec: AircraftSpec;
  acknowledgedAlerts?: string[];
  /** Club aircraft only: its own home airfield (ICAO); empty/null = the club's. */
  homeAirport?: string | null;
}

export interface ImportPreviewResponse {
  standard: StandardSummary | null;
  standardSpec: AircraftSpec | null;
  deviations: Deviation[];
  matchesStandard: boolean;
  alertsRequiringAcknowledgement: string[];
  referenceNotice: string | null;
}

export interface ImportResult {
  airframeId: number;
  aircraftTypeId: number;
  usesStandard: boolean;
  acknowledgedAlerts: number;
}

export interface UnacknowledgedAlertsBody {
  message: string;
  unacknowledged: string[];
  deviations: Deviation[];
}

export type TypeKind = 'STANDARD' | 'VARIANT';
export type Verification = 'UNVERIFIED' | 'USER_CONFIRMED' | 'VERIFIED';

export interface ClubRef {
  id: number;
  name: string;
  /** ICAO code of the club's airfield, the default departure. */
  homeAirport?: string | null;
}

/** An aircraft from GET /api/airframes: type values plus the current weighing. */
export interface AirframeView {
  id: number;
  registration: string;
  owned: boolean;
  /** The club a shared aircraft belongs to; null for the user's own. */
  club?: ClubRef | null;
  typeKind: TypeKind;
  typeStatus: TypeStatus;
  verification: Verification;
  weighedOn: string | null;
  basicEmptyWeight: number;
  armAftDatum: number;
  spec: AircraftSpec;
  /** Default departure (ICAO): the aircraft's own home airfield, else its club's. */
  homeAirport?: string | null;
}

/**
 * From GET /api/aircraft-types/generic: the generic version of a model. The pilot enters the
 * empty weight and arm of their own aircraft; the typical values are the prefill.
 */
export interface GenericTypeView {
  typeId: number;
  typeStatus: TypeStatus;
  typicalEmptyWeight: number;
  typicalEmptyArm: number;
  spec: AircraftSpec;
}

/** From GET /api/clubs: a club, its aircraft, and which of them the signed-in user shows. */
export interface ClubView {
  id: number;
  name: string;
  homeAirport?: string | null;
  /** All of the club's aircraft are shown, including ones added later. */
  allAircraft: boolean;
  aircraft: Array<{ id: number; registration: string; code: string; name: string; selected: boolean }>;
}

export interface ClubSelectionRequest {
  clubs: Array<{ clubId: number; allAircraft: boolean; airframeIds?: number[] }>;
}
