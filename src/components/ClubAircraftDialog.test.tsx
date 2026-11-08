import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClubAircraftDialog } from './ClubAircraftDialog';
import { fetchClubs, saveClubSelection } from '../api/backend';
import type { ClubView } from '../types/airframeImport';

jest.mock('../api/backend', () => ({ fetchClubs: jest.fn(), saveClubSelection: jest.fn() }));
const mockedClubs = fetchClubs as jest.MockedFunction<typeof fetchClubs>;
const mockedSave = saveClubSelection as jest.MockedFunction<typeof saveClubSelection>;

const clubs: ClubView[] = [
  {
    id: 1, name: 'Västerås Flygklubb', allAircraft: true, aircraft: [
      { id: 10, registration: 'SE-KMI', code: 'PA28-161', name: 'Piper PA-28-161', selected: true },
      { id: 11, registration: 'SE-MBC', code: 'DA40D', name: 'Diamond DA40 D', selected: true },
    ],
  },
  {
    id: 2, name: 'Hässlö Flygförening', allAircraft: false, aircraft: [
      { id: 20, registration: 'SE-GCG', code: 'PA18-150', name: 'Piper PA-18-150 Super Cub', selected: false },
    ],
  },
];

it('saves all of one club, or only the aircraft ticked', async () => {
  mockedClubs.mockResolvedValue(clubs);
  mockedSave.mockResolvedValue(clubs);
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(<ClubAircraftDialog open onOpenChange={onOpenChange} onSaved={onSaved}/>);

  await screen.findByText('Västerås Flygklubb');
  fireEvent.click(screen.getByLabelText(/SE-MBC/)); // untick one while "all" is on
  fireEvent.click(screen.getByLabelText(/SE-GCG/));
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));

  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect(mockedSave).toHaveBeenCalledWith({
    clubs: [
      { clubId: 1, allAircraft: false, airframeIds: [10] },
      { clubId: 2, allAircraft: false, airframeIds: [20] },
    ],
  });
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

it('says so when no clubs exist yet', async () => {
  mockedClubs.mockResolvedValue([]);
  render(<ClubAircraftDialog open onOpenChange={jest.fn()} onSaved={jest.fn()}/>);
  expect(await screen.findByText(/No clubs have been set up yet/)).toBeInTheDocument();
});
