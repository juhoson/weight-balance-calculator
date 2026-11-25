import { renderHook, waitFor } from '@testing-library/react';
import { fetchAerodrome, fetchRouteWeather } from '../api/backend';
import { resetAerodromes, useRouteWeather } from './useRouteWeather';

jest.mock('../api/backend', () => ({ fetchRouteWeather: jest.fn(), fetchAerodrome: jest.fn() }));

beforeEach(() => {
  resetAerodromes();
  (fetchAerodrome as jest.Mock).mockRejectedValue(new Error('no openAIP'));
});

it('names the legs at positions WP1, WP2, … rather than by their codes', async () => {
  const at = (code: string) => ({ code, name: code, type: code.length > 4 ? 'point' : 'small', lat: 59, lon: 17, elevationFt: null, country: '', municipality: '', runways: [] });
  (fetchRouteWeather as jest.Mock).mockResolvedValue({
    departure: at('ESSX'), waypoints: [at('5912N01734E'), at('ESKN')], arrival: at('ESGG'),
    legs: [
      { from: 'ESSX', to: '5912N01734E', distanceNm: 10, trueCourseDeg: 200 },
      { from: '5912N01734E', to: 'ESKN', distanceNm: 10, trueCourseDeg: 200 },
      { from: 'ESKN', to: 'ESGG', distanceNm: 10, trueCourseDeg: 200 },
    ],
    distanceNm: 30, trueCourseDeg: 200, points: [], weatherAvailable: true,
  });
  const { result } = renderHook(() => useRouteWeather('ESSX', 'ESGG', ['5912N01734E', 'ESKN']));
  await waitFor(() => expect(result.current.data).not.toBeNull());
  expect(result.current.data?.legs?.map(l => `${l.from}-${l.to}`)).toEqual(['ESSX-WP1', 'WP1-ESKN', 'ESKN-ESGG']);
  expect(result.current.data?.waypoints?.[0].code).toBe('5912N01734E'); // the route itself keeps the code
});

it('looks up the airports\' reporting points, and names a leg through one after it', async () => {
  const at = (code: string, type = 'small') => ({ code, name: code, type, lat: 59, lon: 17, elevationFt: null, country: 'SE', municipality: '', runways: [] });
  const vrp = '593530N0163000E';
  (fetchAerodrome as jest.Mock).mockImplementation(async (code: string) => ({
    code, circuits: [],
    reportingPoints: code === 'ESOW' ? [{ name: 'KOLBÄCK', lat: 59.591667, lon: 16.5, compulsory: false }] : [],
  }));
  (fetchRouteWeather as jest.Mock).mockResolvedValue({
    departure: at('ESSX'), waypoints: [at(vrp, 'point')], arrival: at('ESOW'),
    legs: [{ from: 'ESSX', to: vrp, distanceNm: 10, trueCourseDeg: 200 }, { from: vrp, to: 'ESOW', distanceNm: 5, trueCourseDeg: 90 }],
    distanceNm: 15, trueCourseDeg: 200, points: [], weatherAvailable: true,
  });
  const { result } = renderHook(() => useRouteWeather('ESSX', 'ESOW', [vrp]));
  await waitFor(() => expect(result.current.reportingPoints).toHaveLength(1));
  expect(result.current.reportingPoints[0]).toMatchObject({ airport: 'ESOW', name: 'KOLBÄCK', code: vrp });
  expect(result.current.data?.legs?.map(l => `${l.from}-${l.to}`)).toEqual(['ESSX-KOLBÄCK', 'KOLBÄCK-ESOW']);
  expect(fetchAerodrome).toHaveBeenCalledTimes(2); // the airports only, not the position
});
