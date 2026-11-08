// Test helper: RouteWeather responses.
import type { AirportInfo, Metar, RoutePoint, RouteWeather } from '../types/route';

export const essx: AirportInfo = {
  code: 'ESSX', name: 'Johannisberg Airfield', type: 'small', lat: 59.5758, lon: 16.5032, elevationFt: 33, country: 'SE',
  municipality: 'Västerås', runways: [
    { le: '05', he: '23', lengthFt: 2788, surface: 'ASP', leHeadingTrue: 50, heHeadingTrue: 230, headingEstimated: true },
    { le: '16', he: '34', lengthFt: null, surface: 'GRASS', leHeadingTrue: 160, heHeadingTrue: 340, headingEstimated: true },
  ],
};
export const esgg: AirportInfo = {
  code: 'ESGG', name: 'Göteborg Landvetter Airport', type: 'large', lat: 57.6628, lon: 12.2798, elevationFt: 506, country: 'SE',
  municipality: 'Göteborg', runways: [
    { le: '03', he: '21', lengthFt: 10823, surface: 'ASP', leHeadingTrue: 30, heHeadingTrue: 210, headingEstimated: false },
  ],
};

export function metar(station: string, over: Partial<Metar> = {}): Metar {
  return {
    station, raw: `METAR ${station} 081720Z 25012KT 9999 BKN020 04/02 Q1024`, observedAt: new Date().toISOString(),
    flightCategory: 'VFR', windDirTrue: 250, windVariable: false, windKt: 12, gustKt: null, visibilityM: 10000,
    ceilingFt: 2000, tempC: 4, dewpointC: 2, qnhHpa: 1024, ...over,
  };
}

export function routeWeather(from: AirportInfo, to: AirportInfo, distanceNm: number, points?: RoutePoint[]): RouteWeather {
  return {
    departure: from, arrival: to, distanceNm, trueCourseDeg: 231, weatherAvailable: true,
    points: points ?? [
      { role: 'DEPARTURE', alongTrackNm: 0, station: { code: 'ESOW', name: 'Stockholm/Västerås Arpt', distanceNm: 4.3 }, metar: metar('ESOW'), taf: null },
      { role: 'ARRIVAL', alongTrackNm: distanceNm, station: { code: to.code, name: to.name, distanceNm: 0 }, metar: metar(to.code), taf: null },
    ],
  };
}
