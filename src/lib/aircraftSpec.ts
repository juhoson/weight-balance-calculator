import type { AircraftData } from '../data/aircraftData';
import type { AircraftSpec, Deviation, Severity } from '../types/airframeImport';

/** The calculator's built-in aircraft as an import spec, e.g. as a starting point. */
export function specFromAircraftData(key: string, aircraft: AircraftData): AircraftSpec {
  const code = key.replace(/\s*\(.*\)\s*$/, '');
  return JSON.parse(JSON.stringify({
    code,
    name: aircraft.type,
    mtow: aircraft.mtow,
    stations: aircraft.stations,
    envelope: aircraft.envelope,
    performance: aircraft.performance,
  }));
}

export function cloneSpec(spec: AircraftSpec): AircraftSpec {
  return JSON.parse(JSON.stringify(spec));
}

export const STATION_LABELS: Record<string, string> = {
  pilotFront: 'Pilot & front passenger',
  passengerRear: 'Rear passengers',
  passengerBack: 'Back passengers',
  baggage: 'Baggage',
  fuel: 'Fuel',
};

export const SECTION_ORDER = ['Empty weight', 'Weight & CG limits', 'CG envelope', 'Loading stations', 'Performance'];

/** Which part of the aircraft data a deviation belongs to, for grouping on the review screen. */
export function sectionOf(field: string): string {
  if (field === 'emptyWeight' || field === 'emptyArm') return 'Empty weight';
  if (field === 'mtow' || field.startsWith('envelope.limits')) return 'Weight & CG limits';
  if (field.startsWith('envelope.')) return 'CG envelope';
  if (field.startsWith('stations.')) return 'Loading stations';
  return 'Performance';
}

export function countBySeverity(deviations: Deviation[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { ALERT: 0, WARNING: 0, INFO: 0 };
  deviations.forEach(d => { counts[d.severity] += 1; });
  return counts;
}

/** Up to 4 decimals, no trailing zeros. */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return Number(value.toFixed(4)).toString();
}

export function formatDifference(d: Deviation): string {
  if (d.difference === null) return '—';
  const sign = d.difference > 0 ? '+' : '';
  const unit = d.unit ? ` ${d.unit}` : '';
  const pct = d.percentDifference === null ? '' : ` (${sign}${d.percentDifference.toFixed(1)}%)`;
  return `${sign}${formatNumber(d.difference)}${unit}${pct}`;
}
