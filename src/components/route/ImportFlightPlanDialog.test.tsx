import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { ImportFlightPlanDialog } from './ImportFlightPlanDialog';
import { lookupAirports } from '../../api/backend';
import { essx } from '../../lib/testRoute';
import type { AirportInfo } from '../../types/route';

jest.mock('../../api/backend', () => ({ lookupAirports: jest.fn() }));
const mockedLookup = lookupAirports as jest.MockedFunction<typeof lookupAirports>;

const at = (code: string, over: Partial<AirportInfo> = {}): AirportInfo => ({ ...essx, code, name: `${code} field`, ...over });
const empty = { from: '', to: '', via: [], auto: true };

it('previews the pasted route and uses it, leaving out what it cannot place', async () => {
  mockedLookup.mockResolvedValue([at('ESSX'), at('5930N01700E', { type: 'point', name: '59°30′N 017°00′E', runways: [] }), at('ESSA')]);
  const onImport = jest.fn();
  render(<ImportFlightPlanDialog route={empty} onImport={onImport} open onOpenChange={() => undefined}/>);

  fireEvent.change(screen.getByLabelText('Flight plan or route'), { target: { value: 'ESSX DCT 5930N01700E DCT TROSA DCT ESSA' } });
  fireEvent.click(screen.getByRole('button', { name: /Read plan/ }));

  expect(await screen.findByText('position 59°30′N 017°00′E')).toBeInTheDocument();
  expect(mockedLookup).toHaveBeenCalledWith(['ESSX', '5930N01700E', 'ESSA']);
  expect(screen.getByText('TROSA')).toBeInTheDocument();
  expect(screen.getByText(/named point/)).toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Use this route' }));
  expect(onImport).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESSA', via: ['5930N01700E'], auto: false });
});

it('keeps the current departure and arrival for a route without aerodromes', async () => {
  mockedLookup.mockResolvedValue([at('ESSX'), at('59N017E', { type: 'point', name: '59°00′N 017°00′E' }), at('ESGG')]);
  const onImport = jest.fn();
  render(<ImportFlightPlanDialog route={{ from: 'ESSX', to: 'ESGG', via: ['ESOW'], auto: false }} onImport={onImport} open onOpenChange={() => undefined}/>);
  fireEvent.change(screen.getByLabelText('Flight plan or route'), { target: { value: 'N0105VFR DCT 59N017E' } });
  fireEvent.click(screen.getByRole('button', { name: /Read plan/ }));
  expect(await screen.findByText(/current departure/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Use this route' }));
  expect(onImport).toHaveBeenCalledWith({ from: 'ESSX', to: 'ESGG', via: ['59N017E'], auto: false });
});

it('cannot be used when an end of the route is unknown', async () => {
  mockedLookup.mockResolvedValue([at('ESSX')]);
  render(<ImportFlightPlanDialog route={empty} onImport={jest.fn()} open onOpenChange={() => undefined}/>);
  fireEvent.change(screen.getByLabelText('Flight plan or route'), { target: { value: 'ESSX DCT XXXX' } });
  fireEvent.click(screen.getByRole('button', { name: /Read plan/ }));
  expect(await screen.findByText(/Not found, left out: XXXX/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Use this route' })).toBeDisabled();
});
