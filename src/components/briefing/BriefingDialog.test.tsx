import React from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BriefingButton from './BriefingDialog';
import type { BriefingData } from './BriefingPack';
import { fetchAerodrome, fetchMapStatus, fetchPointInfo } from '../../api/backend';
import { esgg, essx, routeWeather } from '../../lib/testRoute';
import type { AirspaceCheck } from '../../lib/airspace';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});

jest.mock('../../api/backend', () => ({
  fetchPointInfo: jest.fn(),
  fetchAerodrome: jest.fn(),
  fetchMapStatus: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
}));

const tma = (fromNm: number, freqs: string[]): AirspaceCheck => ({
  airspace: {
    id: `t${fromNm}`, name: 'STOCKHOLM TMA', type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
    lower: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' }, upper: { ft: 9500, datum: 'STD', label: 'FL95' },
    frequencies: freqs.map((value, i) => ({ value, name: `STOCKHOLM CONTROL ${i + 1}`, kind: 'APP' as const, primary: i === 0, source: null })),
  },
  fromNm, toNm: fromNm + 10, status: 'inside', minFt: 3000, maxFt: 3000, floorFt: 1500, ceilingFt: 9500,
});

const data: Omit<BriefingData, 'airportFrequencies' | 'aerodromes'> = {
  routeName: 'ESSX → ESGG', aircraftName: 'PA28-161 (SE-KMI)', departure: new Date('2026-11-25T09:00:00Z'),
  trip: routeWeather(essx, esgg, 175), plan: null, altitudeFt: 4500, holds: [], tasKt: 107, powerSetting: '75%', flightMinutes: 100,
  fuel: { onBoardL: 150, tripL: 63, landingL: 87 }, wb: null,
  airspaces: [tma(10, ['123.725', '120.155', '119.400', '118.100']), tma(30, ['123.725'])], swedenControl: [],
  speeds: { glide: 73, vy: 79, approach: 70, stallLanding: 44, unit: 'KIAS' },
};

const only = (...on: string[]) => localStorage.setItem('briefingSectionsOff.v2',
  JSON.stringify(['overview', 'airfields', 'enroute', 'weather', 'emergency'].filter(s => !on.includes(s))));
const open = () => fireEvent.click(screen.getByRole('button', { name: /Briefing pack/ }));
const print = async () => {
  const button = screen.getByRole('button', { name: /^(Print|Looking up)/ });
  await waitFor(() => expect(button).toBeEnabled());
  fireEvent.click(button);
  return screen.findByRole('article', { name: 'Briefing pack' });
};
const tilesIn = () => document.querySelectorAll('[data-map-ready]').forEach(m => m.setAttribute('data-map-ready', 'true'));

beforeEach(() => {
  localStorage.clear();
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  (fetchPointInfo as jest.Mock).mockImplementation(async (lat: number) => ({
    lat, lon: 0, airspaces: [],
    airports: [{ code: lat > 59 ? 'ESSX' : 'ESGG', name: '', lat, lon: 0, distanceNm: 0,
      frequencies: lat > 59
        ? [{ value: '118.105', name: 'JOHANNISBERG RADIO', kind: 'RADIO', primary: true, source: null }]
        : [{ value: '118.505', name: 'LANDVETTER TOWER', kind: 'TWR', primary: true, source: null },
          { value: '126.505', name: 'LANDVETTER ATIS', kind: 'ATIS', primary: false, source: null }] }],
  }));
  (fetchAerodrome as jest.Mock).mockImplementation(async (code: string) => (code === 'ESSX'
    ? { code, circuits: [{ runway: '05', trueHeading: 50, direction: 'RIGHT' }, { runway: '23', trueHeading: 230, direction: 'LEFT' }],
      reportingPoints: [{ name: 'SIERRA', lat: 59.5, lon: 16.4, compulsory: false }] }
    : { code, circuits: [{ runway: '03', trueHeading: 30, direction: null }], reportingPoints: [] }));
  window.print = jest.fn();
});
afterEach(() => document.body.classList.remove('print-briefing'));

it('the departure and arrival page: maps, circuits, reporting points, a short frequency list and the times to fill in', async () => {
  only('airfields');
  render(<BriefingButton data={data}/>);
  open();
  const pack = await print();
  expect(document.body).toHaveClass('print-briefing');
  expect(await screen.findByRole('img', { name: 'Map: Departure: ESSX' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Map: Arrival: ESGG' })).toBeInTheDocument();
  // SIERRA on the departure map, with its name.
  const dep = screen.getByRole('img', { name: 'Map: Departure: ESSX' });
  await waitFor(() => expect(dep.querySelectorAll('.vrp-marker')).toHaveLength(1));
  expect(within(dep).getByText('SIERRA')).toBeInTheDocument();
  expect(pack).toHaveTextContent('Circuit: RWY 05 right-hand, RWY 23 left-hand');
  expect(pack).toHaveTextContent('Reporting points: SIERRA');
  expect(pack).toHaveTextContent('Circuit: not in the data: left-hand unless the AIP/VAC says otherwise');
  expect(pack).toHaveTextContent('126.505 LANDVETTER ATIS');
  expect(pack).toHaveTextContent('118.105 JOHANNISBERG RADIO');
  // The TMA once, with two of its four frequencies.
  expect(within(pack).getAllByText('STOCKHOLM TMA (C)')).toHaveLength(1);
  expect(pack).toHaveTextContent('123.725 STOCKHOLM CONTROL 1, 120.155 STOCKHOLM CONTROL 2');
  expect(pack).not.toHaveTextContent('119.400');
  const times = within(pack).getByRole('region', { name: 'Times' });
  ['Off block', 'Takeoff', 'Landing', 'On block', 'Tacho'].forEach(t => expect(times).toHaveTextContent(t));
  expect(times).toHaveTextContent('Takeoff09:00Z');

  // Printing waits for the maps' tiles.
  await new Promise(r => setTimeout(r, 300));
  expect(window.print).not.toHaveBeenCalled();
  tilesIn();
  await waitFor(() => expect(window.print).toHaveBeenCalled());
  fireEvent(window, new Event('afterprint'));
  await waitFor(() => expect(screen.queryByRole('article', { name: 'Briefing pack' })).toBeNull());
  expect(document.body).not.toHaveClass('print-briefing');
});

it('each page on its own: the en-route chart and the emergency checklist start new pages', async () => {
  only('overview', 'enroute', 'emergency');
  render(<BriefingButton data={data}/>);
  open();
  const pack = await print();
  const chart = await screen.findByRole('img', { name: 'Map: Route' });
  expect(chart.closest('section')).toHaveStyle({ breakBefore: 'page' });
  const emergency = within(pack).getByRole('heading', { name: 'Emergency checklist' }).closest('section');
  expect(emergency).toHaveStyle({ breakBefore: 'page' });
  expect(pack).toHaveTextContent('AVIATE, NAVIGATE, COMMUNICATE');
  expect(pack).toHaveTextContent('Best glide 73 kt');
  expect(pack).toHaveTextContent(/Generic single-engine piston checklist, not specific to PA28-161 \(SE-KMI\)/);
  expect(within(pack).queryByRole('heading', { name: 'Departure and arrival' })).toBeNull();
  tilesIn();
  await waitFor(() => expect(window.print).toHaveBeenCalled());
});

it('remembers what was left out', async () => {
  render(<BriefingButton data={data}/>);
  open();
  fireEvent.click(screen.getByRole('checkbox', { name: /Weather briefing/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /En-route chart/ }));
  expect(localStorage.getItem('briefingSectionsOff.v2')).toBe(JSON.stringify(['enroute', 'weather']));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Print' })).toBeEnabled());
});

it('without a route there is nothing to brief', () => {
  render(<BriefingButton data={null}/>);
  expect(screen.getByRole('button', { name: /Briefing pack/ })).toBeDisabled();
});

it('a pack with only the weather has its reports, decoded, and prints straight away', async () => {
  only('weather');
  render(<BriefingButton data={data}/>);
  open();
  const pack = await print();
  expect(within(pack).getByRole('heading', { name: 'Weather briefing' })).toBeInTheDocument();
  expect(pack).toHaveTextContent('METAR ESOW 081720Z');
  expect(pack).toHaveTextContent('Wind from 250° at 12 kt');
  await waitFor(() => expect(window.print).toHaveBeenCalled());
});

it('keeps the departure and arrival page to one page: short lists, and scaled down if still too tall', async () => {
  only('airfields');
  const many = Array.from({ length: 11 }, (_, i) => {
    const c = tma(i * 10, ['123.725']);
    return { ...c, airspace: { ...c.airspace, id: `a${i}`, name: `AREA ${i + 1}` } };
  });
  const height = jest.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(1300);
  try {
    render(<BriefingButton data={{ ...data, airspaces: many }}/>);
    open();
    const pack = await print();
    expect(pack).toHaveTextContent('AREA 8');
    expect(pack).not.toHaveTextContent('AREA 9 ');
    expect(pack).toHaveTextContent('and 3 more further on');
    // 1,300 px into the ~920 px left under the heading: as small as it goes, 75%.
    const page = within(pack).getByRole('heading', { name: 'Departure and arrival' }).closest('section') as HTMLElement;
    await waitFor(() => expect(page).toHaveAttribute('data-fit-scale', '0.75'));
    expect(page).toHaveStyle({ height: '975px' });
    tilesIn();
  } finally {
    height.mockRestore();
  }
});
