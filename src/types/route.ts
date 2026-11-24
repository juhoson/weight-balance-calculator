// Mirrors weight-balance-backend's RouteWeather and airport DTOs.

export interface Runway {
  le: string;
  he: string;
  lengthFt: number | null;
  surface: string;
  leHeadingTrue: number | null;
  heHeadingTrue: number | null;
  /** Heading estimated from the runway number (magnetic, a few degrees off). */
  headingEstimated: boolean;
}

export interface AirportInfo {
  code: string;
  name: string;
  type: 'small' | 'medium' | 'large' | string;
  lat: number;
  lon: number;
  elevationFt: number | null;
  country: string;
  municipality: string;
  runways: Runway[];
}

export interface NearbyAirport {
  airport: AirportInfo;
  distanceNm: number;
}

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

export interface Metar {
  station: string;
  raw: string;
  observedAt: string | null;
  flightCategory: FlightCategory | null;
  /** True direction; null when variable or calm. */
  windDirTrue: number | null;
  windVariable: boolean;
  windKt: number | null;
  gustKt: number | null;
  /** 10000 = 10 km or more. */
  visibilityM: number | null;
  ceilingFt: number | null;
  tempC: number | null;
  dewpointC: number | null;
  qnhHpa: number | null;
}

export interface Taf {
  station: string;
  raw: string;
  issuedAt: string | null;
  validFrom: string | null;
  validTo: string | null;
}

export type RouteRole = 'DEPARTURE' | 'WAYPOINT' | 'ENROUTE' | 'ARRIVAL';

export interface RoutePoint {
  role: RouteRole;
  /** The airport this point is (departure, waypoint, arrival); null en route. */
  airportCode?: string | null;
  alongTrackNm: number;
  /** Where the weather comes from: the airport itself (0 NM) or the nearest reporting station. */
  station: { code: string; name: string; distanceNm: number } | null;
  metar: Metar | null;
  taf: Taf | null;
}

export interface RouteLeg {
  from: string;
  to: string;
  distanceNm: number;
  trueCourseDeg: number;
}

export interface RouteWeather {
  departure: AirportInfo;
  waypoints?: AirportInfo[];
  arrival: AirportInfo;
  legs?: RouteLeg[];
  /** Total over all legs. */
  distanceNm: number;
  /** Of the first leg. */
  trueCourseDeg: number;
  points: RoutePoint[];
  /** False when aviationweather.gov could not be reached. */
  weatherAvailable: boolean;
}

/** A route the signed-in user saved: departure, any waypoints, arrival. */
export interface SavedRoute {
  id: number;
  name: string;
  airports: string[];
  /** Set when shared by link. */
  shareToken: string | null;
  updatedAt: string;
}

/** What anyone with a share link sees. */
export interface SharedRoute {
  name: string;
  airports: string[];
  sharedBy: string;
}

/** The forecast along a route in segments of about 25 NM, hourly from the departure. Mirrors the backend's EnrouteForecast. */
export interface EnrouteForecast {
  /** False when Open-Meteo could not be reached (then no times or segments). */
  available: boolean;
  altitudeFt: number;
  /** Hours (UTC, ISO) the segments' lists refer to, by index. */
  times: string[];
  segments: EnrouteSegment[];
}

/** Forecast at the segment's middle; per-hour lists, null where the model has no value. */
export interface EnrouteSegment {
  /** Index of the route leg. */
  leg: number;
  /** From the departure, along the route. */
  startNm: number;
  distanceNm: number;
  trueCourseDeg: number;
  lat: number;
  lon: number;
  /** Model terrain: a grid-cell average, not the highest point. */
  groundFt: number | null;
  /** Where the wind blows from at the cruise altitude, degrees true. */
  windDirTrue: Array<number | null>;
  windKt: Array<number | null>;
  tempC: Array<number | null>;
  /** Estimated base of the lowest broken or overcast layer; null: none. */
  cloudBaseFt: Array<number | null>;
  /** Lowest 0 °C height (the ground when freezing there); null: above 18,000 ft. */
  freezingLevelFt: Array<number | null>;
  /** Cloud cover at each pressure level from the ground up. */
  layers: CloudLayer[][];
}

export interface CloudLayer {
  heightFt: number;
  cloudCover: number;
}

/** openAIP airspace near a route, from the backend. */
export interface AirspaceLimit {
  /** Feet; a flight level as its pressure altitude (FL95 = 9500). */
  ft: number;
  datum: 'GND' | 'MSL' | 'STD';
  /** As published, e.g. "FL95", "1,500 ft MSL", "GND". */
  label: string;
}

export interface AirspaceView {
  id: string;
  name: string;
  /** e.g. "CTR", "TMA", "CTA", "R", "D", "P", "TMZ", "RMZ", "ATZ", "TIZ", "OTHER". */
  type: string;
  /** "A".."G", or null for special-use airspace. */
  icaoClass: string | null;
  lower: AirspaceLimit;
  upper: AirspaceLimit;
  /** Activated by "NOTAM", on "request" or on "demand"; null when permanent. */
  activation: 'NOTAM' | 'request' | 'demand' | null;
  /** Outer ring, [lon, lat]. */
  polygon: Array<[number, number]>;
}
