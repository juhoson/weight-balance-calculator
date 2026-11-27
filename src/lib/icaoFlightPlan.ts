/**
 * The ICAO flight plan (FPL, ICAO Doc 4444 appendix 2) for a VFR flight, from the plan in the app.
 * Item 15 takes only published significant points (designators) or coordinates: a visual reporting
 * point, a position and an airfield on the way are given as coordinates (degrees and minutes), an
 * IFR fix of the AIP by its name.
 */
import data from '../data/swedenFixes.json';
import { parsePosition, positionName } from './routePoint';

const FIXES = (data as { points: Array<{ name: string; lat: number; lon: number }> }).points;

const pad = (n: number, width: number) => String(Math.max(0, Math.round(n))).padStart(width, '0');

/** Degrees and minutes, as item 15 writes them: 5935N01638E. */
export function fplCoordinates(lat: number, lon: number): string {
  const part = (deg: number, width: number, pos: string, neg: string) => {
    const total = Math.round(Math.abs(deg) * 60);
    return `${pad(Math.floor(total / 60), width)}${pad(total % 60, 2)}${deg < 0 && total > 0 ? neg : pos}`;
  };
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return part(lat, 2, 'N', 'S') + part(wrapped, 3, 'E', 'W');
}

/** An aerodrome with an ICAO location indicator; anything else (SE-0062, KF45) is ZZZZ in the plan. */
export const isIcaoAerodrome = (code: string) => /^[A-Z]{4}$/.test(code);

/** A point on the way: an airfield (by code), or a position (by its route code). */
export interface FplPoint { code: string; lat: number; lon: number }

/** The AIP's IFR fix a point is, when it's one (by its name, at its place); null otherwise. */
function fixAt(p: FplPoint): string | null {
  const name = positionName(p.code);
  if (!name || !/^[A-Z]{5}$/.test(name)) return null;
  const fix = FIXES.find(f => f.name === name);
  return fix && Math.hypot(fix.lat - p.lat, (fix.lon - p.lon) * Math.cos((p.lat * Math.PI) / 180)) * 60 < 0.5 ? name : null;
}

/** How item 15 writes a point: an IFR fix by its name; anything else (reporting point, position, airfield) as coordinates. */
export function routeElement(p: FplPoint): string {
  const fix = fixAt(p);
  if (fix) return fix;
  const at = parsePosition(p.code) ?? p;
  return fplCoordinates(at.lat, at.lon);
}

/** The points item 15 can't name, and so gives as coordinates: for the remarks. */
export function namedAsCoordinates(points: FplPoint[]): Array<{ element: string; name: string }> {
  return points.flatMap(p => {
    if (fixAt(p)) return [];
    const name = positionName(p.code) ?? (parsePosition(p.code) ? null : p.code);
    return name ? [{ element: routeElement(p), name }] : [];
  });
}

export interface FlightPlanInput {
  /** Item 7: the registration without the dash (SEKMI). */
  callsign: string;
  /** Item 9: ICAO type designator (Doc 8643), e.g. P28A; wake turbulence category. */
  aircraftType: string;
  wake: 'L' | 'M' | 'H';
  /** Item 10: equipment / surveillance, e.g. "SY/C". */
  equipment: string;
  departure: { code: string; name: string; lat: number; lon: number };
  /** Item 13: estimated off-block time. */
  offBlock: Date;
  /** Item 15. */
  speedKt: number;
  /** Feet (an altitude, A030), or 'VFR'. */
  level: number | 'VFR';
  via: FplPoint[];
  destination: { code: string; name: string; lat: number; lon: number };
  /** Item 16: total estimated elapsed time, minutes. */
  eetMinutes: number;
  alternate: string;
  /** Item 18 remarks, free text. */
  remarks: string;
  /** Item 19. */
  enduranceMinutes: number;
  /** Usable fuel on board at departure, litres. */
  fuelLiters: number;
  personsOnBoard: number;
  /** Aircraft colours and markings. */
  colours: string;
  pilot: string;
}

const hhmm = (minutes: number) => `${pad(Math.floor(minutes / 60), 2)}${pad(minutes % 60, 2)}`;
const utcHhmm = (d: Date) => `${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}`;
const yymmdd = (d: Date) => `${pad(d.getUTCFullYear() % 100, 2)}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}`;
/** Item 18 and 19 text: upper case, without the characters an ATS message can't carry. */
const clean = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[Øø]/g, 'O').replace(/[Ææ]/g, 'AE').replace(/ß/g, 'SS').toUpperCase().replace(/[^A-Z0-9 .,/?+=:'()-]/g, '').replace(/[()-]/g, ' ').replace(/\s+/g, ' ').trim();

export interface FlightPlan {
  /** The items, each as it goes in the plan, for filling in a form. */
  items: Array<{ item: string; label: string; value: string }>;
  /** The whole plan as an ATS message: (FPL-...). */
  message: string;
  /** Item 19, given to the ATS reporting office with the plan (not part of the message). */
  supplementary: string;
  /** What a filing form asks besides the message: fuel, endurance, persons on board. */
  onBoard: Array<{ label: string; value: string }>;
}

/** The flight plan for a VFR flight (rules V, general aviation). */
export function flightPlan(i: FlightPlanInput): FlightPlan {
  const dep = isIcaoAerodrome(i.departure.code) ? i.departure.code : 'ZZZZ';
  const dest = isIcaoAerodrome(i.destination.code) ? i.destination.code : 'ZZZZ';
  const speed = `N${pad(i.speedKt, 4)}`;
  const level = i.level === 'VFR' ? 'VFR' : `A${pad(i.level / 100, 3)}`;
  const route = i.via.length ? i.via.map(p => `DCT ${routeElement(p)}`).join(' ') + ' DCT' : 'DCT';
  const named = namedAsCoordinates(i.via);
  const item18 = [
    `DOF/${yymmdd(i.offBlock)}`,
    dep === 'ZZZZ' ? `DEP/${clean(i.departure.name)} ${fplCoordinates(i.departure.lat, i.departure.lon)}` : null,
    dest === 'ZZZZ' ? `DEST/${clean(i.destination.name)} ${fplCoordinates(i.destination.lat, i.destination.lon)}` : null,
    i.remarks.trim() || named.length
      ? `RMK/${clean([named.length ? `VIA ${named.map(n => `${n.name} ${n.element}`).join(' ')}` : '', i.remarks].filter(Boolean).join(' '))}`
      : null,
  ].filter(Boolean).join(' ');
  const items = [
    { item: '7', label: 'Aircraft identification', value: clean(i.callsign).replace(/[^A-Z0-9]/g, '') },
    { item: '8', label: 'Flight rules / type of flight', value: 'VG' },
    { item: '9', label: 'Type of aircraft / wake turbulence', value: `${clean(i.aircraftType)}/${i.wake}` },
    { item: '10', label: 'Equipment / surveillance', value: clean(i.equipment).replace(/\s/g, '') },
    { item: '13', label: 'Departure aerodrome and time (UTC)', value: `${dep}${utcHhmm(i.offBlock)}` },
    { item: '15', label: 'Cruising speed, level and route', value: `${speed}${level} ${route}` },
    { item: '16', label: 'Destination, total EET and alternate', value: `${dest}${hhmm(i.eetMinutes)}${i.alternate.trim() ? ` ${clean(i.alternate)}` : ''}` },
    { item: '18', label: 'Other information', value: item18 },
  ];
  const v = (n: string) => items.find(x => x.item === n)?.value ?? '';
  const message = `(FPL-${v('7')}-${v('8')}\n-${v('9')}-${v('10')}\n-${v('13')}\n-${v('15')}\n-${v('16')}\n-${v('18')})`;
  const supplementary = [
    `E/${hhmm(i.enduranceMinutes)}`,
    `P/${pad(i.personsOnBoard, 3)}`,
    i.colours.trim() ? `A/${clean(i.colours)}` : null,
    i.pilot.trim() ? `C/${clean(i.pilot)}` : null,
  ].filter(Boolean).join(' ');
  const onBoard = [
    { label: 'Fuel on board', value: `${Math.round(i.fuelLiters)} L` },
    { label: 'Endurance (E/)', value: `${hhmm(i.enduranceMinutes)} (${Math.floor(i.enduranceMinutes / 60)} h ${pad(i.enduranceMinutes % 60, 2)} min)` },
    { label: 'Persons on board (P/)', value: String(i.personsOnBoard) },
  ];
  return { items, message, supplementary, onBoard };
}

/** Common light aircraft by the app's model codes: their ICAO type designators (Doc 8643). */
const TYPE_DESIGNATORS: Array<[RegExp, string]> = [
  [/PA-?28R/i, 'P28R'], [/PA-?28-?2(01|36)|PA-?28-?236/i, 'P28B'], [/PA-?28/i, 'P28A'], [/PA-?32R/i, 'P32R'], [/PA-?32/i, 'PA32'],
  [/PA-?18/i, 'PA18'], [/C?172RG/i, 'C72R'], [/C?172/i, 'C172'], [/R182/i, 'C82R'], [/C?182/i, 'C182'], [/C?152/i, 'C152'],
  [/C?150/i, 'C150'], [/DA-?40/i, 'DA40'], [/DA-?42/i, 'DA42'], [/DA-?20/i, 'DV20'], [/SR-?20/i, 'SR20'], [/SR-?22/i, 'SR22'],
  [/AA-?5/i, 'AA5'],
];

/** The ICAO type designator for one of the app's models, when it's a known one; '' otherwise. */
export const typeDesignator = (code: string) => TYPE_DESIGNATORS.find(([re]) => re.test(code))?.[1] ?? '';

/** A flight plan the pilot has filed: kept on the device, so the landing reminds them to close it. */
export interface FiledPlan {
  destination: string;
  /** Telephone number to close it on, as the pilot gave it; empty when none. */
  closePhone: string;
  filedAt: number;
}

const FILED_KEY = 'fpl.filed.v1';
/** A filed plan older than this is not reminded of. */
const FILED_KEEP_MS = 24 * 3600_000;

export function storeFiledPlan(p: FiledPlan | null): void {
  try {
    if (p) localStorage.setItem(FILED_KEY, JSON.stringify(p)); else localStorage.removeItem(FILED_KEY);
  } catch { /* private mode */ }
}

export function loadFiledPlan(now = Date.now()): FiledPlan | null {
  try {
    const p = JSON.parse(localStorage.getItem(FILED_KEY) ?? 'null') as FiledPlan | null;
    return p && now - p.filedAt < FILED_KEEP_MS ? p : null;
  } catch { return null; }
}
