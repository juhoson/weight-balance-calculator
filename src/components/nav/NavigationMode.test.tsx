import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { acceptNavTerms, downloadTrackKml, fetchAirportsAlong, fetchAirspacesAlong, fetchMapArea, fetchMapStatus, fetchTraffic, saveTrack } from '../../api/backend';
import { useAuth } from '../../api/useAuth';
import type { AirportInfo, AirspaceView, RouteWeather } from '../../types/route';

// Leaflet draws lines in SVG only where the browser has createSVGRect, which jsdom lacks.
(window.SVGSVGElement.prototype as unknown as { createSVGRect: () => object }).createSVGRect = () => ({});
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { default: NavigationMode, airspaceBorder } = require('./NavigationMode') as typeof import('./NavigationMode');

jest.mock('../../api/backend', () => ({
  fetchMapStatus: jest.fn(),
  fetchAirportsAlong: jest.fn(),
  fetchAirspacesAlong: jest.fn(),
  fetchTraffic: jest.fn(),
  airspacesFetchedAt: () => null,
  fetchMapArea: jest.fn(),
  saveTrack: jest.fn(),
  acceptNavTerms: jest.fn(),
  downloadTrackKml: jest.fn(),
  AIRSPACE_TILE_URL: '/api/map/airspace/{z}/{x}/{y}.png',
  BASEMAP_TILE_URL: '/api/map/base/{z}/{x}/{y}.mvt',
}));
jest.mock('../../api/useAuth', () => ({ useAuth: jest.fn() }));
// No forecast wind or terrain here (the glide in still air over the fields' elevation), unless a test gives them.
jest.mock('../../lib/openMeteo', () => ({ ...jest.requireActual('../../lib/openMeteo'), forecastAt: () => Promise.resolve(null) }));
jest.mock('../../lib/glide', () => ({ ...jest.requireActual('../../lib/glide'), fetchTerrain: () => new Promise(() => undefined) }));
const signedIn = (navTermsVersion: number | null = 1) => (useAuth as jest.Mock).mockReturnValue({
  user: { id: 1, email: 'p@example.com', displayName: 'Pilot', navTermsVersion }, signOutReason: null,
});
// The real one is an ES module Jest can't load; a plain layer stands in.
jest.mock('protomaps-leaflet', () => ({ leafletLayer: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { leafletLayer } = require('protomaps-leaflet') as { leafletLayer: jest.Mock };

const airport = (code: string, name: string, lat: number, lon: number, elevationFt = 50): AirportInfo => ({
  code, name, type: 'medium', lat, lon, elevationFt, country: 'SE', municipality: '',
  runways: [{ le: '01', he: '19', lengthFt: 8000, surface: 'ASP', leHeadingTrue: 10, heHeadingTrue: 190, headingEstimated: false }],
});
const esow = airport('ESOW', 'Västerås', 59.5894, 16.6336);
const essb = airport('ESSB', 'Bromma', 59.3544, 17.9417);
const essx = airport('ESSX', 'Johannisberg', 59.5786, 16.5031);
const trip = { departure: esow, arrival: essb, waypoints: [], distanceNm: 42 } as unknown as RouteWeather;
const ctr: AirspaceView = {
  id: 'ctr', name: 'VÄSTERÅS CTR', type: 'CTR', icaoClass: 'D', activation: null,
  polygon: [[16.4, 59.5], [16.9, 59.5], [16.9, 59.7], [16.4, 59.7], [16.4, 59.5]],
  lower: { ft: 0, datum: 'GND', label: 'GND' }, upper: { ft: 1500, datum: 'MSL', label: '1500 ft' },
  frequencies: [{ value: '130.605', name: 'VÄSTERÅS TOWER', kind: 'TWR', primary: true, source: null }],
};

beforeEach(() => {
  localStorage.clear();
  signedIn();
  (fetchMapStatus as jest.Mock).mockResolvedValue({ airspace: false, minZoom: 4, maxZoom: 14 });
  (fetchAirportsAlong as jest.Mock).mockResolvedValue([esow, essb, essx]);
  // No traffic answer unless a test gives one.
  (fetchTraffic as jest.Mock).mockReturnValue(new Promise(() => undefined));
  (fetchMapArea as jest.Mock).mockResolvedValue({ airports: [], reportingPoints: [], complete: true, reportingPointsAvailable: true });
});

/** Renders and lets the mocked loads (map status, airfields, reporting points) settle inside act. */
async function settled(ui: React.ReactElement) {
  let result: ReturnType<typeof render> | undefined;
  await act(async () => { result = render(ui); });
  return result as ReturnType<typeof render>;
}

const open = (onClose = jest.fn()) => settled(
  <NavigationMode trip={trip} airspaces={[ctr]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} onClose={onClose}/>,
);

test('a VFR navigation aid: the terms are accepted once, with the account', async () => {
  signedIn(null);
  (acceptNavTerms as jest.Mock).mockResolvedValue({});
  const onClose = jest.fn();
  const { unmount } = await open(onClose);
  expect(screen.getByText(/A VFR navigation aid/)).toBeInTheDocument();
  expect(screen.getByText(/Check the AIP and NOTAMs before flight/)).toBeInTheDocument();
  const start = screen.getByRole('button', { name: 'Demo flight' });
  expect(start).toBeDisabled();
  fireEvent.click(screen.getByLabelText('I understand and accept this'));
  fireEvent.click(start);
  expect(acceptNavTerms).toHaveBeenCalledWith(1);
  // First out on the runway heading to 700 ft, then on to ESSB.
  expect(await screen.findByText(/^Next RWY \d+ · 700 ft$/)).toBeInTheDocument();
  unmount();
  // Accepted on this device even before the account has it (no connection): not asked again here.
  await open();
  expect(screen.queryByLabelText('I understand and accept this')).toBeNull();
  expect(screen.getByRole('button', { name: 'Demo flight' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
});

test('signed out: asks to sign in, nothing to start', async () => {
  (useAuth as jest.Mock).mockReturnValue({ user: null, signOutReason: null });
  await open();
  expect(screen.getByText('Sign in to use navigation mode.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start with GPS' })).toBeDisabled();
});

test('shows when the airspace was downloaded, and warns once it is older than an AIRAC cycle', async () => {
  const day = 86_400_000;
  const { unmount } = await settled(<NavigationMode trip={trip} airspaces={[ctr]} airspacesFetchedAt={Date.now() - day} reportingPoints={[]}
    swedenControl={[]} bestGlideKt={73} cruiseKt={110} cruiseAltFt={3500} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(screen.getByText(/Airspace: openAIP \(volunteers\), downloaded .*No NOTAMs/)).toBeInTheDocument();
  unmount();
  await settled(<NavigationMode trip={trip} airspaces={[ctr]} airspacesFetchedAt={Date.now() - 31 * day} reportingPoints={[]}
    swedenControl={[]} bestGlideKt={73} cruiseKt={110} cruiseAltFt={3500} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(screen.getByText(/Airspace data is 31 days old: update it with a connection/)).toBeInTheDocument();
});

test('the demo flight shows speed, track, the next point and the airspace it is in', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('DEMO FLIGHT (4× speed)')).toBeInTheDocument();
  // From standstill on the runway, at the field's elevation.
  expect(screen.getByText('GS kt').nextSibling).toHaveTextContent(/^0$/);
  expect(screen.getByText('GPS alt ft').nextSibling).toHaveTextContent(/^50$/);
  expect(screen.getByText(/^Next RWY \d+ · 700 ft$/)).toBeInTheDocument(); // the climb-out first
  const here = screen.getByRole('status', { name: 'Airspace here' });
  expect(within(here).getByText('VÄSTERÅS CTR')).toBeInTheDocument();
  expect(within(here).getByText('130.605 VÄSTERÅS TOWER')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Frequencies/ }));
  const freq = screen.getByRole('region', { name: 'Frequencies' });
  expect(within(freq).getByText('Emergency 121.500')).toBeInTheDocument();
  expect(within(freq).getByText('now')).toBeInTheDocument();
});

test('emergency lists the nearest airfields within glide; Direct to steers to one', async () => {
  // 3,000 ft (914 m) over Västerås, eastbound.
  const watchPosition = jest.fn((ok: PositionCallback) => {
    ok({ timestamp: Date.now(), coords: { latitude: 59.59, longitude: 16.7, altitude: 914.4, speed: 50, heading: 100, accuracy: 8 } } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  await screen.findByText(/^Next ESSB/);
  expect(screen.getByText('3,000')).toBeInTheDocument();
  expect(screen.getByText('100')).toBeInTheDocument();
  await waitFor(() => expect(fetchAirportsAlong).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /EMERGENCY/ }));
  const sheet = screen.getByRole('region', { name: 'Emergency' });
  const rows = within(sheet).getAllByRole('listitem').filter(li => within(li).queryByRole('button', { name: 'Direct to' }));
  expect(rows[0]).toHaveTextContent('ESOW');
  expect(within(sheet).getAllByText('In glide').length).toBeGreaterThan(0);
  expect(within(sheet).getByText('MAYDAY')).toBeInTheDocument();
  fireEvent.click(within(rows[1]).getByRole('button', { name: 'Direct to' }));
  expect(screen.getByText(/^Direct to ESS[XB]$/)).toBeInTheDocument();
  // Which way to turn: eastbound now, the field west of here.
  expect(within(screen.getByRole('status', { name: 'Direct to' })).getByText(/^TURN (LEFT|RIGHT) HEADING \d{3}$/)).toBeInTheDocument();
  expect(screen.getByText(/no wind known/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Back to route' }));
  expect(screen.getByText(/^Next ESSB/)).toBeInTheDocument();
});

test('with the server\'s own base map: drawn from it, and the route\'s tiles are saved for offline', async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const L = require('leaflet');
  leafletLayer.mockImplementation(() => L.layerGroup());
  (fetchMapStatus as jest.Mock).mockResolvedValue({
    airspace: true, minZoom: 4, maxZoom: 14, basemap: { minZoom: 0, maxZoom: 11, bounds: [4, 53.5, 32, 71.5] },
  });
  const kept = new Map<string, unknown>();
  (window as unknown as { caches: unknown }).caches = {
    open: async () => ({
      match: async (url: string) => kept.get(url),
      put: async (url: string, res: unknown) => { kept.set(url, res); },
      keys: async () => Array.from(kept.keys()),
    }),
    delete: async () => true,
  };
  global.fetch = jest.fn(async () => ({ status: 200 })) as unknown as typeof fetch;
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('Map saved for offline', {}, { timeout: 5000 })).toBeInTheDocument();
  expect(leafletLayer).toHaveBeenCalledWith(expect.objectContaining({ url: '/api/map/base/{z}/{x}/{y}.mvt', maxDataZoom: 11 }));
  const urls = Array.from(kept.keys());
  expect(urls.some(u => u.includes('/api/map/base/11/'))).toBe(true);
  expect(urls.some(u => u.includes('/api/map/airspace/10/'))).toBe(true);
  expect(urls.some(u => u.includes('/api/map/airspace/11/'))).toBe(false); // shown enlarged from 10
  delete (window as unknown as { caches?: unknown }).caches;
});

test('a GPS flight ends on its own page: saved to the account, then its KML', async () => {
  localStorage.clear();
  let tick: PositionCallback = () => undefined;
  const watchPosition = jest.fn((ok: PositionCallback) => { tick = ok; return 1; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  (saveTrack as jest.Mock).mockResolvedValue({ id: 7, name: 'x', startedAt: '', endedAt: '', distanceNm: 1, pointCount: 2 });
  (downloadTrackKml as jest.Mock).mockResolvedValue(undefined);
  const onClose = jest.fn();
  await settled(<NavigationMode trip={trip} airspaces={[]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} signedIn onClose={onClose}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  const at = (lat: number, t: number) => act(() => tick({ timestamp: t, coords: { latitude: lat, longitude: 16.7, altitude: 600, speed: 50, heading: 0, accuracy: 8 } } as GeolocationPosition));
  await waitFor(() => expect(watchPosition).toHaveBeenCalled());
  at(59.59, 1_000_000);
  await screen.findByText(/^Next ESSB/);
  at(59.60, 1_060_000);
  at(59.61, 1_120_000);
  // Kept on the device for a reload in the air, with the airfields once loaded.
  await waitFor(() => expect(JSON.parse(localStorage.getItem('nav.session.v1') ?? '{}').airfields).toHaveLength(3));
  expect(JSON.parse(localStorage.getItem('nav.session.v1') ?? '{}')).toMatchObject({ cruiseKt: 110, bestGlideKt: 73, trip: { distanceNm: 42 } });

  fireEvent.click(screen.getByRole('button', { name: 'Close navigation mode' }));
  const end = screen.getByRole('region', { name: 'End flight' });
  expect(within(end).getByDisplayValue(/^ESOW → ESSB, /)).toBeInTheDocument();
  // Recorded from the takeoff roll on: off block and takeoff are the first fix; still flying, no landing.
  expect(within(end).getByText('Takeoff').nextSibling).toHaveTextContent(/^\d\d:\d\dZ$/);
  fireEvent.click(within(end).getByRole('button', { name: 'Save to My flights' }));
  expect(await within(end).findByText('Saved to My flights, with its times.')).toBeInTheDocument();
  expect((saveTrack as jest.Mock).mock.calls[0][1]).toHaveLength(3);
  expect((saveTrack as jest.Mock).mock.calls[0][1][0]).toEqual({ lat: 59.59, lon: 16.7, altFt: 1969, at: 1_000_000 });
  expect((saveTrack as jest.Mock).mock.calls[0][2]).toEqual({
    offBlock: new Date(1_000_000).toISOString(), takeoff: new Date(1_000_000).toISOString(), landing: null, onBlock: null, landings: 0,
  });
  // The KML is made here, without the server.
  const createObjectURL = jest.fn(() => 'blob:kml');
  Object.assign(URL, { createObjectURL, revokeObjectURL: () => undefined });
  fireEvent.click(within(end).getByRole('button', { name: /Download KML/ }));
  expect(createObjectURL).toHaveBeenCalled();
  expect(downloadTrackKml).not.toHaveBeenCalled();
  expect(localStorage.getItem('nav.blockLog.v1')).toBeNull();
  fireEvent.click(within(end).getByRole('button', { name: 'Close navigation mode' }));
  expect(onClose).toHaveBeenCalled();
  expect(localStorage.getItem('nav.track.v1')).toBeNull();
  expect(localStorage.getItem('nav.session.v1')).toBeNull();
});

test('resumed after a reload with no connection: says so, and the emergency list is the one kept with the flight', async () => {
  (fetchAirportsAlong as jest.Mock).mockRejectedValue(new Error('offline'));
  (fetchMapStatus as jest.Mock).mockRejectedValue(new Error('offline'));
  (fetchMapArea as jest.Mock).mockRejectedValue(new Error('offline'));
  const watchPosition = jest.fn((ok: PositionCallback) => {
    ok({ timestamp: Date.now(), coords: { latitude: 59.59, longitude: 16.7, altitude: 914.4, speed: 50, heading: 100, accuracy: 8 } } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  await settled(<NavigationMode trip={trip} airspaces={[ctr]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} signedIn onClose={jest.fn()}
    resumed={{ airfields: [esow, essb, essx], nearVrps: [{ name: 'KOLBÄCK', lat: 59.57, lon: 16.25, compulsory: false }] }}/>);
  expect(screen.getByText(/ESOW → ESSB was still going when the page closed/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Resume with GPS' }));
  await screen.findByText(/^Next ESSB/);
  await waitFor(() => expect(fetchAirportsAlong).toHaveBeenCalled());
  fireEvent.click(screen.getByRole('button', { name: /EMERGENCY/ }));
  const sheet = screen.getByRole('region', { name: 'Emergency' });
  expect(within(sheet).getByText('ESSX')).toBeInTheDocument();
  expect(within(sheet).queryByText(/airfield list couldn/)).toBeNull();
});

test('the demo flight closes straight away: nothing to save', async () => {
  const onClose = jest.fn();
  await open(onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  fireEvent.click(screen.getByRole('button', { name: 'Close navigation mode' }));
  expect(onClose).toHaveBeenCalled();
});

test('the reporting points near the route are on the map, whichever airport they belong to; switched off and on', async () => {
  (fetchMapArea as jest.Mock).mockResolvedValue({
    airports: [], complete: true, reportingPointsAvailable: true,
    reportingPoints: [
      { airport: 'ESSX', name: 'KOLBÄCK', lat: 59.57, lon: 16.25, compulsory: false },
      { airport: 'ESKN', name: 'FAR AWAY', lat: 58.7, lon: 16.9, compulsory: true },
    ],
  });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('KOLBÄCK')).toBeInTheDocument();
  expect(screen.queryByText('FAR AWAY')).toBeNull();
  const vrp = screen.getByRole('button', { name: 'VRP' });
  expect(vrp).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(vrp);
  expect(screen.queryByText('KOLBÄCK')).toBeNull();
  expect(localStorage.getItem('nav.showVrp')).toBe('no');
  fireEvent.click(vrp);
  expect(screen.getByText('KOLBÄCK')).toBeInTheDocument();
});

test('a tower zone shows its ATIS and ground too; class G around a non-controlled area still gives Sweden Control', async () => {
  const withAtis: AirspaceView = { ...ctr, frequencies: [...ctr.frequencies,
    { value: '127.555', name: 'VÄSTERÅS ATIS', kind: 'ATIS', primary: false, source: 'ESOW' },
    { value: '121.905', name: 'VÄSTERÅS GROUND', kind: 'GND', primary: false, source: 'ESOW' }] };
  const { unmount } = await settled(<NavigationMode trip={trip} airspaces={[withAtis]} reportingPoints={[]} swedenControl={[]}
    bestGlideKt={73} cruiseKt={110} cruiseAltFt={3500} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('ATIS 127.555 · GND 121.905')).toBeInTheDocument();
  unmount();
  const tia: AirspaceView = { ...ctr, id: 'tia', name: 'GLIDING AREA', type: 'OTHER', icaoClass: 'G', frequencies: [] };
  await settled(<NavigationMode trip={trip} airspaces={[tia]} reportingPoints={[]} swedenControl={[]}
    bestGlideKt={73} cruiseKt={110} cruiseAltFt={3500} onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('Class G around')).toBeInTheDocument();
  expect(within(screen.getByRole('status', { name: 'Airspace here' })).getByText(/SWEDEN CONTROL|Sweden Control/)).toBeInTheDocument();
});

test('the IFR/GNSS fixes from the AIP near the route: shown at first, switched off and on', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  const ifr = await screen.findByRole('button', { name: 'IFR' });
  expect(ifr).toHaveAttribute('aria-pressed', 'true');
  // Drawn once the map is there (after the server's map status).
  await waitFor(() => expect(document.querySelectorAll('.fix-marker').length).toBeGreaterThan(0));
  fireEvent.click(ifr);
  expect(document.querySelector('.fix-marker')).toBeNull();
  expect(localStorage.getItem('nav.showIfrFixes')).toBe('no');
});

test('IFR fixes and navaids past their AIRAC cycle: a warning while they are shown', async () => {
  jest.spyOn(Date, 'now').mockReturnValue(Date.UTC(2027, 0, 30));
  try {
    await open();
    fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
    expect(await screen.findByText(/IFR fixes and navaids are from AIRAC 26 Nov 2026, out of date now/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'IFR' }));
    fireEvent.click(screen.getByRole('button', { name: 'NAV' }));
    expect(screen.queryByText(/are from AIRAC/)).toBeNull();
  } finally {
    jest.restoreAllMocks();
  }
});

test('the radio navaids near the route, with what to tune; switched off with NAV', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Demo flight' }));
  expect(await screen.findByText('ARS 112.80')).toBeInTheDocument();
  expect(screen.getByText('TEB 117.10')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'NAV' }));
  expect(screen.queryByText('ARS 112.80')).toBeNull();
  expect(localStorage.getItem('nav.showNavaids')).toBe('no');
});

test('without a route: GPS only, no demo; the airspace and airfields around the aircraft load as it flies', async () => {
  (fetchAirspacesAlong as jest.Mock).mockResolvedValue([ctr]);
  const watchPosition = jest.fn((ok: PositionCallback) => {
    ok({ timestamp: Date.now(), coords: { latitude: 59.59, longitude: 16.7, altitude: 300, speed: 50, heading: 100, accuracy: 8 } } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  await settled(<NavigationMode trip={null} airspaces={null} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} onClose={jest.fn()}/>);
  expect(screen.queryByRole('button', { name: 'Demo flight' })).toBeNull();
  expect(screen.getByText(/No route planned/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  // Around the aircraft: a zigzag over the area, for the airspace and the airfields.
  await waitFor(() => expect(fetchAirspacesAlong).toHaveBeenCalled());
  expect((fetchAirspacesAlong as jest.Mock).mock.calls[0][0].length).toBeGreaterThan(4);
  await waitFor(() => expect(fetchAirportsAlong).toHaveBeenCalled());
  const here = await screen.findByRole('status', { name: 'Airspace here' });
  expect(await within(here).findByText('VÄSTERÅS CTR')).toBeInTheDocument();
  expect(screen.getByText('Next none')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'No route' })).toBeDisabled();
});

test('traffic near the aircraft is on the map with its height, and one heading for us is called out', async () => {
  // Over Västerås at 2,000 ft, eastbound; an aircraft 2 NM ahead coming the other way 200 ft higher.
  (fetchTraffic as jest.Mock).mockResolvedValue([{
    hex: '4ab4d9', callsign: 'SEABC', registration: 'SE-ABC', type: 'PA28', lat: 59.59, lon: 16.765, altFt: 2200, altFromPressure: false,
    onGround: false, gsKt: 100, trackDeg: 270, vsFpm: 0, seenS: 1,
  }]);
  const watchPosition = jest.fn((ok: PositionCallback) => {
    ok({ timestamp: Date.now(), coords: { latitude: 59.59, longitude: 16.7, altitude: 609.6, speed: 51.4, heading: 90, accuracy: 8 } } as GeolocationPosition);
    return 1;
  });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  const alert = await screen.findByRole('alert', { name: 'Traffic' });
  expect(alert).toHaveTextContent('TRAFFIC 12 O\'CLOCK 2.0 NM');
  expect(alert).toHaveTextContent('200 ft above');
  expect(alert).toHaveTextContent('SE-ABC PA28');
  expect(screen.getByText('+02 SE-ABC')).toBeInTheDocument();
  expect(screen.getByText('Traffic: 1 within 10 NM (ADS-B only)')).toBeInTheDocument();
  // The trend line ahead: where we'll be in 1, 2 and 3 minutes on this track.
  // 100 kt: 3.3 NM in two minutes, 5.0 in three; the first minute a dot without a label.
  expect(screen.getByText('2 min · 3.3 NM')).toBeInTheDocument();
  expect(screen.getByText('3 min · 5.0 NM')).toBeInTheDocument();
  // Switched off: gone from the map, still called out.
  fireEvent.click(screen.getByRole('button', { name: 'TFC' }));
  await waitFor(() => expect(screen.queryByText('+02 SE-ABC')).toBeNull());
  expect(screen.getByRole('alert', { name: 'Traffic' })).toBeInTheDocument();
});

test('on the way in, the planned landing runway is asked about, and another can be chosen', async () => {
  localStorage.clear();
  let tick: PositionCallback = () => undefined;
  const watchPosition = jest.fn((ok: PositionCallback) => { tick = ok; return 1; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  await settled(<NavigationMode trip={trip} airspaces={[]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} signedIn onClose={jest.fn()}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  await waitFor(() => expect(watchPosition).toHaveBeenCalled());
  const at = (lat: number, lon: number, t: number) => act(() => tick({ timestamp: t, coords: { latitude: lat, longitude: lon, altitude: 600, speed: 50, heading: 100, accuracy: 8 } } as GeolocationPosition));
  // Far out: not asked yet.
  at(59.5, 17.2, 1_000_000);
  expect(screen.queryByRole('status', { name: 'Landing runway' })).toBeNull();
  // 7 NM out: no wind reported, so the runway most in line with the way in (east-south-east: 19), joined by the circuit.
  at(59.38, 17.72, 1_060_000);
  const card = await screen.findByRole('status', { name: 'Landing runway' });
  expect(within(card).getByText('Landing RWY 19')).toBeInTheDocument();
  expect(within(card).getByText(/left circuit, join 45° onto the downwind/)).toBeInTheDocument();
  expect(screen.getByText(/^Next ESSB join DW$/)).toBeInTheDocument();
  fireEvent.click(within(card).getByRole('button', { name: 'Change to 01' }));
  expect(within(screen.getByRole('status', { name: 'Landing runway' })).getByRole('button', { name: 'RWY 01 ✓' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('Landing RWY 01')).toBeInTheDocument();
});

test('airspace borders: blue when controlled, red when restricted, dashed when only active at times', () => {
  expect(airspaceBorder({ type: 'CTR', icaoClass: 'D', activation: null })).toMatchObject({ color: '#1d4ed8', dashArray: undefined });
  expect(airspaceBorder({ type: 'R', icaoClass: null, activation: 'NOTAM' })).toMatchObject({ color: '#dc2626', dashArray: '8 6' });
  expect(airspaceBorder({ type: 'TMZ', icaoClass: 'G', activation: null })).toMatchObject({ color: '#7c3aed' });
});

test('exit flight from the debriefing pack saves the flight and leaves navigation mode', async () => {
  localStorage.clear();
  let tick: PositionCallback = () => undefined;
  const watchPosition = jest.fn((ok: PositionCallback) => { tick = ok; return 1; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch: jest.fn() } });
  (saveTrack as jest.Mock).mockReset().mockResolvedValue({ id: 8, name: 'x', startedAt: '', endedAt: '', distanceNm: 1, pointCount: 2 });
  const onClose = jest.fn();
  await settled(<NavigationMode trip={trip} airspaces={[]} reportingPoints={[]} swedenControl={[]} bestGlideKt={73}
    cruiseKt={110} cruiseAltFt={3500} signedIn onClose={onClose}/>);
  fireEvent.click(screen.getByRole('button', { name: 'Start with GPS' }));
  const at = (lat: number, t: number) => act(() => tick({ timestamp: t, coords: { latitude: lat, longitude: 16.7, altitude: 600, speed: 50, heading: 0, accuracy: 8 } } as GeolocationPosition));
  await waitFor(() => expect(watchPosition).toHaveBeenCalled());
  at(59.59, 1_000_000);
  at(59.60, 1_060_000);
  fireEvent.click(screen.getByRole('button', { name: 'Close navigation mode' }));
  const end = screen.getByRole('region', { name: 'End flight' });
  fireEvent.click(within(end).getByRole('button', { name: 'Debriefing pack' }));
  const pack = await screen.findByRole('dialog', { name: 'Debriefing pack' });
  expect(within(pack).getByText(/Saves the flight to My flights/)).toBeInTheDocument();
  fireEvent.click(within(pack).getByRole('button', { name: 'Exit flight' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(saveTrack).toHaveBeenCalledTimes(1);
});
