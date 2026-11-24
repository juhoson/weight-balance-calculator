import { type OkPlan, suggestAltitudes } from './suggestAltitude';
import { type AirspaceCheck, altitudeAlongPoints } from './airspace';
import type { EnrouteForecast, EnrouteSegment } from '../types/route';

const hours = ['2026-11-23T10:00:00Z', '2026-11-23T11:00:00Z', '2026-11-23T12:00:00Z'];
const departure = new Date('2026-11-23T10:00:00Z');
// Westbound (about 264° magnetic): above 3,000 ft over the ground, the even thousands + 500.
const legs = [{ from: 'ESGG', to: 'ESSX', distanceNm: 100, trueCourseDeg: 270 }];

function forecastAt(windFrom: number, kt: number, over: Partial<EnrouteSegment> = {}): EnrouteForecast {
  const seg = (startNm: number): EnrouteSegment => ({
    leg: 0, startNm, distanceNm: 50, trueCourseDeg: 270, lat: 59, lon: 14, groundFt: 100,
    windDirTrue: [windFrom, windFrom, windFrom], windKt: [kt, kt, kt], tempC: [5, 5, 5],
    cloudBaseFt: [null, null, null], freezingLevelFt: [null, null, null], layers: [[], [], []], ...over,
  });
  return { available: true, altitudeFt: 0, times: hours, segments: [seg(0), seg(50)] };
}

const area = (name: string): AirspaceCheck => ({
  airspace: { id: name, name, type: 'TMA', icaoClass: 'C', activation: null, polygon: [],
    lower: { ft: 1800, datum: 'MSL', label: '1,800 ft MSL' }, upper: { ft: 9500, datum: 'STD', label: 'FL95' }, frequencies: [] },
  fromNm: 10, toNm: 20, status: 'inside', minFt: 0, maxFt: 0, floorFt: 1800, ceilingFt: 9500,
});

/** Headwind 30 kt low, easing with height, and a 20 kt tailwind at 6,500 ft. */
function forecasts(over: Partial<EnrouteSegment> = {}) {
  const m = new Map<number, EnrouteForecast>();
  for (let ft = 1000; ft <= 6500; ft += 500) m.set(ft, { ...(ft === 6500 ? forecastAt(90, 20, over) : forecastAt(270, 30 - ft / 250, over)), altitudeFt: ft });
  return m;
}

const input = (m: Map<number, EnrouteForecast>) => ({
  legs, forecasts: m, tasKt: 100, departure, verticalFor: () => undefined,
  // The CTR at the field is entered at every altitude; the TMA from 2,000 ft up.
  airspaceFor: (_: unknown, ft: number) => (ft >= 2000 ? [area('DEP CTR'), area('BIG TMA')] : [area('DEP CTR')]),
});

it('compares only VFR cruising levels for the course above 3,000 ft over the ground', () => {
  const s = suggestAltitudes(input(forecasts()));
  expect(s.options.map(o => o.ft)).toEqual([1000, 1500, 2000, 2500, 3000, 4500, 6500]);
});

it('suggests clear of trouble first, then the least airspace, and finds the most favourable wind', () => {
  const s = suggestAltitudes(input(forecasts()));
  expect(s.options[0].problems).toEqual(['less than 1,000 ft above the terrain']);
  expect(s.common).toEqual(['DEP CTR']);
  expect(s.suggested[0]).toMatchObject({ ft: 1500, enters: [] });
  expect(s.suggested.map(o => o.ft)).toEqual([1500, 6500, 4500]);
  expect(s.bestWinds).toMatchObject({ ft: 6500, enters: ['BIG TMA'] });
  expect(s.bestWinds?.windKt).toBeCloseTo(20);
  expect(s.suggested[0].windKt).toBeCloseTo(-24);
});

it('leaves out altitudes in or near cloud, and says when none is clear', () => {
  const s = suggestAltitudes(input(forecasts({ cloudBaseFt: [3000, 3000, 3000] })));
  expect(s.options.find(o => o.ft === 2500)?.problems).toEqual([]);
  expect(s.options.find(o => o.ft === 3000)?.problems).toEqual(['cloud base within 500 ft (≈ 3,000 ft)']);
  expect(s.options.find(o => o.ft === 4500)?.problems[0]).toBe('cloud base below (≈ 3,000 ft)');
  expect(s.bestWinds?.ft).toBe(2500);
  expect(s.suggested[0]).toMatchObject({ ft: 1500, belowCloudFt: 1500 });

  const none = suggestAltitudes(input(forecasts({ cloudBaseFt: [800, 800, 800] })));
  expect(none.suggested).toEqual([]);
  expect(none.bestWinds).toBeNull();
});

it('skips an altitude the wind is too strong to fly at', () => {
  const m = forecasts();
  m.set(1500, { ...forecastAt(270, 120), altitudeFt: 1500 });
  expect(suggestAltitudes(input(m)).options.map(o => o.ft)).not.toContain(1500);
});

describe('with altitude changes', () => {
  // 100 NM west in four 25 NM segments; a TMA from 2,500 ft over 25-75 NM.
  const v = (ft: number) => ({ cruiseFt: ft, departureFt: 0, arrivalFt: 1000, climbTasKt: 70, climbFpm: 700, descentFpm: 500 });
  const tma = { ...area('MID TMA'), fromNm: 25, toNm: 75, floorFt: 2500 };
  const airspaceFor = (plan: OkPlan, ft: number): AirspaceCheck[] => {
    const at = altitudeAlongPoints(plan.profile?.path ?? [{ nm: 0, ft }, { nm: 100, ft }]);
    let max = 0;
    for (let nm = 25; nm <= 75; nm += 0.5) max = Math.max(max, at(nm));
    return [{ ...tma, status: max >= 2500 ? 'inside' : 'below' }];
  };
  /** Four 25 NM segments. */
  const quarters = (f: EnrouteForecast, ft: number): EnrouteForecast => ({
    ...f, altitudeFt: ft, segments: [0, 25, 50, 75].map(startNm => ({ ...f.segments[0], startNm, distanceNm: 25 })),
  });
  /** Headwind 30 kt up to 3,000 ft, a 20 kt tailwind above. */
  function windy() {
    const m = new Map<number, EnrouteForecast>();
    for (let ft = 1000; ft <= 6500; ft += 500) m.set(ft, quarters(forecastAt(ft > 3000 ? 90 : 270, ft > 3000 ? 20 : 30), ft));
    return m;
  }

  it('goes under the TMA where it is and flies the tailwind elsewhere, when that beats every single altitude', () => {
    const s = suggestAltitudes({ legs, forecasts: windy(), tasKt: 100, departure, verticalFor: v, airspaceFor });
    expect(s.suggested[0].enters).toEqual([]);
    expect(s.suggested[0].ft).toBeLessThanOrEqual(2000);
    expect(s.stepped).toMatchObject({ ft: 4500, holds: [{ fromNm: 25, toNm: 75, ft: 2000 }], enters: [] });
    expect(s.stepped?.minutes).toBeLessThan(s.suggested[0].minutes - 2);
  });

  it('suggests none when one altitude does as well', () => {
    const calm = new Map<number, EnrouteForecast>();
    for (let ft = 1000; ft <= 6500; ft += 500) calm.set(ft, quarters(forecastAt(270, 10), ft));
    const none = (): AirspaceCheck[] => [];
    expect(suggestAltitudes({ legs, forecasts: calm, tasKt: 100, departure, verticalFor: v, airspaceFor: none }).stepped).toBeNull();
  });
});
