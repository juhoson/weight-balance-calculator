import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import AirportField from './AirportField';
import { searchAirports } from '../../api/backend';

jest.mock('../../api/backend', () => ({ searchAirports: jest.fn() }));
const search = searchAirports as jest.MockedFunction<typeof searchAirports>;

beforeAll(() => {
  global.ResizeObserver = class { observe() { /* */ } unobserve() { /* */ } disconnect() { /* */ } } as unknown as typeof ResizeObserver;
});

const essb = { code: 'ESSB', name: 'Stockholm Bromma', type: 'medium', lat: 59.35, lon: 17.94, country: 'SE', municipality: 'Stockholm', runways: [] };

test('tapped, the field empties for typing; the airport changes only when one is picked', async () => {
  jest.useFakeTimers();
  search.mockResolvedValue([essb] as never);
  const onChange = jest.fn();
  render(<AirportField label="Arrival" value="ESOW" valueName="Västerås" onChange={onChange}/>);
  const input = screen.getByLabelText('Arrival') as HTMLInputElement;
  expect(input.value).toBe('ESOW · Västerås');

  fireEvent.focus(input);
  expect(input.value).toBe('');
  expect(input.placeholder).toBe('ESOW · Västerås: type to change');
  fireEvent.change(input, { target: { value: 'Bromma' } });
  expect(onChange).not.toHaveBeenCalled();
  await act(async () => { jest.advanceTimersByTime(300); });
  jest.useRealTimers();
  await screen.findByText('Stockholm Bromma');
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(onChange).toHaveBeenCalledWith('ESSB', expect.objectContaining({ code: 'ESSB' }));
});

test('left without picking: the current airport is back', () => {
  const onChange = jest.fn();
  render(<AirportField label="Departure" value="ESOW" valueName="Västerås" onChange={onChange}/>);
  const input = screen.getByLabelText('Departure') as HTMLInputElement;
  fireEvent.focus(input);
  expect(input.value).toBe('');
  fireEvent.blur(input);
  expect(input.value).toBe('ESOW · Västerås');
  expect(onChange).not.toHaveBeenCalled();
});
