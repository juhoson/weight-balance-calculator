/**
 * A generic single-engine piston emergency checklist for the briefing pack: memory items common to
 * most light aeroplanes, deliberately without type-specific numbers. Not a substitute for the POH/AFM.
 */

export interface ChecklistItem {
  item: string;
  action: string;
}

export interface ChecklistSection {
  title: string;
  items: ChecklistItem[];
  note?: string;
}

export const EMERGENCY_REMINDER = 'Aviate, Navigate, Communicate';

export const GENERIC_EMERGENCY_CHECKLIST: ChecklistSection[] = [
  {
    title: 'Engine failure after take-off',
    items: [
      { item: 'Airspeed', action: 'BEST GLIDE' },
      { item: 'Landing area', action: 'AHEAD, within 30° either side' },
      { item: 'Fuel selector', action: 'OFF' },
      { item: 'Mixture', action: 'IDLE CUT-OFF' },
      { item: 'Magnetos', action: 'OFF' },
      { item: 'Flaps', action: 'AS REQUIRED' },
      { item: 'Master switch', action: 'OFF (once flaps are set)' },
    ],
    note: 'Do not turn back at low height.',
  },
  {
    title: 'Engine failure in flight',
    items: [
      { item: 'Airspeed', action: 'BEST GLIDE, trim' },
      { item: 'Landing area', action: 'CHOOSE, turn towards it' },
      { item: 'Fuel selector', action: 'OTHER TANK' },
      { item: 'Fuel pump', action: 'ON (if fitted)' },
      { item: 'Mixture', action: 'RICH' },
      { item: 'Carburettor heat', action: 'ON (if fitted)' },
      { item: 'Magnetos', action: 'BOTH, then L or R' },
      { item: 'Primer', action: 'IN AND LOCKED' },
    ],
    note: 'No restart: MAYDAY, squawk 7700, then the forced landing checks in the POH.',
  },
  {
    title: 'Engine fire in flight',
    items: [
      { item: 'Fuel selector', action: 'OFF' },
      { item: 'Mixture', action: 'IDLE CUT-OFF' },
      { item: 'Fuel pump', action: 'OFF' },
      { item: 'Cabin heat and air', action: 'OFF' },
      { item: 'Forced landing', action: 'LAND AS SOON AS POSSIBLE' },
    ],
  },
  {
    title: 'Electrical fire or smoke',
    items: [
      { item: 'Master switch', action: 'OFF' },
      { item: 'Cabin heat and air', action: 'OFF' },
      { item: 'Fire extinguisher', action: 'USE, then ventilate' },
      { item: 'Landing', action: 'AS SOON AS POSSIBLE' },
    ],
  },
  {
    title: 'Rough running or carburettor ice',
    items: [
      { item: 'Carburettor heat', action: 'ON (if fitted)' },
      { item: 'Mixture', action: 'RICH, then adjust' },
      { item: 'Fuel selector', action: 'OTHER TANK' },
      { item: 'Fuel pump', action: 'ON (if fitted)' },
      { item: 'Magnetos', action: 'CHECK L, R, BOTH' },
    ],
    note: 'If it continues: land at the nearest suitable airfield.',
  },
  {
    title: 'Radio failure',
    items: [
      { item: 'Transponder', action: '7600' },
      { item: 'Radio', action: 'CHECK volume, frequency, headset, switches' },
      { item: 'Frequency', action: 'TRY THE PREVIOUS ONE, then 121.5' },
    ],
    note: 'In controlled airspace follow the published radio failure procedure.',
  },
  {
    title: 'Lost',
    items: [
      { item: 'Confess', action: 'to yourself' },
      { item: 'Climb', action: 'for radio range and view, clear of cloud' },
      { item: 'Conserve', action: 'fuel: economy power' },
      { item: 'Communicate', action: 'PAN PAN on the frequency or 121.5' },
      { item: 'Comply', action: 'with the help given' },
    ],
  },
];

/** The MAYDAY call, in order. */
export const MAYDAY_CALL = [
  'MAYDAY MAYDAY MAYDAY',
  'Station called, own callsign and aircraft type',
  'Nature of the emergency',
  'Intentions',
  'Position, altitude and heading',
  'Persons on board, other information',
];
