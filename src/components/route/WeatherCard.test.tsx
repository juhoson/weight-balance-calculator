import React from 'react';
import { render, screen } from '@testing-library/react';
import WeatherCard from './WeatherCard';
import { essx, metar } from '../../lib/testRoute';

it('borrows the nearest station for a field without its own report, and ranks runways', () => {
  render(<WeatherCard
    point={{ role: 'DEPARTURE', alongTrackNm: 0, station: { code: 'ESOW', name: 'Västerås', distanceNm: 4.3 }, metar: metar('ESOW'), taf: null }}
    airport={essx} maxCrosswindKt={17}/>);
  expect(screen.getByText(/weather from ESOW \(Västerås\), 4.3 NM away/)).toBeInTheDocument();
  expect(screen.getByText('VFR')).toBeInTheDocument();
  expect(screen.getByText('23')).toBeInTheDocument(); // best runway into a 250° wind
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
