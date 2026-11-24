import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import AltitudeSuggestions from './AltitudeSuggestions';
import type { AltitudeOption } from '../../lib/suggestAltitude';

const option = (ft: number, minutes: number, over: Partial<AltitudeOption> = {}): AltitudeOption => ({
  ft, minutes, windKt: 0, problems: [], enters: [], notLevelOn: [], belowCloudFt: null, ...over,
});

it('shows the best altitudes and the most favourable wind, and picks one', () => {
  const onPick = jest.fn();
  const best = option(1500, 70, { windKt: -24, belowCloudFt: 1500 });
  const winds = option(6500, 52, { windKt: 20, enters: ['BIG TMA'] });
  render(<AltitudeSuggestions altitudeFt={1500} currentMinutes={70} maxFt={10000} onMaxChange={jest.fn()} onPick={onPick}
    suggestions={{ options: [best, winds], suggested: [best], bestWinds: winds, common: ['DEP CTR'], stepped: null }}/>);
  expect(screen.getByText(/Most favourable wind/).closest('li')).toHaveTextContent('6,500 ft · 0:52 (18 min faster) · tailwind 20 kt');
  expect(screen.getByText(/Most favourable wind/).closest('li')).toHaveTextContent('enters BIG TMA');
  expect(screen.getByText(/^Best/).closest('li')).toHaveTextContent('1,500 ft · 1:10 (now) · headwind 24 kt');
  expect(screen.getByRole('button', { name: 'Use 1,500 ft' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Use 6,500 ft' }));
  expect(onPick).toHaveBeenCalledWith(6500);
  expect(screen.getByText('At every altitude the flight enters DEP CTR.')).toBeInTheDocument();
});

it('says so while comparing, and when nothing is clear', () => {
  const props = { altitudeFt: 3000, currentMinutes: 60, maxFt: 10000, onMaxChange: jest.fn(), onPick: jest.fn() };
  const { rerender } = render(<AltitudeSuggestions {...props} suggestions={null}/>);
  expect(screen.getByText('Comparing altitudes…')).toBeInTheDocument();
  rerender(<AltitudeSuggestions {...props} suggestions={{ options: [option(3000, 60, { problems: ['icing possible'] })], suggested: [], bestWinds: null, common: [], stepped: null }}/>);
  expect(screen.getByRole('status')).toHaveTextContent('No altitude from 1,000 to 10,000 ft keeps clear of cloud, icing and terrain');
});

it('offers a plan with altitude changes when it beats every single altitude', () => {
  const onPickStepped = jest.fn();
  const best = option(4500, 70);
  const stepped = { ...option(4500, 62, { windKt: 10 }), holds: [{ fromNm: 25, toNm: 75, ft: 2000 }] };
  const props = {
    altitudeFt: 4500, currentMinutes: 70, maxFt: 10000, onMaxChange: jest.fn(), onPick: jest.fn(), onPickStepped,
    suggestions: { options: [best], suggested: [best], bestWinds: best, common: [], stepped },
  };
  const { rerender } = render(<AltitudeSuggestions {...props}/>);
  const row = screen.getByText('With altitude changes:').closest('li');
  expect(row).toHaveTextContent('4,500 ft, 2,000 ft at 25–75 NM · 1:02 (8 min faster) · tailwind 10 kt');
  fireEvent.click(screen.getByRole('button', { name: 'Use 4,500 ft with 1 altitude change' }));
  expect(onPickStepped).toHaveBeenCalledWith(4500, [{ fromNm: 25, toNm: 75, ft: 2000 }]);
  // The single 4,500 ft isn't in use once there are changes; the stepped one is.
  rerender(<AltitudeSuggestions {...props} holds={[{ fromNm: 25, toNm: 75, ft: 2000 }]}/>);
  expect(screen.getByRole('button', { name: 'Use 4,500 ft with 1 altitude change' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Use 4,500 ft' })).toBeEnabled();
});
