// Club aircraft on the admin page (weight-balance-backend ClubAircraftDtos).
import type { AircraftSpec, ImportPreviewResponse, TypeKind, TypeStatus, Verification } from './airframeImport';

export type ChangeAction = 'ADDED' | 'UPDATED' | 'REMOVED';

export interface ChangeView {
  id: number;
  /** null once the aircraft has been removed */
  airframeId: number | null;
  registration: string;
  action: ChangeAction;
  summary: string;
  changedBy: string | null;
  changedAt: string;
}

export interface ClubAircraft {
  id: number;
  registration: string;
  typeKind: TypeKind;
  typeStatus: TypeStatus;
  verification: Verification;
  weighedOn: string | null;
  emptyWeightKg: number;
  emptyArmM: number;
  /** The values the calculator uses, named with the aircraft's model name. */
  spec: AircraftSpec;
  /** Weighings on record; the latest is in use. */
  weighings: number;
  /** Signed-in pilots who show this aircraft in their calculator. */
  shownToPilots: number;
  lastChange: ChangeView | null;
}

/** One value an edit changes, formatted for display (null when not set). */
export interface ValueChange {
  field: string;
  label: string;
  unit: string | null;
  from: string | null;
  to: string | null;
}

export interface EditPreviewResponse {
  review: ImportPreviewResponse;
  changes: ValueChange[];
}
