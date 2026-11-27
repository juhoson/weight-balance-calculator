import { forgetAirportLayouts, holdingBar, keepLoadingLayouts, isUnpaved, lengthM, loadAirportLayout, metersPerPixel, runwayEnds, taxiwayLabels, type LayoutFeature } from './airportLayout';
import { fetchAirportLayout } from '../api/backend';

jest.mock('../api/backend', () => ({ fetchAirportLayout: jest.fn() }));
const fetchMock = fetchAirportLayout as jest.MockedFunction<typeof fetchAirportLayout>;

const f = (kind: string, points: Array<[number, number]>, extra: Partial<LayoutFeature> = {}): LayoutFeature =>
  ({ kind, ref: null, widthM: null, surface: null, points, ...extra });

describe('runwayEnds', () => {
  // Running north-west to south-east (about 120°).
  const rwy = f('runway', [[59.36, 17.92], [59.35, 17.95]], { ref: '12/30' });

  it('puts each number at the end a take-off on it starts from', () => {
    const [a, b] = runwayEnds(rwy);
    expect(a.label).toBe('12');
    expect(a.at[0]).toBeGreaterThan(59.36); // beyond the north-west end
    expect(b.label).toBe('30');
    expect(b.at[0]).toBeLessThan(59.35);
  });

  it('works when the way is mapped the other way round', () => {
    const ends = runwayEnds({ ...rwy, points: [...rwy.points].reverse() });
    expect(ends.find(e => e.label === '12')?.at[0]).toBeGreaterThan(59.36);
  });

  it('needs a ref', () => {
    expect(runwayEnds({ ...rwy, ref: null })).toEqual([]);
  });
});

describe('holdingBar', () => {
  const twy = f('taxiway', [[59.0, 17.0], [59.0, 17.01]], { widthM: 20 }); // east-west
  it('lays a bar across the nearest taxiway', () => {
    const bar = holdingBar(f('holding', [[59.0, 17.005]]), [twy]);
    expect(bar).toHaveLength(2);
    const [p, q] = bar ?? [];
    // North-south, 26 m long (half the width and 3 m either side).
    expect(Math.abs(p[1] - q[1])).toBeLessThan(1e-6);
    expect(lengthM([p, q])).toBeCloseTo(26, 0);
  });
  it('none when no taxiway is near', () => {
    expect(holdingBar(f('holding', [[59.01, 17.005]]), [twy])).toBeNull();
  });
  it('a line as mapped', () => {
    const pts: Array<[number, number]> = [[59, 17], [59.0001, 17]];
    expect(holdingBar(f('holding', pts), [])).toBe(pts);
  });
});

describe('taxiwayLabels', () => {
  it('one letter per stretch, not one per short way', () => {
    const labels = taxiwayLabels([
      f('taxiway', [[59.0, 17.0], [59.0, 17.002]], { ref: 'A' }),
      f('taxiway', [[59.0, 17.002], [59.0, 17.004]], { ref: 'A' }),
      f('taxiway', [[59.0, 17.0], [59.0, 17.003]], { ref: 'B' }),
      f('taxiway', [[59.0, 17.0], [59.0, 17.003]]),
      f('taxiway', [[59.1, 17.0], [59.1, 17.003]], { ref: 'Taxiway C' }),
    ]);
    expect(labels.map(l => l.label).sort()).toEqual(['A', 'B', 'C']);
  });
});

it('scale and surface', () => {
  expect(metersPerPixel(0, 0)).toBeCloseTo(156543, 0);
  expect(metersPerPixel(60, 16)).toBeCloseTo(1.19, 2);
  expect(isUnpaved(f('runway', [], { surface: 'grass' }))).toBe(true);
  expect(isUnpaved(f('runway', [], { surface: 'asphalt' }))).toBe(false);
});

describe('loadAirportLayout', () => {
  beforeEach(() => { localStorage.clear(); forgetAirportLayouts(); fetchMock.mockReset(); });
  const layout = { code: 'ESSB', features: [f('runway', [[59, 17], [59.01, 17]], { ref: '01/19' })], available: true };

  it('keeps a layout on the device and uses it without asking again', async () => {
    fetchMock.mockResolvedValue(layout);
    expect(await loadAirportLayout('essb')).toEqual(layout);
    forgetAirportLayouts();
    expect(await loadAirportLayout('ESSB')).toEqual(layout);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('falls back to an old copy when the server has none just now', async () => {
    localStorage.setItem('airportLayout.v1.ESSB', JSON.stringify({ at: 0, layout }));
    fetchMock.mockResolvedValue({ code: 'ESSB', features: [], available: false });
    expect(await loadAirportLayout('ESSB')).toEqual(layout);
    fetchMock.mockRejectedValue(new Error('offline'));
    expect(await loadAirportLayout('ESSB')).toEqual(layout);
  });
});

describe('keepLoadingLayouts', () => {
  beforeEach(() => { localStorage.clear(); forgetAirportLayouts(); fetchMock.mockReset(); jest.useFakeTimers(); });
  afterEach(() => jest.useRealTimers());
  const layout = { code: 'ESOW', features: [f('runway', [[59, 17], [59.01, 17]], { ref: '01/19' })], available: true };
  const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

  it('asks again until the server has it', async () => {
    fetchMock.mockResolvedValueOnce({ code: 'ESOW', features: [], available: false }).mockResolvedValueOnce(layout);
    const got: string[] = [];
    const stop = keepLoadingLayouts(['ESOW'], code => got.push(code), 1000);
    await flush();
    expect(got).toEqual([]);
    jest.advanceTimersByTime(1000);
    await flush();
    expect(got).toEqual(['ESOW']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops asking when stopped, or when the field has nothing mapped', async () => {
    fetchMock.mockResolvedValue({ code: 'ESXX', features: [], available: false });
    const stop = keepLoadingLayouts(['ESXX'], () => undefined, 1000);
    await flush();
    stop();
    jest.advanceTimersByTime(5000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    forgetAirportLayouts();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ code: 'ESYY', features: [], available: true });
    keepLoadingLayouts(['ESYY'], () => undefined, 1000);
    await flush();
    jest.advanceTimersByTime(5000);
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
