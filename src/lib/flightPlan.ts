// Reads a pasted ICAO flight plan: a whole FPL message, or just the route (item 15) such as
// "ESSX DCT ESOW DCT 5930N01700E DCT ESSA", as copied from SkyDemon, ForeFlight or a filed plan.

export interface ParsedFlightPlan {
  /** Departure from item 13, or the first airport of a bare route. */
  from: string | null;
  /** Destination from item 16, or the last airport of a bare route. */
  to: string | null;
  /** Points between, in order: airport codes and ICAO positions (5930N01700E). */
  via: string[];
  /** Route elements this app cannot place, with why. */
  skipped: { token: string; reason: string }[];
}

const SPEED_LEVEL = /^[NKM]\d{3,4}(?:[AF]\d{3}|[SM]\d{4}|VFR)$/;
/** 59N017E, 5930N01700E, 593015N0170030E (ForeFlight may put a slash between). */
const POSITION = /^(\d{2}|\d{4}|\d{6})([NS])\/?(\d{3}|\d{5}|\d{7})([EW])$/;
const AIRPORT = /^[A-Z]{2}[A-Z0-9]{2}$/;
const AIRWAY = /^[A-Z]{1,2}\d{1,3}[A-Z]?$/;
const BEARING_DISTANCE = /^[A-Z0-9]{2,5}\d{6}$/;

function position(token: string): string | null {
  const m = POSITION.exec(token);
  // Latitude and longitude must have the same precision: 2/3, 4/5 or 6/7 digits.
  if (!m || m[3].length !== m[1].length + 1) return null;
  return `${m[1]}${m[2]}${m[3]}${m[4]}`;
}

/** The route elements of item 15 as points; ignores DCT, VFR/IFR and speed/level groups. */
function routePoints(tokens: string[], skipped: ParsedFlightPlan['skipped']): string[] {
  const points: string[] = [];
  for (const raw of tokens) {
    if (!raw || raw === 'DCT' || raw === 'VFR' || raw === 'IFR' || raw === 'T' || SPEED_LEVEL.test(raw)) continue;
    const pos = position(raw);
    if (pos) { points.push(pos); continue; }
    // A point with a speed/level change: ESOW/N0100A045.
    const token = raw.includes('/') ? raw.split('/')[0] : raw;
    if (!token || SPEED_LEVEL.test(token)) continue;
    const pos2 = position(token);
    if (pos2) points.push(pos2);
    else if (AIRPORT.test(token)) points.push(token);
    else if (BEARING_DISTANCE.test(token)) skipped.push({ token, reason: 'bearing/distance from a point: use a position instead' });
    else if (/^[A-Z]{5}$/.test(token)) skipped.push({ token, reason: 'named point: not in this app\'s data' });
    else if (/^[A-Z]{2,3}$/.test(token)) skipped.push({ token, reason: 'navaid: not in this app\'s data' });
    else if (AIRWAY.test(token)) skipped.push({ token, reason: 'airway: flown as direct' });
    else skipped.push({ token, reason: 'not recognised' });
  }
  return points;
}

/** Item 13 / 16 field: "ESSX1200" or "ESSA0130 ESGG" → the aerodrome, null for ZZZZ/AFIL. */
const aerodrome = (field: string | undefined): string | null => {
  const m = /^([A-Z]{4})\d{4}/.exec((field ?? '').trim());
  return m && m[1] !== 'ZZZZ' && m[1] !== 'AFIL' ? m[1] : null;
};

export function parseFlightPlan(text: string): ParsedFlightPlan {
  const clean = text.toUpperCase().replace(/[()]/g, ' ').replace(/\s+/g, ' ').trim();
  const skipped: ParsedFlightPlan['skipped'] = [];

  // A whole FPL message: fields separated by "-"; item 13 is the first field like ESSX1200.
  if (/(^|\s)FPL-/.test(clean) || /^-?\s*[A-Z]{4}\d{4}\s*-/.test(clean)) {
    const fields = clean.slice(clean.indexOf('FPL') >= 0 ? clean.indexOf('FPL') : 0).split(/\s*-\s*/);
    const i13 = fields.findIndex(f => /^[A-Z]{4}\d{4}$/.test(f));
    if (i13 >= 0) {
      const from = aerodrome(fields[i13]);
      const route = fields[i13 + 1] ?? '';
      const to = aerodrome(fields[i13 + 2]);
      if (!from) skipped.push({ token: fields[i13].slice(0, 4), reason: 'departure is not an ICAO airport' });
      if (!to) skipped.push({ token: (fields[i13 + 2] ?? '').slice(0, 4), reason: 'destination is not an ICAO airport' });
      let via = routePoints(route.split(' '), skipped);
      // Some planners repeat the aerodromes inside the route.
      if (from && via[0] === from) via = via.slice(1);
      if (to && via[via.length - 1] === to) via = via.slice(0, -1);
      return { from, to, via, skipped };
    }
  }

  // A bare route: the first and last airports are the departure and destination.
  const points = routePoints(clean.split(' '), skipped);
  const first = points[0] && AIRPORT.test(points[0]) ? points[0] : null;
  const last = points.length > 1 && AIRPORT.test(points[points.length - 1]) ? points[points.length - 1] : null;
  return { from: first, to: last, via: points.slice(first ? 1 : 0, last ? -1 : undefined), skipped };
}
