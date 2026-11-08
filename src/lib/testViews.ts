// Test helper: AirframeView objects built from the calculator's built-in aircraft.
import { aircraftData, type AircraftData } from '../data/aircraftData';
import type { AirframeView } from '../types/airframeImport';

let nextId = 1;

export function viewFromBuiltin(key: string, over: Partial<AirframeView> = {}): AirframeView {
  const a: AircraftData = aircraftData[key];
  const match = key.match(/^(.*?)\s*\((.+)\)$/) as RegExpMatchArray;
  return {
    id: nextId++,
    registration: match[2],
    owned: false,
    typeKind: 'VARIANT',
    typeStatus: 'CURATED',
    verification: 'UNVERIFIED',
    weighedOn: null,
    basicEmptyWeight: a.basicEmptyWeight,
    armAftDatum: a.armAftDatum,
    spec: JSON.parse(JSON.stringify({
      code: match[1], name: a.type, mtow: a.mtow, stations: a.stations, envelope: a.envelope, performance: a.performance,
    })),
    ...over,
  };
}

export const allBuiltinViews = (): AirframeView[] => Object.keys(aircraftData).map(k => viewFromBuiltin(k));
