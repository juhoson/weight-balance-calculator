import type { RoutePoint } from '../types/route';

/** The reporting station a point's weather comes from; null without one. */
export const stationOf = (p: RoutePoint): string | null => p.metar?.station ?? p.station?.code ?? null;

export interface WeatherAlong {
  departure: RoutePoint | null;
  /** The waypoints' and en-route points' weather, each station once (the first point using it). */
  along: RoutePoint[];
  /** Points whose METAR is already shown (at the departure, the arrival or an earlier point), with that station. */
  repeated: Array<{ point: RoutePoint; station: string }>;
  arrival: RoutePoint | null;
}

/**
 * The route's weather cards, without repeats: a waypoint or en-route point whose weather comes from a
 * station already shown is left out (the departure and arrival always keep their own card, for the
 * runway wind check).
 */
export function weatherAlong(points: RoutePoint[], isLocal = false): WeatherAlong {
  const departure = points.find(p => p.role === 'DEPARTURE') ?? null;
  const arrival = isLocal ? null : points.find(p => p.role === 'ARRIVAL') ?? null;
  const shown = new Set<string>();
  [departure, arrival].forEach(p => { const s = p && stationOf(p); if (s) shown.add(s); });
  const along: RoutePoint[] = [];
  const repeated: WeatherAlong['repeated'] = [];
  points.filter(p => p.role === 'WAYPOINT' || p.role === 'ENROUTE').forEach(p => {
    const s = stationOf(p);
    if (s && shown.has(s)) { repeated.push({ point: p, station: s }); return; }
    if (s) shown.add(s);
    along.push(p);
  });
  return { departure, along, repeated, arrival };
}
