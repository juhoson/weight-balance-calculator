import {
  clearForecastCache, cloudBaseM, type Forecast, forecastAlongRoute, forecastUrl, freezingLevelM, fromOf, HOURS,
  LEVELS_HPA, parseForecasts, type Sample, segmentsOf, speedOf, windAtAltitude,
} from './openMeteo';

const NOW = new Date('2026-11-23T10:25:00Z');
const ESSX = { code: 'ESSX', lat: 59.5758, lon: 16.5032 };
const ESGG = { code: 'ESGG', lat: 57.6628, lon: 12.2798 };
const ESOW = { code: 'ESOW', lat: 59.5894, lon: 16.6336 };
const ESSU = { code: 'ESSU', lat: 59.3511, lon: 16.7084 };
const empty: Sample = { heightM: null, dirTrue: null, speedKt: null, tempC: null, cloudCover: null };

/**
 * Hourly from 10:00Z. 10 m wind 360°/10 kt. 1000 hPa (300 m): +4 °C, 20% cloud; 925 hPa (700 m):
 * 090°/30 kt, -3 °C, 80% cloud; 850 hPa (1400 m): 090°/40 kt, -8 °C, 10% cloud. Others no data.
 */
function forecast(elevationM: number): Forecast {
  const n = 80;
  const times = Array.from({ length: n }, (_, i) => Date.parse('2026-11-23T10:00:00Z') / 1000 + 3600 * i);
  const levels = LEVELS_HPA.map(level => {
    const s: Sample = level === 1000 ? { heightM: 300, dirTrue: 10, speedKt: 15, tempC: 4, cloudCover: 20 }
      : level === 925 ? { heightM: 700, dirTrue: 90, speedKt: 30, tempC: -3, cloudCover: 80 }
        : level === 850 ? { heightM: 1400, dirTrue: 90, speedKt: 40, tempC: -8, cloudCover: 10 } : empty;
    return times.map(() => s);
  });
  return { elevationM, times, surface: times.map(() => ({ ...empty, heightM: elevationM + 10, dirTrue: 360, speedKt: 10 })), levels };
}

/** Open-Meteo's JSON for a forecast, as many times over as points were asked for. */
function answer(points: number) {
  const f = forecast(0);
  const hourly: Record<string, unknown[]> = { time: f.times, wind_speed_10m: f.times.map(() => 10), wind_direction_10m: f.times.map(() => 360) };
  LEVELS_HPA.forEach((level, i) => {
    const s = f.levels[i][0];
    hourly[`wind_speed_${level}hPa`] = f.times.map(() => s.speedKt);
    hourly[`wind_direction_${level}hPa`] = f.times.map(() => s.dirTrue);
    hourly[`temperature_${level}hPa`] = f.times.map(() => s.tempC);
    hourly[`geopotential_height_${level}hPa`] = f.times.map(() => s.heightM);
    hourly[`cloud_cover_${level}hPa`] = f.times.map(() => s.cloudCover);
  });
  const one = { latitude: 0, longitude: 0, elevation: 0, hourly };
  return points === 1 ? one : Array.from({ length: points }, () => one);
}

const fetchMock = jest.fn();
beforeEach(() => {
  clearForecastCache();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    const points = new URL(url).searchParams.get('latitude')?.split(',').length ?? 1;
    return { ok: true, json: async () => answer(points) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
});

it('interpolates the wind between levels and clamps outside them', () => {
  const f = forecast(0);
  const mid = windAtAltitude(f, 0, 1050)!; // halfway 700-1400 m
  expect(fromOf(mid)).toBeCloseTo(90, 0);
  expect(speedOf(mid)).toBeCloseTo(35, 1);
  expect(mid.tempC).toBeCloseTo(-5.5, 2);
  expect(speedOf(windAtAltitude(f, 0, 5000)!)).toBeCloseTo(40, 2);
  expect(speedOf(windAtAltitude(f, 0, 5)!)).toBeCloseTo(10, 2);
});

it('estimates the cloud base and freezing level, ignoring levels below the ground', () => {
  expect(cloudBaseM(forecast(0), 0)).toBeCloseTo(500, 1); // 20% at 300 m, 80% at 700 m
  expect(freezingLevelM(forecast(0), 0)).toBeCloseTo(528.6, 1); // +4 at 300 m, -3 at 700 m
  expect(freezingLevelM(forecast(400), 0)).toBe(400); // lowest level above ground already freezing
  expect(cloudBaseM(forecast(400), 0)).toBeCloseTo(587.5, 1);
});

it('splits legs into segments of at most 25 NM, one per short leg', () => {
  const s = segmentsOf([ESSX, ESGG]);
  expect(s).toHaveLength(7); // 175 NM
  expect(s[0].distanceNm).toBeCloseTo(25, 0);
  expect(s[6].startNm).toBeCloseTo(150, 0);
  expect(s[0].trueCourseDeg).not.toBeCloseTo(s[6].trueCourseDeg, 0); // great circle
  expect(segmentsOf([ESSX, ESOW, ESSU]).map(x => x.leg)).toEqual([0, 1]);
});

it('asks for every level at all points in one request, with the ICON model', () => {
  const url = forecastUrl([{ lat: 59.35, lon: 17.94 }, { lat: 58.4, lon: 15.68 }], 61);
  for (const part of ['latitude=59.35,58.40', 'longitude=17.94,15.68', 'models=icon_seamless', 'wind_speed_unit=kn',
    'forecast_hours=61', 'cloud_cover_800hPa', 'geopotential_height_850hPa']) {
    expect(url).toContain(part);
  }
  expect(parseForecasts(answer(2))).toHaveLength(2);
  expect(parseForecasts(answer(1))[0].levels[LEVELS_HPA.indexOf(925)][0].speedKt).toBe(30);
});

it('gives hourly forecasts per segment from the departure, and caches them', async () => {
  const f = await forecastAlongRoute([ESSX, ESGG], 3445, null, NOW); // 1050 m
  expect(f.available).toBe(true);
  expect(f.times).toHaveLength(HOURS);
  expect(f.times[0]).toBe('2026-11-23T10:00:00.000Z');
  expect(f.segments).toHaveLength(7);
  const seg = f.segments[0];
  expect(seg.windDirTrue[0]).toBe(90);
  expect(seg.windKt[0]).toBe(35);
  expect(seg.cloudBaseFt[0]).toBe(1600); // 500 m
  expect(seg.freezingLevelFt[0]).toBe(1700);
  expect(seg.layers[0].map(l => l.cloudCover)).toEqual([20, 80, 10]);
  expect(fetchMock).toHaveBeenCalledTimes(1);

  // Tomorrow at another altitude: from the cache.
  const later = await forecastAlongRoute([ESSX, ESGG], 6000, new Date('2026-11-24T08:40:00Z'), NOW);
  expect(later.times[0]).toBe('2026-11-24T08:00:00.000Z');
  expect(later.segments[0].windKt[0]).toBe(40);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('says so when Open-Meteo cannot be reached, and refuses more than two days ahead', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
  const f = await forecastAlongRoute([ESSX, ESGG], 3000, null, NOW);
  expect(f).toEqual({ available: false, altitudeFt: 3000, times: [], segments: [] });
  await expect(forecastAlongRoute([ESSX, ESGG], 3000, new Date('2026-11-26T08:00:00Z'), NOW)).rejects.toThrow(/two days/);
});
