import React from 'react';
import { act, render, screen } from '@testing-library/react';
import ZuluClock from './ZuluClock';

it('shows the UTC time and keeps ticking', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(Date.UTC(2026, 10, 20, 9, 5, 58)));
  render(<ZuluClock/>);
  expect(screen.getByLabelText('UTC time')).toHaveTextContent('09:05:58Z');
  act(() => { jest.advanceTimersByTime(3000); });
  expect(screen.getByLabelText('UTC time')).toHaveTextContent('09:06:01Z');
  jest.useRealTimers();
});
