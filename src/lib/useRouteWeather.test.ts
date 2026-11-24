import { renderHook, waitFor } from '@testing-library/react';
import { fetchRouteWeather } from '../api/backend';
import { useRouteWeather } from './useRouteWeather';

jest.mock('../api/backend', () => ({ fetchRouteWeather: jest.fn() }));

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
