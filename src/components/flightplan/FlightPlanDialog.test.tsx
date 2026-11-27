import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import FlightPlanButton, { type FlightPlanDefaults } from './FlightPlanDialog';
import { loadFiledPlan } from '../../lib/icaoFlightPlan';

beforeAll(() => {
  global.ResizeObserver = class { observe() { /* */ } unobserve() { /* */ } disconnect() { /* */ } } as unknown as typeof ResizeObserver;
});
beforeEach(() => localStorage.clear());

const defaults: FlightPlanDefaults = {
  aircraftKey: 'SE-KMI', registration: 'SE-KMI', modelCode: 'PA28-161',
  departure: { code: 'ESOW', name: 'Stockholm Västerås', lat: 59.5894, lon: 16.6336 },
  destination: { code: 'ESSB', name: 'Stockholm Bromma', lat: 59.3544, lon: 17.9417 },
  via: [], offBlock: new Date(Date.UTC(2026, 10, 28, 9, 30)), speedKt: 107, levelFt: 3000, eetMinutes: 45,
  fuelLiters: 128, enduranceMinutes: 196, personsOnBoard: 2, pilot: 'A Pilot',
};

test('the plan from the planner: the ATS message, fuel, endurance and persons on board', () => {
  render(<FlightPlanButton defaults={defaults}/>);
  fireEvent.click(screen.getByRole('button', { name: /ICAO flight plan/ }));
  const message = screen.getByLabelText('ATS message');
  expect(message).toHaveTextContent('(FPL-SEKMI-VG');
  expect(message).toHaveTextContent('-P28A/L-SY/C');
  expect(message).toHaveTextContent('-N0107A030 DCT');
  expect(message).toHaveTextContent('-ESSB0045');
  const onBoard = screen.getByLabelText('On board');
  expect(onBoard).toHaveTextContent('128 L');
  expect(onBoard).toHaveTextContent('0316 (3 h 16 min)');
  expect(within(onBoard).getByText('2')).toBeInTheDocument();
  // More people: item 19 follows.
  fireEvent.change(screen.getByLabelText(/Persons on board/), { target: { value: '3' } });
  expect(screen.getByText(/E\/0316 P\/003/)).toBeInTheDocument();
});

test('marked as filed, with the number to close it on', () => {
  render(<FlightPlanButton defaults={defaults}/>);
  fireEvent.click(screen.getByRole('button', { name: /ICAO flight plan/ }));
  fireEvent.change(screen.getByLabelText(/Phone number to close/), { target: { value: '+46 8 123 456' } });
  fireEvent.click(screen.getByRole('button', { name: /I've filed it/ }));
  expect(loadFiledPlan()).toMatchObject({ destination: 'ESSB', closePhone: '+46 8 123 456' });
  expect(screen.getByRole('status')).toHaveTextContent('reminds you to close it after landing');
});

test('without a route there is nothing to file', () => {
  render(<FlightPlanButton defaults={null}/>);
  expect(screen.getByRole('button', { name: /ICAO flight plan/ })).toBeDisabled();
});
