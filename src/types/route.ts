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

export type RouteRole = 'DEPARTURE' | 'ENROUTE' | 'ARRIVAL';

export interface RoutePoint {
  role: RouteRole;
  alongTrackNm: number;
  /** Where the weather comes from: the airport itself (0 NM) or the nearest reporting station. */
  station: { code: string; name: string; distanceNm: number } | null;
  metar: Metar | null;
  taf: Taf | null;
}

export interface RouteWeather {
  departure: AirportInfo;
  arrival: AirportInfo;
  distanceNm: number;
  trueCourseDeg: number;
  points: RoutePoint[];
  /** False when aviationweather.gov could not be reached. */
  weatherAvailable: boolean;
}
