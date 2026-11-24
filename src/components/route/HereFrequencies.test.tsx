import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import HereFrequencies from './HereFrequencies';
import { fetchPointInfo } from '../../api/backend';
import type { PointInfo } from '../../types/route';

jest.mock('../../api/backend', () => ({ fetchPointInfo: jest.fn() }));
const mocked = fetchPointInfo as jest.MockedFunction<typeof fetchPointInfo>;

const info: PointInfo = {
  lat: 59.62, lon: 16.55,
  airspaces: [
    { id: 'ctr', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' },
      frequencies: [{ value: '130.605', name: 'VÄSTERÅS TOWER', kind: 'TWR', primary: true, source: 'ESOW' }] },
    { id: 'tma', name: 'SECTOR VÄSTERÅS', type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' }, upper: { ft: 4500, datum: 'MSL', label: '4,500 ft MSL' },
      frequencies: [{ value: '125.955', name: 'VÄSTERÅS CONTROL', kind: 'APP', primary: false, source: 'ESOW' }] },
  ],
  airports: [{ code: 'ESSX', name: 'Johannisberg', lat: 59.58, lon: 16.5, distanceNm: 3, frequencies: [{ value: '123.650', name: 'JOHANNISBERG RADIO', kind: 'RADIO', primary: false, source: 'ESSX' }] }],
};

type Success = (p: { coords: { latitude: number; longitude: number; altitude: number | null } }) => void;
let success: Success | null = null;
const clearWatch = jest.fn();

beforeEach(() => {
  success = null;
  mocked.mockReset();
  mocked.mockResolvedValue(info);
  Object.defineProperty(navigator, 'geolocation', {
    configurable: true,
    value: { watchPosition: (ok: Success) => { success = ok; return 7; }, clearWatch },
  });
});

test('follows the position and shows what to call there, marking the airspace at the GPS altitude', async () => {
  render(<HereFrequencies/>);
  fireEvent.click(screen.getByRole('button', { name: /Frequencies where I am/ }));
  expect(screen.getByText(/Finding your position/)).toBeInTheDocument();
  // 2,500 ft: in the sector above the CTR.
  await act(async () => { success?.({ coords: { latitude: 59.62, longitude: 16.55, altitude: 762 } }); });
  expect(mocked).toHaveBeenCalledWith(59.62, 16.55);
  expect(await screen.findByText('SECTOR VÄSTERÅS · you are in it')).toBeInTheDocument();
  expect(screen.getByText(/125\.955 VÄSTERÅS CONTROL/)).toBeInTheDocument();
  expect(screen.getByText('VÄSTERÅS CTR')).toBeInTheDocument();
  expect(screen.getByText(/ESSX 3 NM: 123\.650 JOHANNISBERG RADIO/)).toBeInTheDocument();

  // A small move doesn't ask again; a mile and more does.
  await act(async () => { success?.({ coords: { latitude: 59.621, longitude: 16.55, altitude: 762 } }); });
  expect(mocked).toHaveBeenCalledTimes(1);
  await act(async () => { success?.({ coords: { latitude: 59.65, longitude: 16.55, altitude: 762 } }); });
  expect(mocked).toHaveBeenCalledTimes(2);

  fireEvent.click(screen.getByRole('button', { name: /Stop/ }));
  expect(clearWatch).toHaveBeenCalledWith(7);
  expect(screen.getByRole('button', { name: /Frequencies where I am/ })).toBeInTheDocument();
});
