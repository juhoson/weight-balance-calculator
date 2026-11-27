import React from 'react';
import { render, screen } from '@testing-library/react';
import Hud from './Hud';

it('shows the speed, altitude, track and climb, and the bank around the aircraft when it is centred', () => {
  const { rerender } = render(<Hud speedKt={98.4} altFt={2480} vsFpm={-512} trackDeg={5} bankDeg={15.2} pathDeg={-3} centred/>);
  expect(screen.getByText('98')).toBeInTheDocument();
  expect(screen.getByText('2,480')).toBeInTheDocument();
  expect(screen.getByText('TRK 005°')).toBeInTheDocument();
  expect(screen.getByText('−510 fpm')).toBeInTheDocument();
  expect(screen.getByText('15° R')).toBeInTheDocument();
  // Not following the aircraft: no horizon (it wouldn't be round the aircraft).
  rerender(<Hud speedKt={98} altFt={2480} vsFpm={0} trackDeg={5} bankDeg={15} pathDeg={0} centred={false}/>);
  expect(screen.queryByText('15° R')).not.toBeInTheDocument();
});
