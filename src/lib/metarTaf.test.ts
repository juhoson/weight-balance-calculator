import { decodeMetar, decodeTaf, decodeWeather, formatUtcRange, periodIsNow, summarise, tafStatus } from './metarTaf';

describe('decodeWeather', () => {
  it.each([
    ['-SHRA', 'Light rain showers'],
    ['+TSRAGR', 'Heavy thunderstorm with rain and hail'],
    ['TS', 'Thunderstorm'],
    ['VCSH', 'Precipitation showers in the vicinity'],
    ['FZFG', 'Freezing fog'],
    ['BCFG', 'Patches of fog'],
    ['BLSN', 'Blowing snow'],
    ['RASN', 'Rain and snow'],
    ['BR', 'Mist'],
  ])('%s → %s', (token, text) => {
    expect(decodeWeather(token)?.text).toBe(text);
  });

  it('rejects things that are not weather', () => {
    expect(decodeWeather('BKN020')).toBeNull();
    expect(decodeWeather('Q1024')).toBeNull();
  });
});

describe('decodeMetar', () => {
  it('decodes a typical European METAR', () => {
    const d = decodeMetar('METAR ESSA 201720Z 25012G22KT 220V280 4000 1500SW -SHRA BR FEW008 BKN020CB M01/M03 Q1008 RERA NOSIG');
    expect(d.wind).toBe('From 250° at 12 kt, gusts 22 kt, varying 220°–280°');
    expect(d.visibility).toBe('4,000 m, lowest 1,500 m to the SW');
    expect(d.weather).toEqual(['Light rain showers', 'Mist']);
    expect(d.clouds).toEqual([
      { cover: 'FEW', baseFt: 800, type: null },
      { cover: 'BKN', baseFt: 2000, type: 'CB' },
    ]);
    expect(d.tempC).toBe(-1);
    expect(d.dewpointC).toBe(-3);
    expect(d.qnh).toBe('1008 hPa');
    expect(d.recent).toEqual(['Rain']);
    expect(d.trend).toEqual(['No significant change expected in the next 2 hours']);
    expect(d.unparsed).toEqual([]);
  });

  it('decodes CAVOK, AUTO, RVR, trends and stops at remarks', () => {
    const d = decodeMetar('METAR ESGG 200650Z AUTO 00000KT CAVOK R21/0600V1200U 02/01 Q1030 TEMPO FM0800 0800 FG RMK XYZ');
    expect(d.auto).toBe(true);
    expect(d.wind).toBe('Calm');
    expect(d.cavok).toBe(true);
    expect(d.rvr).toEqual(['Runway 21: 600 m to 1200 m, improving']);
    expect(d.trend).toEqual(['Temporarily from 08:00 UTC: Visibility 800 m · Fog']);
    expect(d.unparsed).toEqual([]);
  });

  it('decodes US units and lists what it cannot read', () => {
    const d = decodeMetar('METAR KJFK 201751Z 31015KT 1 1/2SM -SN OVC008 M02/M04 A2992 ZZZ RMK AO2');
    expect(d.visibility).toBe('1 1/2 SM');
    expect(d.visibilityM).toBe(2414);
    expect(d.qnh).toBe('29.92 inHg (1013 hPa)');
    expect(d.unparsed).toEqual(['ZZZ']);
  });

  it('skips elements an automatic station could not report', () => {
    const d = decodeMetar('METAR EHSG 201255Z COR AUTO /////KT 9999 // ////// BKN033/// 02/01 Q1030 RE// W12/H13');
    expect(d.corrected).toBe(true);
    expect(d.unparsed).toEqual([]);
  });
});

describe('decodeTaf', () => {
  const now = new Date(Date.UTC(2026, 10, 20, 12, 0));

  it('splits a TAF into periods with the conditions in effect for each', () => {
    const d = decodeTaf(
      'TAF ESSA 201100Z 2012/2112 24010KT 9999 SCT030 BECMG 2015/2017 BKN012 TEMPO 2018/2024 3000 -RA BKN008 '
      + 'PROB30 TEMPO 2100/2106 0800 FG FM210600 30015G25KT CAVOK', null, now);
    expect(d.validFrom?.toISOString()).toBe('2026-11-20T12:00:00.000Z');
    expect(d.validTo?.toISOString()).toBe('2026-11-21T12:00:00.000Z');
    expect(d.periods.map(p => [p.kind, p.label, p.category])).toEqual([
      ['BASE', 'Initially', 'VFR'],
      ['BECMG', 'Becoming', 'MVFR'],
      ['TEMPO', 'Temporarily', 'IFR'],
      ['PROB', '30% chance, temporarily', 'LIFR'],
      ['FM', 'From', 'VFR'],
    ]);
    // Becoming keeps the earlier wind and visibility.
    expect(summarise(d.periods[1].effective)).toEqual(['Wind from 240° at 10 kt', 'Visibility 10 km or more', 'Broken at 1,200 ft']);
    // FM ends the base period.
    expect(d.periods[0].to?.toISOString()).toBe('2026-11-21T06:00:00.000Z');
    expect(d.unparsed).toEqual([]);
  });

  it('handles a validity that ends at hour 24 and runs over a month end', () => {
    const d = decodeTaf('TAF ESSB 301700Z 3018/0124 VRB03KT 9999 NSC', null, new Date(Date.UTC(2026, 10, 30, 17, 5)));
    expect(d.validFrom?.toISOString()).toBe('2026-11-30T18:00:00.000Z');
    expect(d.validTo?.toISOString()).toBe('2026-12-02T00:00:00.000Z');
  });

  it('reads temperature and wind shear groups', () => {
    const d = decodeTaf('TAF KJFK 201120Z 2012/2118 31012KT P6SM FEW250 WS020/27040KT TX08/2019Z TN02/2111Z', null, now);
    expect(d.periods[0].category).toBe('VFR');
    expect(d.periods[0].extras).toEqual([
      'Low-level wind shear at 2,000 ft: 270° at 40 kt',
      'High of 8 °C Fri 19Z',
      'Low of 2 °C Sat 11Z',
    ]);
  });
});

it('formats UTC ranges', () => {
  const at = (d: number, h: number) => new Date(Date.UTC(2026, 10, d, h));
  expect(formatUtcRange(at(20, 12), at(20, 18))).toBe('Fri 12–18Z');
  expect(formatUtcRange(at(20, 22), at(21, 6))).toBe('Fri 22Z – Sat 06Z');
  expect(formatUtcRange(at(20, 18), at(21, 0))).toBe('Fri 18–24Z');
});

describe('tafStatus', () => {
  const taf = decodeTaf('TAF ESSA 201100Z 2012/2112 24010KT 9999 SCT030 TEMPO 2018/2024 3000 -RA', null, new Date(Date.UTC(2026, 10, 20, 11, 5)));
  const at = (d: number, h: number) => Date.UTC(2026, 10, d, h);

  it('is not yet valid before, active during and expired after the validity', () => {
    expect(tafStatus(taf, at(20, 11))).toEqual({ state: 'upcoming', label: 'Not yet valid', detail: 'starts Fri 12Z' });
    expect(tafStatus(taf, at(20, 15))).toEqual({ state: 'active', label: 'Active', detail: 'valid until Sat 12Z' });
    expect(tafStatus(taf, at(21, 12))).toEqual({ state: 'expired', label: 'Expired', detail: 'ran out Sat 12Z' });
  });

  it('knows when it was issued, and which periods are in force', () => {
    expect(taf.issued?.toISOString()).toBe('2026-11-20T11:00:00.000Z');
    expect(taf.periods.map(p => periodIsNow(p, at(20, 19)))).toEqual([true, true]);
    expect(taf.periods.map(p => periodIsNow(p, at(20, 13)))).toEqual([true, false]);
  });

  it('reports a cancelled forecast', () => {
    expect(tafStatus(decodeTaf('TAF AMD ESSA 201300Z 2012/2112 CNL'), at(20, 13)).state).toBe('cancelled');
  });
});
