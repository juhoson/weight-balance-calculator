import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WeatherCard from './WeatherCard';
import { essx, metar } from '../../lib/testRoute';

it('borrows the nearest station for a field without its own report, and ranks runways', () => {
  render(<WeatherCard
    point={{ role: 'DEPARTURE', alongTrackNm: 0, station: { code: 'ESOW', name: 'Västerås', distanceNm: 4.3 }, metar: metar('ESOW'), taf: null }}
    airport={essx} maxCrosswindKt={17}/>);
  expect(screen.getByText(/weather from ESOW \(Västerås\), 4.3 NM away/)).toBeInTheDocument();
  expect(screen.getByText('VFR')).toBeInTheDocument();
  expect(screen.getByText('23', { selector: 'strong' })).toBeInTheDocument(); // best runway into a 250° wind
  expect(screen.queryByText(/demonstrated crosswind/)).not.toBeInTheDocument();
});

it('warns when the gust crosswind exceeds the aircraft\'s demonstrated crosswind', () => {
  render(<WeatherCard
    point={{ role: 'ARRIVAL', alongTrackNm: 0, station: { code: 'ESSX', name: 'x', distanceNm: 0 },
      metar: metar('ESSX', { windDirTrue: 110, windKt: 20, gustKt: 30, flightCategory: 'MVFR' }), taf: null }}
    airport={essx} maxCrosswindKt={17}/>);
  expect(screen.getByText(/Above this aircraft's demonstrated crosswind of 17 kt/)).toBeInTheDocument();
  expect(screen.getByText('MVFR')).toBeInTheDocument();
});

const summer = Date.UTC(2026, 6, 15, 12);
const winter = Date.UTC(2026, 10, 20, 12);
const northWind = (code: string) => metar(code, { raw: `METAR ${code} 201150Z 34012KT 9999 FEW030 04/02 Q1024`, windDirTrue: 340 });

it('leaves grass runways out of the best runway in winter, but not in summer', () => {
  const point = { role: 'DEPARTURE' as const, alongTrackNm: 0, station: { code: 'ESSX', name: 'x', distanceNm: 0 }, metar: northWind('ESSX'), taf: null };
  const { unmount } = render(<WeatherCard point={point} airport={essx} maxCrosswindKt={17} now={summer}/>);
  expect(screen.getByText('34', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: /across runway 34/ })).toBeInTheDocument();
  unmount();

  render(<WeatherCard point={point} airport={essx} maxCrosswindKt={17} now={winter}/>);
  expect(screen.getByText('05', { selector: 'strong' })).toBeInTheDocument();
  expect(screen.getByText(/Grass runway 16\/34 left\s+out for winter/)).toBeInTheDocument();
});

it('shows the reports decoded, with the raw text on request', () => {
  const raw = 'METAR ESSA 201150Z 25012KT 9999 -SHRA BKN020 04/02 Q1024 NOSIG';
  render(<WeatherCard
    point={{ role: 'ARRIVAL', alongTrackNm: 0, station: { code: 'ESSA', name: 'x', distanceNm: 0 }, metar: metar('ESSA', { raw }),
      taf: { station: 'ESSA', raw: 'TAF ESSA 201100Z 2012/2112 24010KT 9999 SCT030 TEMPO 2018/2024 3000 -RA BKN008',
        issuedAt: '2026-11-20T11:00:00Z', validFrom: null, validTo: null } }}
    maxCrosswindKt={17} now={winter}/>);
  expect(screen.getByText('Light rain showers')).toBeInTheDocument();
  expect(screen.getByText(/Broken at 2,000 ft/)).toBeInTheDocument();
  expect(screen.queryByText(raw)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Forecast \(TAF ESSA\)/ }));
  expect(screen.getByText('Temporarily Fri 18–24Z')).toBeInTheDocument();
  expect(screen.getByText('IFR')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: /Show raw METAR\/TAF/ }));
  expect(screen.getByText(raw)).toBeInTheDocument();
  expect(screen.getByLabelText('Raw TAF')).toBeInTheDocument();
});

it('links airports to their NOTAMs, but not en route stations', () => {
  const { unmount } = render(<WeatherCard
    point={{ role: 'DEPARTURE', alongTrackNm: 0, station: { code: 'ESOW', name: 'x', distanceNm: 4.3 }, metar: metar('ESOW'), taf: null }}
    airport={essx} maxCrosswindKt={17}/>);
  expect(screen.getByRole('link', { name: /NOTAMs \(LFV AROWeb\)/ })).toHaveAttribute('href', expect.stringContaining('NOTAM%20Sweden'));
  expect(screen.getByText(/Look for ESSX in the "ESAA FIR VFR 24hr" bulletin/)).toBeInTheDocument();
  unmount();

  render(<WeatherCard
    point={{ role: 'ENROUTE', alongTrackNm: 80, station: { code: 'ESMX', name: 'x', distanceNm: 6 }, metar: metar('ESMX'), taf: null }}
    maxCrosswindKt={17}/>);
  expect(screen.queryByRole('link', { name: /NOTAMs/ })).not.toBeInTheDocument();
});
