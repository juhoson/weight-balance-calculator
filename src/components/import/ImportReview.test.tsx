import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ImportReview from './ImportReview';
import AddAircraftPage from './AddAircraftPage';
import { ApiError, confirmImport, previewImport } from '../../api/backend';
import { aircraftData } from '../../data/aircraftData';
import { specFromAircraftData } from '../../lib/aircraftSpec';
import type { AirframeImportRequest, Deviation, ImportPreviewResponse } from '../../types/airframeImport';

jest.mock('../../api/backend', () => {
  const actual = jest.requireActual('../../api/backend');
  return { ...actual, confirmImport: jest.fn(), previewImport: jest.fn(), fetchStandard: jest.fn() };
});
let mockUser: { id: number; email: string; displayName: string } | null = { id: 1, email: 'p@example.com', displayName: 'Pilot' };
jest.mock('../../api/useAuth', () => ({ useAuth: () => ({ user: mockUser, signOutReason: null }) }));
// Recharts needs a real layout engine; the chart itself is not under test here.
jest.mock('./EnvelopeComparisonChart', () => () => <div data-testid="envelope-chart" />);

const mockedConfirm = confirmImport as jest.MockedFunction<typeof confirmImport>;
const mockedPreview = previewImport as jest.MockedFunction<typeof previewImport>;

const spec = specFromAircraftData('PA28-161 (SE-KMI)', aircraftData['PA28-161 (SE-KMI)']);

const request: AirframeImportRequest = {
  registration: 'se-xyz',
  emptyWeightKg: 680,
  emptyArmM: 2.13,
  source: 'MANUAL',
  spec,
};

const deviation = (over: Partial<Deviation>): Deviation => ({
  field: 'mtow',
  label: 'MTOW',
  unit: 'kg',
  standardValue: 1055,
  importedValue: 1100,
  difference: 45,
  percentDifference: 4.27,
  severity: 'ALERT',
  permissive: true,
  typeLevel: true,
  message: 'MTOW: 1100 kg imported vs 1055 kg standard (+45 kg, +4.3%). More permissive than the standard.',
  ...over,
});

const mtowAlert = deviation({});
const armAlert = deviation({
  field: 'stations.baggage.arm', label: 'Baggage arm', unit: 'm', standardValue: 3.63, importedValue: 3.71,
  difference: 0.08, percentDifference: 2.2, permissive: false, message: 'Baggage arm: 3.71 m imported vs 3.63 m.',
});
const envelopeWarning = deviation({
  field: 'envelope.points[1].weight', label: 'Envelope point 1 weight', standardValue: 750, importedValue: 700,
  difference: -50, percentDifference: -6.67, severity: 'WARNING', permissive: false, message: 'Envelope point 1 weight: 700 kg imported vs 750 kg.',
});
const fuelInfo = deviation({
  field: 'performance.fuelConsumption[65%].litersPerHour', label: '65% power fuel flow', unit: 'L/h',
  standardValue: 33.3, importedValue: 34, difference: 0.7, percentDifference: 2.1, severity: 'INFO', permissive: false,
  message: '65% power fuel flow: 34 L/h imported vs 33.3 L/h standard.',
});

const preview = (over: Partial<ImportPreviewResponse> = {}): ImportPreviewResponse => ({
  standard: { id: 1, code: 'PA28-161', name: 'Piper PA-28-161', status: 'CURATED', aiModel: null, aiNotes: null },
  standardSpec: spec,
  deviations: [mtowAlert, armAlert, envelopeWarning, fuelInfo],
  matchesStandard: false,
  alertsRequiringAcknowledgement: ['mtow', 'stations.baggage.arm'],
  referenceNotice: null,
  ...over,
});

function renderReview(p: ImportPreviewResponse = preview(), handlers: Partial<React.ComponentProps<typeof ImportReview>> = {}) {
  const props = {
    request,
    preview: p,
    onBack: jest.fn(),
    onSaved: jest.fn(),
    onPreviewChanged: jest.fn(),
    ...handlers,
  };
  const utils = render(<ImportReview {...props} />);
  return { ...utils, props };
}

beforeEach(() => {
  mockedConfirm.mockReset();
  mockedPreview.mockReset();
});

describe('ImportReview', () => {
  it('lists alerts, warnings and minor differences separately', () => {
    renderReview();
    expect(screen.getByRole('heading', { name: 'Confirm before saving' })).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(screen.getByText('More permissive')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Worth checking' })).toBeInTheDocument();
    expect(screen.getByText('Envelope point 1 weight')).toBeInTheDocument();
    expect(screen.getByText('1 minor difference')).toBeInTheDocument();
    expect(screen.getByTestId('envelope-chart')).toBeInTheDocument();
    expect(screen.getByText(/Compared with/)).toHaveTextContent('Compared with');
    expect(screen.getByText('Curated standard')).toBeInTheDocument();
  });

  it('keeps saving disabled until every alert is confirmed', async () => {
    const user = userEvent.setup();
    mockedConfirm.mockResolvedValue({ airframeId: 7, aircraftTypeId: 9, usesStandard: false, acknowledgedAlerts: 2 });
    const { props } = renderReview();

    const save = screen.getByRole('button', { name: 'Save SE-XYZ' });
    expect(save).toBeDisabled();
    expect(screen.getByText('Confirm 2 more alerts to save')).toBeInTheDocument();

    const [first, second] = screen.getAllByRole('checkbox');
    await user.click(first);
    expect(save).toBeDisabled();
    expect(screen.getByText('Confirm 1 more alert to save')).toBeInTheDocument();

    await user.click(second);
    expect(save).toBeEnabled();
    await user.click(save);

    await waitFor(() => expect(props.onSaved).toHaveBeenCalledWith(expect.objectContaining({ airframeId: 7 })));
    expect(mockedConfirm).toHaveBeenCalledWith(expect.objectContaining({
      registration: 'se-xyz',
      acknowledgedAlerts: ['mtow', 'stations.baggage.arm'],
    }));
  });

  it('unchecking an alert blocks saving again', async () => {
    const user = userEvent.setup();
    renderReview(preview({ deviations: [mtowAlert], alertsRequiringAcknowledgement: ['mtow'] }));
    const box = screen.getByRole('checkbox');
    await user.click(box);
    expect(screen.getByRole('button', { name: 'Save SE-XYZ' })).toBeEnabled();
    await user.click(box);
    expect(screen.getByRole('button', { name: 'Save SE-XYZ' })).toBeDisabled();
  });

  it('shows the server re-check when it finds alerts that still need confirming', async () => {
    const user = userEvent.setup();
    const newAlert = deviation({ field: 'envelope.limits.aftCG', label: 'Aft CG limit', unit: 'm' });
    mockedConfirm.mockRejectedValue(new ApiError(422, 'Acknowledge every alert', {
      message: 'Acknowledge every alert',
      unacknowledged: ['envelope.limits.aftCG'],
      deviations: [mtowAlert, newAlert],
    }));
    const { props } = renderReview(preview({ deviations: [mtowAlert], alertsRequiringAcknowledgement: ['mtow'] }));

    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Save SE-XYZ' }));

    await waitFor(() => expect(props.onPreviewChanged).toHaveBeenCalled());
    const updated = (props.onPreviewChanged as jest.Mock).mock.calls[0][0] as ImportPreviewResponse;
    expect(updated.alertsRequiringAcknowledgement).toEqual(['mtow', 'envelope.limits.aftCG']);
    expect(screen.getByText(/still need confirming/)).toBeInTheDocument();
    expect(props.onSaved).not.toHaveBeenCalled();
  });

  it('explains a duplicate registration', async () => {
    const user = userEvent.setup();
    mockedConfirm.mockRejectedValue(new ApiError(409, 'You already have an aircraft SE-XYZ', null));
    renderReview(preview({ deviations: [], alertsRequiringAcknowledgement: [], matchesStandard: true }));
    await user.click(screen.getByRole('button', { name: 'Save SE-XYZ' }));
    expect(await screen.findByText('You already have an aircraft registered as SE-XYZ.')).toBeInTheDocument();
  });

  it('says so when everything matches the standard', () => {
    renderReview(preview({ deviations: [], alertsRequiringAcknowledgement: [], matchesStandard: true }));
    expect(screen.getByText('Everything matches the standard')).toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save SE-XYZ' })).toBeEnabled();
  });

  it('flags an AI-suggested reference as unverified and shows its notes', () => {
    renderReview(preview({
      standard: {
        id: 2, code: 'TB20', name: 'SOCATA TB20 Trinidad', status: 'AI_SUGGESTED',
        aiModel: 'claude-opus-5-5', aiNotes: 'Confidence: MEDIUM. Datum: firewall.',
      },
      referenceNotice: 'The reference values were suggested by AI (claude-opus-5-5) and have not been verified.',
    }));
    expect(screen.getByText('AI-suggested · unverified')).toBeInTheDocument();
    expect(screen.getByText(/have not been verified/)).toBeInTheDocument();
    expect(screen.getByText('What the AI said about these values')).toBeInTheDocument();
  });

  it('warns when there was nothing to compare against', () => {
    renderReview(preview({
      standard: null, standardSpec: null, deviations: [], alertsRequiringAcknowledgement: [],
      referenceNotice: 'No reference values are available for this model, so nothing could be compared.',
    }));
    expect(screen.getByText('No reference values for this model')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save SE-XYZ' })).toBeEnabled();
  });
});

describe('AddAircraftPage', () => {
  afterEach(() => { mockUser = { id: 1, email: 'p@example.com', displayName: 'Pilot' }; });

  it('asks to sign in first when signed out', () => {
    mockUser = null;
    render(<AddAircraftPage />);
    expect(screen.getByRole('heading', { name: 'Sign in to add aircraft' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Registration')).not.toBeInTheDocument();
  });

  it('goes from details to values to review, starting from a built-in aircraft', async () => {
    const user = userEvent.setup();
    mockedPreview.mockResolvedValue(preview({ deviations: [envelopeWarning], alertsRequiringAcknowledgement: [] }));
    render(<AddAircraftPage />);

    await user.type(screen.getByLabelText('Registration'), 'SE-ABC');
    await user.type(screen.getByLabelText(/Model code/), 'PA28-161');
    await user.type(screen.getByLabelText(/Basic empty weight/), '676,5');
    await user.type(screen.getByLabelText(/Empty weight arm/), '2.13');
    await user.click(screen.getByLabelText('Copy from a built-in aircraft'));
    await user.selectOptions(screen.getByLabelText('Built-in aircraft'), 'PA28-161 (SE-KMI)');
    await user.click(screen.getByRole('button', { name: 'Continue' }));

    expect(screen.getByRole('heading', { name: 'SE-ABC values' })).toBeInTheDocument();
    const mtow = screen.getByLabelText(/^MTOW/);
    expect(mtow).toHaveValue('1055');
    await user.clear(mtow);
    await user.type(mtow, '1100');

    await user.click(screen.getByRole('button', { name: 'Review' }));
    expect(await screen.findByRole('heading', { name: 'Review SE-ABC' })).toBeInTheDocument();

    const sent = mockedPreview.mock.calls[0][0];
    expect(sent.registration).toBe('SE-ABC');
    expect(sent.emptyWeightKg).toBe(676.5); // comma decimal accepted
    expect(sent.spec.code).toBe('PA28-161');
    expect(sent.spec.mtow).toBe(1100);
  });
});
