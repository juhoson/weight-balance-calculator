import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { fetchMapArea, fetchMapStatus, fetchPointInfo, nearestAirports } from '../../api/backend';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: RouteMap, resetMapStatus, resetAreas, bestInsert, legText } = require('./RouteMap') as typeof import('./RouteMap');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
  fetchMapArea: jest.fn(),
  fetchPointInfo: jest.fn(),
  nearestAirports: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
}));

const route = [
  { code: 'ESOW', name: 'Västerås', lat: 59.5894, lon: 16.6336 },
  { code: 'ESSB', name: 'Bromma', lat: 59.3544, lon: 17.9417 },
];

beforeEach(() => {
  resetMapStatus();
  resetAreas();
  (fetchMapStatus as jest.Mock).mockReset();
  (fetchMapArea as jest.Mock).mockReset().mockResolvedValue({ airports: [], reportingPoints: [], complete: true, reportingPointsAvailable: true });
});

test('draws the route, labels the airports and credits openAIP', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  const { container } = render(<RouteMap airports={route}/>);
  expect(await screen.findByText(/Airspace from openAIP/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.route-map-label')).toHaveLength(2));
  expect(screen.getByText('ESOW')).toBeInTheDocument();
  expect(container.querySelector('img[src*="/api/map/airspace/"]')).not.toBeNull();
  expect(container.querySelector('.leaflet-control-attribution')?.textContent).toMatch(/openAIP/);
});

test('without the overlay it says so and shows the route only', async () => {
  (fetchMapStatus as jest.Mock).mockRejectedValue(new Error('down'));
  const { container } = render(<RouteMap airports={route}/>);
  expect(await screen.findByText(/Airspace is not available/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.route-map-label')).toHaveLength(2));
  expect(container.querySelector('img[src*="/api/map/airspace/"]')).toBeNull();
});

test('a tap on the map shows the airspace and frequencies there', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  (fetchPointInfo as jest.Mock).mockResolvedValue({
    lat: 59.6, lon: 16.6, airports: [],
    airspaces: [{ id: 'c', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'C', activation: null, polygon: [],
      lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1,500 ft MSL' },
      frequencies: [{ value: '130.605', name: 'VÄSTERÅS TOWER', kind: 'TWR', primary: true, source: 'ESOW' }] }],
  });
  const { container } = render(<RouteMap airports={route}/>);
  await screen.findByText(/Tap the map for the airspace and frequencies there/);
  const mapEl = container.querySelector('.route-map') as HTMLElement;
  fireEvent.click(mapEl, { clientX: 50, clientY: 50 });
  expect(await screen.findByText(/130\.605 VÄSTERÅS TOWER/)).toBeInTheDocument();
  expect(fetchPointInfo).toHaveBeenCalledTimes(1);
});

test('waypoints can be moved, added and removed on the map', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  const onChange = jest.fn();
  const three = [route[0], { code: '5930N01720E', name: 'Position 5930N01720E', lat: 59.5, lon: 17.3333 }, route[1]];
  const { container, rerender } = render(<RouteMap airports={three} onWaypointsChange={onChange}/>);
  expect(await screen.findByText(/Drag a waypoint to move it/)).toBeInTheDocument();
  await waitFor(() => expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(1));
  expect(container.querySelectorAll('.route-map-insert')).toHaveLength(2); // one per leg
  expect(screen.getByText('WP1')).toBeInTheDocument(); // a position is named, not its code

  fireEvent.click(container.querySelector('.route-map-waypoint') as HTMLElement);
  expect(await screen.findByText('59°30′N 017°20′E')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Remove waypoint' }));
  expect(onChange).toHaveBeenCalledWith([]);
  // Drawn without it straight away, before the new route has loaded.
  await waitFor(() => expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(0));
  expect(container.querySelectorAll('.route-map-insert')).toHaveLength(1);

  // The new route loads; then no handles at the waypoint limit, and none without the callback.
  rerender(<RouteMap airports={route} onWaypointsChange={onChange}/>);
  rerender(<RouteMap airports={three} onWaypointsChange={onChange} maxWaypoints={1}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-insert')).toHaveLength(0));
  expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(1);
  rerender(<RouteMap airports={three}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(0));
  expect(screen.queryByText(/Drag a waypoint/)).toBeNull();
});

test('shows reporting points; one tapped is put into the route where it adds the least', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  const onChange = jest.fn();
  const wp = { code: '5930N01720E', name: 'Position', lat: 59.5, lon: 17.3333 };
  const vrps = [
    { airport: 'ESSB', name: 'LOVÖN', lat: 59.33, lon: 17.85, compulsory: true, code: '591948N0175100E' },
    { airport: 'ESOW', name: 'KOLBÄCK', lat: 59.5917, lon: 16.5, compulsory: false, code: '593530N0163000E' },
  ];
  const { container } = render(<RouteMap airports={[route[0], wp, route[1]]} onWaypointsChange={onChange} reportingPoints={vrps}/>);
  await waitFor(() => expect(container.querySelectorAll('.vrp-marker')).toHaveLength(2));
  expect(container.querySelectorAll('.vrp-marker--compulsory')).toHaveLength(1);
  expect(screen.getByText('LOVÖN')).toBeInTheDocument();

  fireEvent.click(container.querySelectorAll('.vrp-marker')[0]);
  fireEvent.click(await screen.findByRole('button', { name: 'Route via this point' }));
  expect(onChange).toHaveBeenCalledWith(['5930N01720E', '591948N0175100E']); // on the leg into Bromma
});

test('a reporting point on the route is drawn as the waypoint, by its name', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  const vrp = { airport: 'ESOW', name: 'KOLBÄCK', lat: 59.5917, lon: 16.5, compulsory: false, code: '593530N0163000E' };
  const { container } = render(<RouteMap airports={[route[0], { code: vrp.code, name: vrp.name, lat: vrp.lat, lon: vrp.lon }, route[1]]}
    onWaypointsChange={jest.fn()} reportingPoints={[vrp]}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(1));
  expect(container.querySelectorAll('.vrp-marker')).toHaveLength(0);
});

test('bestInsert picks the leg with the smallest detour', () => {
  const line = [{ lat: 59, lon: 16 }, { lat: 59, lon: 17 }, { lat: 59, lon: 18 }];
  expect(bestInsert(line, { lat: 59.05, lon: 16.4 })).toBe(0);
  expect(bestInsert(line, { lat: 58.95, lon: 17.7 })).toBe(1);
});

test('legText gives the leg\'s length and true course', () => {
  expect(legText('ESOW', 'ESSB', route[0], route[1])).toBe('ESOW → ESSB: 42 NM, 109° true');
  expect(legText('ESOW', 'WP1', route[0], { lat: 59.6, lon: 16.7 })).toMatch(/^ESOW → WP1: 2\.\d NM, 0\d\d° true$/);
});

test('hovering a leg shows its length', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  const { container } = render(<RouteMap airports={route}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-leg')).toHaveLength(1));
  fireEvent.mouseOver(container.querySelector('.route-map-leg') as Element);
  expect(await screen.findByText('ESOW → ESSB: 42 NM, 109° true')).toBeInTheDocument();
});

test('clicking the departure plots a new course a click at a time; Escape puts the old one back', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  (nearestAirports as jest.Mock).mockResolvedValue([]);
  const onChange = jest.fn();
  const wp = { code: '5930N01720E', name: 'Position', lat: 59.5, lon: 17.3333 };
  const { container } = render(<RouteMap airports={[route[0], wp, route[1]]} onWaypointsChange={onChange}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-end')).toHaveLength(2));
  fireEvent.click(container.querySelectorAll('.route-map-end')[0]);
  expect(await screen.findByText(/Plotting from ESOW/)).toBeInTheDocument();
  // The old waypoints go, and no handles while plotting.
  await waitFor(() => expect(container.querySelectorAll('.route-map-waypoint')).toHaveLength(0));
  expect(container.querySelectorAll('.route-map-insert')).toHaveLength(0);

  const mapEl = container.querySelector('.route-map') as HTMLElement;
  fireEvent.click(mapEl, { clientX: 40, clientY: 40 });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  fireEvent.click(mapEl, { clientX: 80, clientY: 60 });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(2));
  const [first, second] = onChange.mock.calls.map(c => c[0]);
  expect(first).toHaveLength(1);
  expect(second).toEqual([first[0], expect.stringMatching(/^\d{4}[NS]\d{5}[EW]$/)]);

  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(first));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(onChange).toHaveBeenLastCalledWith(['5930N01720E']));
  expect(screen.queryByText(/Plotting from/)).toBeNull();
});

test('plotting ends at the arrival, keeping what was plotted', async () => {
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: true, minZoom: 4, maxZoom: 14 });
  (nearestAirports as jest.Mock).mockResolvedValue([]);
  const onChange = jest.fn();
  const { container } = render(<RouteMap airports={route} onWaypointsChange={onChange}/>);
  await waitFor(() => expect(container.querySelectorAll('.route-map-end')).toHaveLength(2));
  fireEvent.click(container.querySelectorAll('.route-map-end')[0]);
  await screen.findByText(/Plotting from ESOW/);
  fireEvent.mouseMove(container.querySelector('.route-map') as HTMLElement, { clientX: 40, clientY: 40 });
  expect(await screen.findByText(/^ESOW → here: [\d.]+ NM, \d{3}° true$/)).toBeInTheDocument(); // the line to the pointer
  fireEvent.click(container.querySelector('.route-map') as HTMLElement, { clientX: 40, clientY: 40 });
  await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1));
  expect(fetchPointInfo).not.toHaveBeenCalled(); // a plotted point, not the airspace lookup
  const ends = container.querySelectorAll('.route-map-end');
  fireEvent.click(ends[ends.length - 1]);
  await waitFor(() => expect(screen.queryByText(/Plotting from/)).toBeNull());
  expect(onChange).toHaveBeenCalledTimes(1);
});

describe('with the map laid out', () => {
  // jsdom lays nothing out: give the map a size, so it zooms to the route and asks what's in view.
  const sized = (prop: 'clientWidth' | 'clientHeight', px: number) =>
    jest.spyOn(HTMLElement.prototype, prop, 'get').mockReturnValue(px);
  beforeEach(() => { sized('clientWidth', 600); sized('clientHeight', 400); });
  afterEach(() => jest.restoreAllMocks());

  test('shows every airport in view and their reporting points; an airport can be flown to or via', async () => {
    (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
    (fetchMapArea as jest.Mock).mockResolvedValue({
      airports: [
        { code: 'ESOW', name: 'Västerås', type: 'medium', lat: 59.5894, lon: 16.6336 },
        { code: 'ESSU', name: 'Eskilstuna', type: 'small', lat: 59.3511, lon: 16.7083 },
      ],
      reportingPoints: [{ airport: 'ESSU', name: 'TORSHÄLLA', lat: 59.42, lon: 16.47, compulsory: false }],
      complete: true, reportingPointsAvailable: true,
    });
    const onChange = jest.fn(), onArrival = jest.fn();
    const { container } = render(<RouteMap airports={route} onWaypointsChange={onChange} onArrivalChange={onArrival}/>);
    // ESOW is the departure: drawn as the route, not again.
    await waitFor(() => expect(container.querySelectorAll('.area-airport')).toHaveLength(1));
    expect(fetchMapArea).toHaveBeenCalled();
    const [south, west, north, east] = (fetchMapArea as jest.Mock).mock.calls[0];
    expect(south).toBeLessThanOrEqual(59.35);
    expect(north).toBeGreaterThanOrEqual(59.59);
    expect(west).toBeLessThanOrEqual(16.63);
    expect(east).toBeGreaterThanOrEqual(17.94);
    expect(screen.getByText('ESSU')).toBeInTheDocument();
    expect(screen.getByText('TORSHÄLLA')).toBeInTheDocument();
    expect(container.querySelectorAll('.route-map-arrival')).toHaveLength(1); // the arrival can be dragged
    expect(screen.getByText(/Drag ESSB onto another airport/)).toBeInTheDocument();

    fireEvent.click(container.querySelector('.area-airport') as Element);
    expect(await screen.findByText('Eskilstuna')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Fly here instead' }));
    expect(onArrival).toHaveBeenCalledWith('ESSU');
    // Drawn as the arrival straight away, so no longer as an airport in view.
    await waitFor(() => expect(container.querySelectorAll('.area-airport')).toHaveLength(0));
    expect(onChange).not.toHaveBeenCalled();
  });

  test('an airport in view can be routed via', async () => {
    (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
    (fetchMapArea as jest.Mock).mockResolvedValue({
      airports: [{ code: 'ESSU', name: 'Eskilstuna', type: 'small', lat: 59.3511, lon: 16.7083 }],
      reportingPoints: [], complete: true, reportingPointsAvailable: false,
    });
    const onChange = jest.fn();
    const { container } = render(<RouteMap airports={route} onWaypointsChange={onChange}/>);
    await waitFor(() => expect(container.querySelectorAll('.area-airport')).toHaveLength(1));
    expect(container.querySelectorAll('.route-map-arrival')).toHaveLength(0); // without the callback, not draggable
    fireEvent.click(container.querySelector('.area-airport') as Element);
    expect(screen.queryByRole('button', { name: 'Fly here instead' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Route via this airport' }));
    expect(onChange).toHaveBeenCalledWith(['ESSU']);
  });

  test('the IFR/GNSS fixes in view, from the AIP: one can be routed via; switched off in the layers', async () => {
    localStorage.clear();
    (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
    const onChange = jest.fn();
    const { container } = render(<RouteMap airports={route} onWaypointsChange={onChange}/>);
    await waitFor(() => expect(container.querySelectorAll('.fix-marker').length).toBeGreaterThan(0));
    fireEvent.click(container.querySelector('.fix-marker') as Element);
    expect(await screen.findByText(/IFR\/GNSS fix \(AIP ENR 4\.4\)/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Route via this point' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0]).toHaveLength(1);

    const toggle = Array.from(container.querySelectorAll<HTMLInputElement>('.leaflet-control-layers-selector'))
      .find(i => i.parentElement?.textContent?.includes('IFR fixes')) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    fireEvent.click(toggle);
    await waitFor(() => expect(container.querySelector('.fix-marker')).toBeNull());
    expect(localStorage.getItem('map.showIfrFixes')).toBe('no');
  });
});
