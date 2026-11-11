import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ClubAircraftAdmin from './ClubAircraftAdmin';
import {
  addClubAircraft,
  fetchStandard,
  listClubAircraft,
  listClubAircraftChanges,
  previewClubAircraftEdit,
  removeClubAircraft,
  updateClubAircraft,
} from '../../api/backend';
import { aircraftData } from '../../data/aircraftData';
import { specFromAircraftData } from '../../lib/aircraftSpec';
import type { AdminAccess } from '../../types/admin';
import type { ClubAircraft } from '../../types/clubAircraft';

jest.mock('../../api/backend', () => ({
  listClubAircraft: jest.fn(),
  listClubAircraftChanges: jest.fn(),
  addClubAircraft: jest.fn(),
  previewClubAircraftEdit: jest.fn(),
  updateClubAircraft: jest.fn(),
  removeClubAircraft: jest.fn(),
  fetchStandard: jest.fn(),
  previewImport: jest.fn(),
  confirmImport: jest.fn(),
  ApiError: class ApiError extends Error {},
}));
jest.mock('../import/EnvelopeComparisonChart', () => () => <div />);

const spec = specFromAircraftData('PA28-161 (SE-KMI)', aircraftData['PA28-161 (SE-KMI)']);
const kmi: ClubAircraft = {
  id: 5, registration: 'SE-KMI', typeKind: 'STANDARD', typeStatus: 'CURATED', verification: 'USER_CONFIRMED',
  weighedOn: '2024-03-01', emptyWeightKg: 712.5, emptyArmM: 2.18, spec: { ...spec, code: 'PA28-161' },
  weighings: 2, shownToPilots: 3, homeAirport: null, clubHomeAirport: 'ESSX',
  lastChange: { id: 1, airframeId: 5, registration: 'SE-KMI', action: 'ADDED', summary: 'Added SE-KMI', changedBy: 'Chief', changedAt: '2026-11-01T10:00:00Z' },
};
const access: AdminAccess = { siteAdmin: false, clubs: [{ id: 10, name: 'Club A' }], admin: true };

beforeEach(() => {
  jest.resetAllMocks();
  (listClubAircraft as jest.Mock).mockResolvedValue([kmi]);
  (listClubAircraftChanges as jest.Mock).mockResolvedValue([kmi.lastChange]);
});

it('lists the club\'s aircraft with how many pilots use them, and the change log', async () => {
  render(<ClubAircraftAdmin access={access} />);
  const row = (await screen.findByText('SE-KMI')).closest('li') as HTMLElement;
  expect(row).toHaveTextContent('Empty 712.5 kg at 2.18 m');
  expect(row).toHaveTextContent('2 weighings on record');
  expect(row).toHaveTextContent('Home ESSX · Shown by 3 pilots');
  expect(within(screen.getByRole('list', { name: 'Aircraft changes' })).getByText(/Added SE-KMI/)).toBeInTheDocument();
  expect(listClubAircraft).toHaveBeenCalledWith(10);
});

it('asks before removing, saying who loses the aircraft', async () => {
  const user = userEvent.setup();
  (removeClubAircraft as jest.Mock).mockResolvedValue(undefined);
  render(<ClubAircraftAdmin access={access} />);
  await user.click(await screen.findByRole('button', { name: 'Remove SE-KMI' }));
  expect(screen.getByText(/including the 3 pilots who show it now/)).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(() => expect(removeClubAircraft).toHaveBeenCalledWith(10, 5));
  expect(await screen.findByRole('status')).toHaveTextContent('SE-KMI was removed from Club A.');
  expect(listClubAircraft).toHaveBeenCalledTimes(2);
});

it('edits from the current values and saves only after the changes are confirmed', async () => {
  const user = userEvent.setup();
  (previewClubAircraftEdit as jest.Mock).mockResolvedValue({
    review: {
      standard: { id: 1, code: 'PA28-161', name: 'Piper PA-28-161', status: 'CURATED', aiModel: null, aiNotes: null },
      standardSpec: spec, deviations: [], matchesStandard: true, alertsRequiringAcknowledgement: [], referenceNotice: null,
    },
    changes: [{ field: 'emptyWeight', label: 'Empty weight', unit: 'kg', from: '712.5', to: '715' }],
  });
  (updateClubAircraft as jest.Mock).mockResolvedValue({ airframeId: 5, aircraftTypeId: 1, usesStandard: true, acknowledgedAlerts: 0 });
  render(<ClubAircraftAdmin access={access} />);

  await user.click(await screen.findByRole('button', { name: 'Edit SE-KMI' }));
  expect(screen.getByText('Edit SE-KMI')).toBeInTheDocument();
  const weight = screen.getByLabelText(/Basic empty weight/);
  await user.clear(weight);
  await user.type(weight, '715');
  await user.click(screen.getByRole('button', { name: 'Continue' }));
  // Starts from the aircraft's own values, not a fresh standard lookup.
  expect(fetchStandard).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Review' }));

  expect(await screen.findByText('What changes for pilots')).toBeInTheDocument();
  const changes = screen.getByRole('table');
  expect(within(changes).getByText('712.5 kg')).toBeInTheDocument();
  expect(within(changes).getByText('715 kg')).toBeInTheDocument();
  expect(previewClubAircraftEdit).toHaveBeenCalledWith(10, 5, expect.objectContaining({ emptyWeightKg: 715, registration: 'SE-KMI' }));

  const save = screen.getByRole('button', { name: 'Save SE-KMI' });
  expect(save).toBeDisabled();
  await user.click(screen.getByRole('checkbox', { name: /checked these changes/ }));
  await user.click(save);
  await waitFor(() => expect(updateClubAircraft).toHaveBeenCalledWith(10, 5, expect.objectContaining({ emptyWeightKg: 715 })));
  expect(await screen.findByText('SE-KMI updated for Club A')).toBeInTheDocument();
  expect(addClubAircraft).not.toHaveBeenCalled();

  await user.click(screen.getByRole('button', { name: 'Back to club aircraft' }));
  expect(await screen.findByText(/Shown by 3 pilots/)).toBeInTheDocument();
});
